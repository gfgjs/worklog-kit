// 生成式索引:`worklog index build` 扫 source universe 产出 INDEX.md / STATUS.md(§7.2)。
//
// 三条纪律,缺一即门面(§4.1 item4 / R5-M7 artifact contract):
//   1. **产物不入库**(C-3):列入 .gitignore,两分支根本不含派生文件 = 真零合并冲突;
//      因此本工具**没有 drift gate**——「生成物≠源即红」随产物不入库整体消解。
//   2. **字节确定**:同输入同版本 ⇒ 两次构建逐字节一致(§12「生成器幂等」判据)。
//      为此:输出恒 LF、无 BOM、无时间戳;排序用 cmpCodePoints(可执行契约,见下),
//      不用 localeCompare(随环境变)也不用 `<`(UTF-16 码元序,增补平面会排错)。
//   3. **绝不覆盖用户文件**:产物写进专用 outDir 并携带 marker 首行;同名既存文件
//      缺 marker 即整体拒绝——生成器的写入权止于自己声明过所有权的东西(同 D-023)。
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, rmdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { PKG_ROOT, walk, relPath } from './lib/fsutil.mjs';
import { DEFAULTS, generatedOutDir } from './lib/config.mjs';
import { classifyFile, collectGraphDocs, titleOf, h1Of, LINES_DIR, TRIO } from './lib/docmeta.mjs';
import { teamDeclOf, EVENT_FILE_RE } from './check-docs.mjs';
import { slugify, cmpCodePoints } from './lib/slug.mjs';
import { makeFenceSkipper, splitRow } from './lib/frontmatter.mjs';

const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

/**
 * 标题降级但跳过围栏(F-001)。分片/事件正文整体嵌入聚合视图时,`##` 级标题要降级
 * 让位给外层大纲——但围栏内的 `#` 行是示例(shell 注释、markdown 教程等),不是标题,
 * 降级会凭空改示例。B8 makeFenceSkipper 此前只收了节界扫描家族,正文变换仍 fence-blind。
 * body 已 LF 归一;逐行处理:围栏行(含定界行)原样透传,栏外才套 re→repl。
 * @param {RegExp} re 无 g/m 标志(逐行单次,^ 即行首) @param {string} repl 替换串
 */
function demoteHeadings(body, re, repl) {
  const skip = makeFenceSkipper();
  return body.split('\n').map((l) => (skip(l) ? l : l.replace(re, repl))).join('\n');
}

/** 所有权标记:产物首行以此开头。覆盖判定认它,不认文件名。 */
export const GENERATED_MARKER = '<!-- worklog-kit:generated';

// cmpCodePoints(§7.2 M-10 可执行契约)自阶段 7 迁驻 lib/slug.mjs(第七轮 P2:gate 的
// baseline 排序同用,lib 不反向 import src);此处转发保住既有 `from './build-index.mjs'` 引用。
export { cmpCodePoints };

/** 表格单元转义:`|` 会把 markdown 表切成两半(与 isValidId 拒绝 `|` 同一理由,但标题/线名是
 *  自由文本,只能转义)。**先转义反斜杠再竖线**(第七轮 P2):值本含 `\|` 时旧序产出
 *  `\\|` = 偶数反斜杠,splitRow 判真列界,幻影列整行错位。 */
const cell = (s) => (s == null || s === '' ? '—' : String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|'));

const header = (name) =>
  `${GENERATED_MARKER} ${name} — 由 \`worklog index build\` 生成;勿手改;产物不入库(C-3,列入 .gitignore) -->`;

/**
 * 任务目录扫描(P3 阶段 4:timeline 聚合与 STATUS「谁在做什么」的输入)。
 * 判据与门禁同一句话:含任一三件套文件的目录。事件列表按码点序 = 文件名字典序 = 时间序。
 */
function collectTasks(root, config) {
  const out = [];
  for (const sub of ['planning', 'worklogs']) {
    const base = join(root, config.docsDir, sub);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort(cmpCodePoints)) {
      const dir = join(base, name);
      if (!statSync(dir).isDirectory()) continue;
      if (![...TRIO].some((f) => existsSync(join(dir, f)))) continue;
      const evDir = join(dir, 'progress', 'events');
      const events = existsSync(evDir) ? readdirSync(evDir).sort(cmpCodePoints) : [];
      out.push({ sub, name, dir, decl: teamDeclOf(dir), events, evDir });
    }
  }
  return out;
}

/** `20260101T080000Z` → `2026-01-01 08:00:00Z`(纯字符串切片,字节确定) */
const prettyTs = (ts) =>
  `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`;

/**
 * 纯函数构建产物内容(不落盘;落盘走 writeArtifacts)。
 * 输入域 = source universe「索引生成」列(classifyFile.index):活区知识文档,
 * 不含 trio(草稿)、closeout(台账)、archive(冻结);
 * 另加 P3 聚合视图:team 任务的 `timeline/<任务目录名>.md`(设计件 §8)。
 * @returns {Record<string, string>} 键含 'INDEX.md'、'STATUS.md'、'timeline/*.md'
 */
export function buildArtifacts(root, config) {
  const graph = collectGraphDocs(root, config);
  const docs = graph.filter((g) => g.graph === true && classifyFile(config, g.rel).index);

  // ── INDEX.md:按 type 分节,节内按 (created, id) 码点序 ────────────────────
  const byType = new Map();
  for (const g of docs) {
    const type = g.data.type || '(无 type)';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(g);
  }
  // 节序 = config.types 声明序(实例真源),配置外的 type 殿后按码点序——全部确定
  const knownOrder = config.types.map((x) => x.name);
  const typeNames = [
    ...knownOrder.filter((n) => byType.has(n)),
    ...[...byType.keys()].filter((n) => !knownOrder.includes(n)).sort(cmpCodePoints),
  ];
  const index = ['# 文档索引', ''];
  for (const type of typeNames) {
    const rows = byType.get(type).sort((x, y) =>
      cmpCodePoints(x.data.created ?? '', y.data.created ?? '')
      || cmpCodePoints(x.data.id ?? '', y.data.id ?? '')
      || cmpCodePoints(x.rel, y.rel));
    index.push(`## ${type}`, '', '| id | 标题 | 线 | 状态 | created |', '|---|---|---|---|---|');
    for (const g of rows) {
      index.push(`| ${cell(g.data.id)} | ${cell(titleOf(g.data, g.body))} | ${cell(g.data.line)} | ${cell(g.data.status)} | ${cell(g.data.created)} |`);
    }
    index.push('');
  }

  // ── STATUS.md:按工作线聚合(slug 分组;「甲线(K)」与「甲线」同线,D-007)────
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entityRe = new RegExp(`^${esc(config.docsDir)}\\/${LINES_DIR}\\/([^/]+)\\.md$`);
  // 滚动状态分片(阶段 4 下半):不计入知识文档数,其**正文**整体嵌入所属线的分节——
  // 「现在做到哪」由此聚合(§4.1 item3),读者只看 STATUS.md 一处。
  const statusDir = (config.dispositions || []).find((d) => d.targetKind === 'line-status')?.statusDir;
  const shardRe = statusDir ? new RegExp(`^${esc(statusDir)}\\/([^/]+)\\.md$`) : null;
  const lines = new Map(); // slug → {entity?, shard?, docs: []}
  const at = (slug) => { if (!lines.has(slug)) lines.set(slug, { entity: null, shard: null, docs: [] }); return lines.get(slug); };
  for (const g of docs) {
    const em = entityRe.exec(g.rel);
    if (em) { at(em[1].normalize('NFC')).entity = g; continue; }
    const shm = shardRe?.exec(g.rel);
    if (shm) { at(shm[1].normalize('NFC')).shard = g; continue; }
    const slug = slugify(g.data.line ?? '');
    if (slug) at(slug).docs.push(g);
  }
  const status = ['# 工作线状态', ''];
  // ── 在施任务表(§4.3「谁在做什么」:ls planning/ 只见任务不见人,owner 列由此可见)──
  const tasks = collectTasks(root, config);
  const inFlight = tasks.filter((x) => x.sub === 'planning');
  if (inFlight.length) {
    status.push('## 在施任务', '', '| 任务 | mode | owner | 事件 |', '|---|---|---|---|');
    for (const x of inFlight) {
      const last = x.events.at(-1);
      const lm = last ? EVENT_FILE_RE.exec(last) : null;
      const evCell = x.decl.team ? `${x.events.length}${lm ? `(最后 ${prettyTs(lm[1])})` : ''}` : '—';
      status.push(`| \`${x.name}/\` | ${x.decl.team ? 'team' : 'solo'} | ${cell(x.decl.owner)} | ${evCell} |`);
    }
    status.push('');
  }
  for (const slug of [...lines.keys()].sort(cmpCodePoints)) {
    const L = lines.get(slug);
    const auth = L.docs
      .filter((g) => g.data.status === 'active' && g.data.authoritative === 'true')
      .map((g) => g.data.id ?? g.rel).sort(cmpCodePoints);
    const latest = L.docs.map((g) => g.data.created ?? '').filter(Boolean).sort(cmpCodePoints).at(-1);
    status.push(
      `## ${slug}`,
      '',
      L.entity ? `- 线实体:\`${L.entity.rel}\`(${L.entity.data.status ?? '—'})` : '- 线实体:**缺**(有文档引用此线,实体文件不存在——`worklog check` 会红)',
      `- 权威:${auth.length ? auth.join('、') : '—'}`,
      `- 文档:${L.docs.length} 篇${latest ? `;最近 created:${latest}` : ''}`,
      '',
    );
    if (L.shard) {
      // 剥分片自己的 H1(它在聚合视图里是小节,不是文档);其余标题**降两级**——
      // 分片里的 `## 待办` 原样嵌入会与 STATUS 的 per-line `## <线>` 同级,大纲当场断
      //(dogfood 首次真产物实测暴露)。源行尾归一 LF(字节契约)。降级跳围栏(F-001):
      // 围栏内 shell `# 注释` 不是标题,不该被加 `##`。
      const stripped = L.shard.body.replace(/\r\n/g, '\n').replace(/^\s*#\s[^\n]*\n+/, '');
      const body = demoteHeadings(stripped, /^(#{2,4})(\s)/, '$1##$2').trim();
      if (body) status.push('### 滚动状态', '', body, '');
    }
  }

  const finish = (name, arr) => `${header(name)}\n\n${arr.join('\n').replace(/\n+$/, '')}\n`;
  const out = { 'INDEX.md': finish('INDEX.md', index), 'STATUS.md': finish('STATUS.md', status) };

  // ── timeline/<任务目录名>.md:team 任务(在施 + 归档)的人可读时间线(设计件 §8)──
  // 事件按文件名字典序拼接(=时间序);节头 = 时刻·作者·H1 题,正文标题降一级
  //(与分片嵌入同款大纲纪律);文法外文件如实列出并标注——不静默截断(no silent caps)。
  for (const x of tasks) {
    if (!x.decl.team || !x.events.length) continue;
    const rows = [`# 时间线:${x.name}`, ''];
    for (const ev of x.events) {
      const raw = readFileSync(join(x.evDir, ev), 'utf8').replace(/\r\n/g, '\n');
      const m = EVENT_FILE_RE.exec(ev);
      if (!m) { rows.push(`## ⚠ 文法外:${ev}`, '', raw.trim(), ''); continue; }
      const title = h1Of(raw);
      // 正文标题降一级,跳围栏(F-001):围栏内 `#` 行是示例,不该被加 `#`。raw 已 LF 归一。
      const body = demoteHeadings(raw.replace(/^\s*#\s[^\n]*\n+/, ''), /^(#{1,5})(\s)/, '$1#$2').trim();
      rows.push(`## ${prettyTs(m[1])} · ${m[2]}${title ? ` · ${title}` : ''}${m[3] === '00' ? '(迁移引导)' : ''}`, '');
      if (body) rows.push(body, '');
    }
    out[`timeline/${x.name}.md`] = finish(`timeline/${x.name}.md`, rows);
  }
  return out;
}

/**
 * 落盘:所有权检查 → 全部写临时文件 → 统一 rename(同目录原子替换)。
 * 任何一步失败,旧产物原样保留、临时件清理——不留半新半旧的产物集。
 * 另写 manifest.json(工具名/版本/各产物 sha256):阶段 7「产物可复现」的比对锚点。
 */
export function writeArtifacts(root, config, files) {
  const outRel = generatedOutDir(config);
  const outAbs = join(root, ...outRel.split('/'));
  const manifest = { tool: PKG.name, version: PKG.version, files: {} };
  for (const [name, content] of Object.entries(files)) {
    manifest.files[name] = createHash('sha256').update(content).digest('hex');
  }
  const all = { ...files, 'manifest.json': `${JSON.stringify(manifest, null, 2)}\n` };
  for (const name of Object.keys(all)) {
    const p = join(outAbs, name);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    // 产物认 marker,manifest 认 tool 字段——缺所有权证据的同名文件一律拒绝覆盖
    const ours = name === 'manifest.json'
      ? (() => { try { return JSON.parse(raw).tool === PKG.name; } catch { return false; } })()
      : raw.startsWith(GENERATED_MARKER);
    if (!ours) return { error: `${outRel}/${name} 已存在且非本工具生成(缺所有权标记),拒绝覆盖;请移走该文件或改 index.outDir` };
  }
  mkdirSync(outAbs, { recursive: true });
  const tmps = [];
  try {
    for (const [name, content] of Object.entries(all)) {
      const dest = join(outAbs, ...name.split('/')); // timeline/*.md 带子目录
      mkdirSync(dirname(dest), { recursive: true });
      const tmp = `${dest}.tmp-${process.pid}`;
      writeFileSync(tmp, content);
      tmps.push([tmp, dest]);
    }
    for (const [tmp, dest] of tmps) renameSync(tmp, dest);
  } catch (e) {
    for (const [tmp] of tmps) rmSync(tmp, { force: true });
    return { error: e.message };
  }
  // 孤儿产物清理(tier B B9):任务改名/线退场后,旧 timeline/*.md 等带 marker 的产物
  // 不再出现在本次构建集却永久残留——旧视图与新视图并存,读者分不清哪份是真。
  // 只删**带所有权标记**且不在集合内的 .md;无 marker 的同名文件是用户的,照旧不碰。
  // 放在 rename 全部成功之后:写入失败时旧产物集原样保留,不先删后崩。
  const current = new Set(Object.keys(all));
  const pruned = [];
  for (const p of walk(outAbs, ['.md'])) {
    const rel = relPath(outAbs, p);
    if (current.has(rel)) continue;
    let raw; try { raw = readFileSync(p, 'utf8'); } catch { continue; }
    if (!raw.startsWith(GENERATED_MARKER)) continue;
    rmSync(p, { force: true });
    pruned.push(`${outRel}/${rel}`);
  }
  // 清空壳子目录(如 timeline 全部被清):rmdirSync 非递归,残留内容(用户文件)即留目录
  for (const name of readdirSync(outAbs)) {
    const d = join(outAbs, name);
    try { if (statSync(d).isDirectory() && readdirSync(d).length === 0) rmdirSync(d); } catch { /* 竞态/非空:留 */ }
  }
  return { written: Object.keys(all).map((n) => `${outRel}/${n}`), pruned };
}

/** `worklog index build` 入口。invariant 档拒绝:改档是数据布局迁移(R3-3),不是顺手预览。 */
export function main({ root, config, t }) {
  if ((config.index?.mode || 'invariant') !== 'generated') {
    console.error(t('build.invariantMode'));
    return 2;
  }
  const r = writeArtifacts(root, config, buildArtifacts(root, config));
  if (r.error) { console.error(t('build.refused', { msg: r.error })); return 2; }
  for (const p of r.written) console.log(t('build.wrote', { path: p }));
  for (const p of r.pruned ?? []) console.log(t('build.pruned', { path: p }));
  console.log(t('build.done', { outDir: generatedOutDir(config) }));
  return 0;
}

// ── selftest ────────────────────────────────────────────────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-build: ${name}`); if (!cond) failed++; };

  // 1. 比较器契约:码点序 ≡ UTF-8 字节序;UTF-16 码元序在增补平面给出**相反**答案
  assert(cmpCodePoints('a', 'b') < 0 && cmpCodePoints('a', 'ab') < 0 && cmpCodePoints('x', 'x') === 0, 'cmp 基本序与前缀序');
  assert(cmpCodePoints('一', '中') < 0, 'cmp CJK 按码点(U+4E00 < U+4E2D)');
  assert(cmpCodePoints('�', '😀') < 0, 'cmp 增补平面按码点(U+FFFD < U+1F600)');
  assert(('😀' < '�') === true, '负例前提成立:UTF-16 码元序恰好相反(`<` 不可用的实证)');

  const D = 'docs';
  const cfg = { ...DEFAULTS, docsDir: D, index: { ...DEFAULTS.index, mode: 'generated' } };
  const fm = (f) => `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# ${f.title ?? '标题'}\n`;
  const lineEnt = (slug) => fm({ id: `2026-01-01-线-${slug}`, status: 'active', type: 'line', line: slug, created: '2026-01-01', title: slug });
  const withRepo = (files, fn) => {
    const root = mkdtempSync(join(tmpdir(), 'wk-build-'));
    try {
      for (const [rel, content] of Object.entries(files)) {
        const abs = join(root, ...rel.split('/'));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      return fn(root);
    } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const FILES = {
    [`${D}/lines/甲线.md`]: lineEnt('甲线'),
    [`${D}/lines/乙线.md`]: lineEnt('乙线'),
    [`${D}/designs/a.md`]: fm({ id: '2026-01-02-甲案', status: 'active', type: 'design', line: '甲线', created: '2026-01-02', authoritative: 'true', title: '甲方案' }),
    // CRLF 源文档:输出字节契约不随源行尾变
    [`${D}/designs/b.md`]: fm({ id: '2026-01-03-乙案', status: 'draft', type: 'design', line: '甲线(K)', created: '2026-01-03' }).replaceAll('\n', '\r\n'),
    [`${D}/runbooks/r.md`]: fm({ id: '2026-01-01-手册', status: 'active', type: 'runbook', line: '乙线', created: '2026-01-01' }),
    [`${D}/designs/c.md`]: fm({ id: '2026-01-04-孤档', status: 'active', type: 'design', line: '丙线', created: '2026-01-04' }),
    // 第七轮 P2:title 本含字面 `\|`——cell 旧序转义产出偶数反斜杠,列界重开
    [`${D}/designs/esc.md`]: fm({ id: '2026-01-01-转义', status: 'active', type: 'design', line: '乙线', created: '2026-01-01', title: 'a\\|b' }),
    // 以下三类均不入索引(source universe):台账 / 草稿 / 冻结
    [`${D}/worklogs/t/closeout.md`]: fm({ id: '2026-01-01-台账', status: 'snapshot', type: 'closeout', line: '甲线', created: '2026-01-01' }),
    [`${D}/worklogs/t/task_plan.md`]: '# 草稿\n',
    [`${D}/worklogs/t/findings.md`]: '# 草稿\n',
    [`${D}/worklogs/t/progress.md`]: '# 草稿\n',
    [`${D}/archive/old.md`]: '---\nid: 2026-01-01-旧\n---\n\n> 📦 已归档。\n\n# 旧\n',
  };
  withRepo(FILES, (root) => {
    const files = buildArtifacts(root, cfg);
    const idx = files['INDEX.md'];
    const st = files['STATUS.md'];
    assert(idx.startsWith(GENERATED_MARKER) && st.startsWith(GENERATED_MARKER), '产物首行携带所有权 marker');
    assert(!/\r/.test(idx) && !/\r/.test(st), '输出恒 LF(源文档 CRLF 不渗透——字节契约不随源行尾变)');
    assert(idx.includes('| 2026-01-02-甲案 | 甲方案 | 甲线 | active | 2026-01-02 |'), 'INDEX 行含 id/标题/线/状态/created');
    assert(idx.indexOf('## design') < idx.indexOf('## runbook') === (cfg.types.findIndex((x) => x.name === 'design') < cfg.types.findIndex((x) => x.name === 'runbook')), 'INDEX 节序 = config.types 声明序');
    assert(idx.indexOf('2026-01-02-甲案') < idx.indexOf('2026-01-03-乙案'), 'INDEX 节内按 created 升序');
    assert(!idx.includes('台账') && !idx.includes('2026-01-01-旧'), 'closeout 台账与归档件不入 INDEX(§7.2 表)');
    const escRow = idx.split('\n').find((l) => l.includes('2026-01-01-转义'));
    assert(!!escRow && splitRow(escRow).length === 5, `INDEX 格内字面 \`\\|\` 不断幻影列(实得 ${escRow ? splitRow(escRow).length : '无行'} 列;P2 转义序)`);
    assert(st.includes('## 甲线') && st.includes('- 权威:2026-01-02-甲案'), 'STATUS 按线聚合并列出权威 id');
    assert(st.includes('文档:2 篇;最近 created:2026-01-03'), 'STATUS 字母尾「甲线(K)」归并进甲线(D-007)且统计正确');
    assert(st.includes('## 丙线') && st.includes('**缺**'), 'STATUS 如实标注缺实体的被引用线');
    // 幂等:同输入两次构建逐字节一致(§12 判据)
    const again = buildArtifacts(root, cfg);
    assert(again['INDEX.md'] === idx && again['STATUS.md'] === st, '生成器幂等:两次构建逐字节一致');
    // 落盘 + manifest hash 可复算(阶段 7 可复现的锚点)
    const w = writeArtifacts(root, cfg, files);
    assert(!w.error && w.written.length === 3, `写盘三件(INDEX/STATUS/manifest;实得 ${JSON.stringify(w)})`);
    const man = JSON.parse(readFileSync(join(root, '.worklog', 'generated', 'manifest.json'), 'utf8'));
    const sha = createHash('sha256').update(idx).digest('hex');
    assert(man.files['INDEX.md'] === sha && man.tool === 'worklog-kit', 'manifest sha256 与产物内容复算一致');
    // 覆盖自己的旧产物:合法(marker 在)
    const w2 = writeArtifacts(root, cfg, buildArtifacts(root, cfg));
    assert(!w2.error, '带 marker 的旧产物可被覆盖(正常重建)');
  });

  // 排序契约负例:同日两 id,码点序要求 U+FFFD 行在 U+1F600 行之前(UTF-16 `<` 会排反)
  withRepo({
    [`${D}/lines/x.md`]: lineEnt('x'),
    [`${D}/designs/e1.md`]: fm({ id: '😀号', status: 'active', type: 'design', line: 'x', created: '2026-01-01' }),
    [`${D}/designs/e2.md`]: fm({ id: '�号', status: 'active', type: 'design', line: 'x', created: '2026-01-01' }),
  }, (root) => {
    const idx = buildArtifacts(root, cfg)['INDEX.md'];
    assert(idx.indexOf('�号') < idx.indexOf('😀号'), 'INDEX 同日排序按码点(增补平面负例,UTF-16 序会排反)');
  });

  // 分片聚合:STATUS 嵌入 status/<slug>.md 正文(剥其 H1),分片不计入知识文档数
  withRepo({
    [`${D}/lines/x.md`]: lineEnt('x'),
    [`${D}/status/x.md`]: `---\nid: 2026-01-01-状态-x\nstatus: active\ntype: rolling-status\nline: x\ncreated: 2026-01-01\n---\n\n# x · 滚动状态\n\n- 现况:阶段 4 施工中\n\n## 待办\n\n- 事项\n\n\`\`\`md\n## 例标题\n\`\`\`\n`,
    [`${D}/designs/a.md`]: fm({ id: '2026-01-05-案', status: 'active', type: 'design', line: 'x', created: '2026-01-05' }),
  }, (root) => {
    const c2 = {
      ...cfg,
      types: [...cfg.types, { name: 'rolling-status', canBeAuthoritative: false }],
      dispositions: [{ name: 'todo', targetKind: 'line-status', statusDir: `${D}/status` }, ...cfg.dispositions.filter((d) => d.name !== 'todo')],
    };
    const st = buildArtifacts(root, c2)['STATUS.md'];
    assert(st.includes('### 滚动状态') && st.includes('- 现况:阶段 4 施工中') && !st.includes('# x · 滚动状态'), 'STATUS 嵌入分片正文并剥其 H1');
    assert(st.includes('#### 待办') && !st.includes('\n## 待办'), 'STATUS 嵌入时分片标题降两级(不与 per-line H2 抢大纲)');
    assert(st.includes('\n## 例标题') && !st.includes('#### 例标题'), 'STATUS 嵌入:围栏内示例标题不被降级(F-001 fence-blind)');
    assert(st.includes('- 文档:1 篇'), '分片不计入知识文档数(聚合视图另开小节)');
  });

  // P3 阶段 4:team 任务 → timeline 聚合 + STATUS 在施任务表(设计件 §8)
  withRepo({
    [`${D}/lines/x.md`]: lineEnt('x'),
    [`${D}/planning/2026-01-01-t/task_plan.md`]: '---\nmode: team\nowner: 小明\ncollaborators: alice\n---\n\n# p\n',
    [`${D}/planning/2026-01-01-t/findings.md`]: '# f\n',
    [`${D}/planning/2026-01-01-t/progress/events/20260101T080000Z-小明-00.md`]: '# 迁移引导事件\n\n旧进度全文。\n',
    [`${D}/planning/2026-01-01-t/progress/events/20260102T090000Z-alice-01.md`]: '# alice 加入\n\n## 细节\n\n内容。\n\n```sh\n# 部署脚本注释\n```\n',
  }, (root) => {
    const files = buildArtifacts(root, cfg);
    const tl = files['timeline/2026-01-01-t.md'];
    assert(!!tl && tl.startsWith(GENERATED_MARKER), 'team 任务产出 timeline 产物(带所有权 marker)');
    assert(tl.indexOf('小明') < tl.indexOf('alice'), 'timeline 事件按文件名字典序 = 时间序');
    assert(tl.includes('## 2026-01-01 08:00:00Z · 小明 · 迁移引导事件(迁移引导)'), '事件节头 = 时刻·作者·H1 题;seq 00 标注迁移引导');
    assert(tl.includes('### 细节') && !tl.includes('\n## 细节'), '事件正文标题降一级(不与事件节头抢大纲)');
    assert(tl.includes('\n# 部署脚本注释') && !tl.includes('## 部署脚本注释'), '事件正文:围栏内 shell `# 注释` 不被降级(F-001 fence-blind)');
    const st = files['STATUS.md'];
    assert(st.includes('## 在施任务') && st.includes('| `2026-01-01-t/` | team | 小明 | 2(最后 2026-01-02 09:00:00Z) |'),
      'STATUS 在施任务表含 mode/owner/事件数(§4.3「谁在做什么」)');
    assert(buildArtifacts(root, cfg)['timeline/2026-01-01-t.md'] === tl, 'timeline 幂等(逐字节一致)');
    const w = writeArtifacts(root, cfg, files);
    assert(!w.error && existsSync(join(root, '.worklog', 'generated', 'timeline', '2026-01-01-t.md')), 'timeline 落盘(嵌套子目录原子写)');
    const man = JSON.parse(readFileSync(join(root, '.worklog', 'generated', 'manifest.json'), 'utf8'));
    assert(!!man.files['timeline/2026-01-01-t.md'], 'timeline 计入 manifest sha256(可复现契约不留缺口)');
    // tier B B9:任务改名后旧 timeline 是孤儿——带 marker 的旧产物须被清理,
    // 无 marker 的用户文件在 outDir 里照旧不碰(所有权门护删除,与护覆盖同一判据)
    writeFileSync(join(root, '.worklog', 'generated', 'notes.md'), '# 我的手记(无 marker)\n');
    renameSync(join(root, D, 'planning', '2026-01-01-t'), join(root, D, 'planning', '2026-01-01-t2'));
    const w2 = writeArtifacts(root, cfg, buildArtifacts(root, cfg));
    assert(!w2.error && (w2.pruned ?? []).some((p) => p.endsWith('timeline/2026-01-01-t.md')), 'B9:改名任务的旧 timeline 被清理并报告');
    assert(!existsSync(join(root, '.worklog', 'generated', 'timeline', '2026-01-01-t.md'))
      && existsSync(join(root, '.worklog', 'generated', 'timeline', '2026-01-01-t2.md')), 'B9:盘上只剩新名产物');
    assert(readFileSync(join(root, '.worklog', 'generated', 'notes.md'), 'utf8').startsWith('# 我的手记'), 'B9:无 marker 的用户文件不被清理');
    // 线退场(团队任务整个消失)⇒ timeline 全清后空壳目录一并撤
    rmSync(join(root, D, 'planning', '2026-01-01-t2'), { recursive: true, force: true });
    const w3 = writeArtifacts(root, cfg, buildArtifacts(root, cfg));
    assert(!w3.error && !existsSync(join(root, '.worklog', 'generated', 'timeline')), 'B9:产物清空后空壳 timeline/ 目录一并撤');
  });

  // solo 在施任务也进「在施任务」表(owner 可见性不是 team 特权),事件列 —
  withRepo({
    [`${D}/lines/x.md`]: lineEnt('x'),
    [`${D}/planning/2026-01-01-s/task_plan.md`]: '---\nowner: gjs\n---\n\n# p\n',
    [`${D}/planning/2026-01-01-s/progress.md`]: '# 进度\n',
  }, (root) => {
    const st = buildArtifacts(root, cfg)['STATUS.md'];
    assert(st.includes('| `2026-01-01-s/` | solo | gjs | — |'), 'solo 任务进在施表(mode=solo,事件列 —)');
  });

  // 所有权:同名用户文件(无 marker)⇒ 整体拒绝,零写入
  withRepo({
    [`${D}/lines/x.md`]: lineEnt('x'),
    '.worklog/generated/INDEX.md': '# 我手写的索引,不是生成物\n',
  }, (root) => {
    const r = writeArtifacts(root, cfg, buildArtifacts(root, cfg));
    assert(!!r.error, '同名无 marker 文件拒绝覆盖');
    assert(readFileSync(join(root, '.worklog', 'generated', 'INDEX.md'), 'utf8').startsWith('# 我手写的'), '拒绝时用户文件一个字节不动');
    assert(!existsSync(join(root, '.worklog', 'generated', 'STATUS.md')), '拒绝是整体的:其余产物也零写入');
  });

  // outDir 可配
  withRepo({ [`${D}/lines/x.md`]: lineEnt('x') }, (root) => {
    const c2 = { ...cfg, index: { ...cfg.index, outDir: 'out/idx' } };
    const r = writeArtifacts(root, c2, buildArtifacts(root, c2));
    assert(!r.error && existsSync(join(root, 'out', 'idx', 'INDEX.md')), 'outDir 可配(out/idx)');
  });

  // invariant 档拒绝 build(改档是迁移不是开关,R3-3)
  withRepo({ [`${D}/lines/x.md`]: lineEnt('x') }, (root) => {
    const quietErr = console.error; console.error = () => {};
    let code; try { code = main({ root, config: { ...DEFAULTS, docsDir: D }, t: (k) => k }); } finally { console.error = quietErr; }
    assert(code === 2 && !existsSync(join(root, '.worklog', 'generated')), 'invariant 档 index build exit 2 且零写入');
  });

  console.log(failed ? `\n✗ build-index selftest 失败 ${failed} 项` : '\n✓ build-index selftest 全部通过');
  return failed ? 1 : 0;
}
