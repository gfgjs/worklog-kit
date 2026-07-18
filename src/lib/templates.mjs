// templates:消费仓「人和 AI 要读的副本」(.worklog/templates/* + 仓内 skill)的
// 渲染、哈希与漂移三态判定(F-004)。
//
// 问题形状:init 把包内模板 stamp 进消费仓(R4-02:引擎驻包,可读物驻仓),此后包
// 更新模板,消费仓副本不会自动跟进;而副本 ≠ 包渲染时,光看内容分不清「包前进了」
// 还是「用户定制了」。分辨靠基线:manifest 记录**工具最后一次写入内容**的 hash(D-030)。
//
// D-030 方向性安全:manifest.templates 里**绝不记录非工具写入的内容**——记了定制内容
// 的 hash,下次判定就会把定制当「未定制」,upgrade 随之覆写用户的修改。宁可漏刷
//(无基线报 unknown,只报不动),不可误刷。
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PKG_ROOT } from './fsutil.mjs';

/** 消费仓内本工具的家(原驻 init.mjs;init 再导出保持旧引用可用) */
export const KIT_DIR = '.worklog';
export const MANIFEST_REL = `${KIT_DIR}/manifest.json`;

const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

/** 受漂移治理的副本清单:包内源文件 → 消费仓相对路径 */
const MANAGED = [
  ['task_plan.md', `${KIT_DIR}/templates/task_plan.md`],
  ['findings.md', `${KIT_DIR}/templates/findings.md`],
  ['progress.md', `${KIT_DIR}/templates/progress.md`],
  ['event.md', `${KIT_DIR}/templates/event.md`], // team 写模型事件模板(P3 设计件 §2)
  ['closeout-template.md', `${KIT_DIR}/templates/closeout.md`],
];
/** 仓内 skill 副本(与模板同型:包渲染可再现,故同受三态判定) */
export const SKILL_REL = '.claude/skills/planning/SKILL.md';

/**
 * skill/手册/模板的 `docs/` 路径按配置派生(R5-M5 后半)。模板源文本统一以 `docs/`
 * 书写,stamp 时整体换成消费仓的 docsDir——自定义 docsDir 的仓拿到的指引若仍写
 * `docs/planning/`,就是一条走不通的指路(R4-02 同病)。docsDir 为默认值时恒等。
 */
export const withDocsDir = (s, config) => (config.docsDir === 'docs' ? s : s.replaceAll('docs/', `${config.docsDir}/`));

/** 当前包对该配置的全部受治理渲染:[{rel, content}]。skill 排最前(init --skill-only 只取它)。 */
export function renderManaged(config) {
  const out = [{ rel: SKILL_REL, content: withDocsDir(readFileSync(join(PKG_ROOT, 'skills', 'planning', 'SKILL.md'), 'utf8'), config) }];
  for (const [src, rel] of MANAGED) {
    out.push({ rel, content: withDocsDir(readFileSync(join(PKG_ROOT, 'templates', src), 'utf8'), config) });
  }
  return out;
}

/** 行尾归一后取 sha-256:checkout 的 autocrlf 转换不算漂移(内容等同,EOL 是 git 的事) */
const norm = (s) => s.replaceAll('\r\n', '\n');
export const hashContent = (s) => createHash('sha256').update(norm(s), 'utf8').digest('hex');

/** 读消费仓 manifest(D-017);缺失/损坏一律 null(判定退化为无基线,不抛) */
export function readManifest(root) {
  try { return JSON.parse(readFileSync(join(root, ...MANIFEST_REL.split('/')), 'utf8')); } catch { return null; }
}

/**
 * 三态判定(F-004;实为五值,ok/missing 是边界):
 *   ok         副本 ≡ 当前包渲染(EOL 归一后)
 *   missing    副本不存在(upgrade 可补齐)
 *   stale      副本 ≠ 渲染,但 ≡ manifest 基线 ⇒ 证明未定制,包前进了(upgrade 可带走)
 *   customized 副本 ≠ 渲染,≠ 基线 ⇒ 用户定制(工具不动)
 *   unknown    副本 ≠ 渲染,无基线 ⇒ 无从判定(只报不动;老 manifest 仓的存量形态)
 * @returns {{rel: string, state: string, content: string}[]} content = 当前包渲染
 */
export function classifyTemplates(root, config, manifest = undefined) {
  const m = manifest === undefined ? readManifest(root) : manifest;
  const recorded = m?.templates ?? {};
  return renderManaged(config).map(({ rel, content }) => {
    const abs = join(root, ...rel.split('/'));
    if (!existsSync(abs)) return { rel, state: 'missing', content };
    const cur = readFileSync(abs, 'utf8');
    if (norm(cur) === norm(content)) return { rel, state: 'ok', content };
    const base = recorded[rel];
    if (!base) return { rel, state: 'unknown', content };
    if (hashContent(cur) === base) return { rel, state: 'stale', content };
    return { rel, state: 'customized', content };
  });
}

/**
 * 组装 manifest 内容(D-017 + D-030)。templates 记账规则:
 *   - 副本缺失或 ≡ 当前渲染(即本次将写入/可安全收编)⇒ 记当前渲染 hash;
 *   - 副本相异:有旧基线则**原样保留**(维持 stale/customized 可判),无基线则不记(unknown 如实)。
 * 调用方语境:init 对将写入的全集调用;upgrade 在刷新变更集之上调用(refreshed 集合的
 * 副本落盘后 ≡ 渲染,故传 refreshed 让这些 rel 直接记渲染 hash,不看盘上旧内容)。
 */
export function buildManifest(root, config, today, prev = readManifest(root), refreshed = new Set()) {
  const templates = {};
  for (const { rel, content } of renderManaged(config)) {
    const abs = join(root, ...rel.split('/'));
    if (refreshed.has(rel) || !existsSync(abs) || norm(readFileSync(abs, 'utf8')) === norm(content)) {
      templates[rel] = hashContent(content);
    } else if (prev?.templates?.[rel]) {
      templates[rel] = prev.templates[rel];
    }
  }
  return `${JSON.stringify({
    tool: PKG.name,
    version: PKG.version,
    schemaVersion: config.schemaVersion,
    profile: config.profile,
    docsDir: config.docsDir,
    stampedAt: today,
    templates,
  }, null, 2)}\n`;
}

// ── selftest ─────────────────────────────────────────────────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => {
    if (cond) console.log(`  ✓ ${name}`);
    else { console.error(`  ✗ ${name}`); failed++; }
  };
  const config = { docsDir: 'docs', schemaVersion: 5, profile: 'strict' };
  const put = (root, rel, content) => {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };
  const withRepo = (fn) => {
    const root = mkdtempSync(join(tmpdir(), 'wk-tpl-'));
    try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const rendered = renderManaged(config);
  const one = rendered.find((r) => r.rel.endsWith('task_plan.md'));

  // 1. 渲染清单形状:skill + 五模板,全部仓相对路径
  assert(rendered.length === 6 && rendered[0].rel === SKILL_REL, '渲染清单 = skill + 五模板,skill 居首');
  assert(rendered.every((r) => !r.rel.startsWith('/') && r.content.length > 0), '渲染项全为相对路径且非空');

  // 2. docsDir 派生:自定义 docsDir 的渲染不含 `docs/` 指路
  {
    const alt = renderManaged({ ...config, docsDir: 'documentation' });
    assert(alt.every((r) => !r.content.includes('docs/')), '自定义 docsDir 渲染零 docs/ 回落');
  }

  // 3. 五态判定
  withRepo((root) => {
    // missing:什么都没写
    let states = Object.fromEntries(classifyTemplates(root, config, null).map((c) => [c.rel, c.state]));
    assert(Object.values(states).every((s) => s === 'missing'), '空仓全 missing');
    // ok:副本 ≡ 渲染(EOL 差异也算 ok)。先归一再翻转:CRLF checkout(如 autocrlf=true
    // 的 Windows clone / git archive 导出)下直接翻会造出 \r\r\n 混合行尾,测的就不是 EOL 差异了
    put(root, one.rel, norm(one.content).replaceAll('\n', '\r\n'));
    // unknown:副本相异 + 无基线
    const skill = rendered[0];
    put(root, skill.rel, `${skill.content}\n<!-- 本地改动 -->\n`);
    // stale:副本 ≡ 基线 ≠ 渲染
    const progress = rendered.find((r) => r.rel.endsWith('progress.md'));
    put(root, progress.rel, '旧版模板内容\n');
    // customized:副本 ≠ 基线 ≠ 渲染
    const findings = rendered.find((r) => r.rel.endsWith('findings.md'));
    put(root, findings.rel, '用户定制内容\n');
    const manifest = { templates: { [progress.rel]: hashContent('旧版模板内容\n'), [findings.rel]: hashContent('更旧的工具写入\n') } };
    states = Object.fromEntries(classifyTemplates(root, config, manifest).map((c) => [c.rel, c.state]));
    assert(states[one.rel] === 'ok', 'EOL 差异判 ok(autocrlf 不算漂移)');
    assert(states[skill.rel] === 'unknown', '相异 + 无基线判 unknown');
    assert(states[progress.rel] === 'stale', '≡ 基线 ≠ 渲染判 stale(可带走)');
    assert(states[findings.rel] === 'customized', '≠ 基线 ≠ 渲染判 customized(不动)');

    // 4. buildManifest 记账规则(D-030)
    const mf = JSON.parse(buildManifest(root, config, '2026-07-17', manifest));
    assert(mf.templates[one.rel] === hashContent(one.content), 'ok 副本收编为渲染 hash');
    assert(mf.templates[progress.rel] === hashContent('旧版模板内容\n'), 'stale 副本未刷新前保留旧基线');
    assert(mf.templates[findings.rel] === hashContent('更旧的工具写入\n'), 'customized 保留旧基线(维持可判)');
    assert(!(skill.rel in mf.templates), 'unknown 不记账(绝不记录非工具写入)');
    // refreshed 集合:视同已刷新,直接记渲染 hash
    const mf2 = JSON.parse(buildManifest(root, config, '2026-07-17', manifest, new Set([progress.rel])));
    assert(mf2.templates[progress.rel] === hashContent(progress.content), 'refreshed 集合记渲染 hash(与落盘后一致)');
    assert(mf.tool && mf.version && mf.stampedAt === '2026-07-17', 'manifest 头字段齐(D-017)');
  });

  // 5. 损坏 manifest 不抛:退化为无基线
  withRepo((root) => {
    put(root, MANIFEST_REL, '{ 坏 JSON');
    assert(readManifest(root) === null, '损坏 manifest 读为 null(判定退化,不抛)');
  });

  if (failed) { console.error(`✗ templates selftest:${failed} 项失败`); return 1; }
  console.log('✓ templates selftest 全部通过');
  return 0;
}
