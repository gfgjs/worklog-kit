// 索引不变量门(不变量门档;设计方案 §4.1 三档中最简的一档)。
// 通用化自 Scrollery tools/check_docs_index.mjs——但**退役字母登记表**:
// §4.1 已裁工作线从「中心分配字母 + 下一空闲 max+1」改为 lines/<slug> 实体(P2),
// 字母登记及其不变量随之作废,故本门只保留两组与语言/项目无关的结构不变量:
//   1. docs/README「目录职责」表 ↔ docs/ 顶层实际目录,双向一致。
//   2. worklogs:含三件套的归档目录 ↔ worklogs README「已归档任务」登记行,双向一致。
// 纯静态、环境自免疫(不依赖排序 collation、无着色、行尾归一)。
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { section, parseTables, escapeRe, makeFenceSkipper } from './lib/frontmatter.mjs';
import { DEFAULTS, CONFIG_NAME, indexHeadings } from './lib/config.mjs';
import { locOf } from './lib/violations.mjs';
import { reportViolations } from './lib/gate.mjs';

const TRIO = ['task_plan.md', 'findings.md', 'progress.md'];

/** 校验 root 的索引不变量;违规经 report(loc, msgFn) 上报 */
export function checkIndex(root, config, report) {
  const docs = join(root, config.docsDir);
  // 逐键兜底(index 对象浅合并:用户只声明 {mode} 时整对象兜底失效,e2e 实测崩过)
  const headings = indexHeadings(config);
  const readmePath = join(docs, 'README.md');
  const readmeLoc = `${config.docsDir}/README.md`;
  const repReadme = (rule, params) => report({ file: readmeLoc, rule, params });
  if (!existsSync(readmePath)) { repReadme('index.missing'); return; }
  const text = readFileSync(readmePath, 'utf8');

  // ── 1. config.dirs ↔ 目录职责表 ↔ 实际目录,三方一致(R5-M4)──
  // 三者各是一层:`config.dirs` 是**机器真源**(init 据它 stamp、门禁据它判),
  // README 表是展示面,实际目录是事实。原实现只比后两者 → 配置可以声明一个
  // 既不存在、也未登记的目录,而「局部双向」依然全绿,配置与仓悄悄分家。
  const actual = readdirSync(docs).filter((n) => statSync(join(docs, n)).isDirectory());
  // 词尾锚 `(?=\s|$)`:配置标题是精确契约,无锚时 `## 目录职责说明` 会被当「目录职责」节
  // 前缀误中——门在错的节里找表,找到了就假绿。
  const dirSec = section(text, new RegExp(`^##\\s*${escapeRe(headings.dirTableHeading)}(?=\\s|$)`));
  if (!dirSec) repReadme('index.dirTableSection', { heading: headings.dirTableHeading });
  else {
    const tables = parseTables(dirSec.join('\n'));
    const listed = (tables[0]?.rows || []).map((r) => /^`(.+)\/`$/.exec(r[0])?.[1]).filter(Boolean);
    for (const d of listed) if (!actual.includes(d)) repReadme('index.dirTableGhost', { dir: d });
    for (const d of actual) if (!listed.includes(d)) repReadme('index.dirTableUnlisted', { dir: d });
  }
  // config 这一腿只在**配置文件真实存在**时验:零配置起步走 DEFAULTS,而 DEFAULTS.dirs
  // 是愿望清单不是承诺——拿它报「缺目录」会把「还没建」误判成「漂移」,把
  // §7.5「渐进采纳」的入口堵死在第一条命令上。
  if (existsSync(join(root, CONFIG_NAME))) {
    const declared = config.dirs || [];
    for (const d of declared) if (!actual.includes(d)) report({ file: CONFIG_NAME, rule: 'index.dirConfigGhost', params: { dir: d } });
    for (const d of actual) if (!declared.includes(d)) report({ file: CONFIG_NAME, rule: 'index.dirConfigUnlisted', params: { dir: d } });
  }

  // ── 2. worklogs 登记双向一致 ──
  const wl = join(docs, 'worklogs');
  if (!existsSync(wl)) return;
  const wlReadmePath = join(wl, 'README.md');
  const wlLoc = `${config.docsDir}/worklogs/README.md`;
  const repWl = (rule, params) => report({ file: wlLoc, rule, params });
  // R5-M1:worklogs 目录存在即要求 README 入口。原实现「两者同时存在才校验」,
  // 等于把「删掉 README」变成让全部归档登记检查静默消失的办法——门的开关握在
  // 被检查者手里,这不是门。
  if (!existsSync(wlReadmePath)) { repWl('index.worklogsReadmeMissing'); return; }
  const secLines = section(readFileSync(wlReadmePath, 'utf8'), new RegExp(`^##\\s*${escapeRe(headings.archivedHeading)}(?=\\s|$)`));
  if (!secLines) { repWl('index.archivedSection', { heading: headings.archivedHeading }); return; }
  // N2(第七轮复核 §3):节行先过围栏掩码再判——section() 只对**节界**围栏感知,
  // 节内围栏示例里的 `` `<dir>/` `` 此前双向都咬:includes 假命中=伪造登记,
  // matchAll 撞不存在目录=幻影 regGhost。
  const skipFence = makeFenceSkipper();
  const secText = secLines.filter((l) => !skipFence(l)).join('\n');
  const archived = readdirSync(wl).filter((n) => {
    const p = join(wl, n);
    return statSync(p).isDirectory() && TRIO.some((f) => existsSync(join(p, f)));
  });
  for (const d of archived) {
    if (!secText.includes(`\`${d}/\``)) repWl('index.taskUnregistered', { dir: d });
  }
  // 反查:只认「日期前缀 + 尾斜杠」的反引号 token,避免摘要里普通路径误判
  for (const m of secText.matchAll(/`(\d{4}-\d{2}-\d{2}-[^`]+)\/`/g)) {
    if (!existsSync(join(wl, m[1]))) repWl('index.regGhost', { dir: m[1] });
  }
}

/** 门禁主入口 */
export function main({ root, config, t, args = [] }) {
  const violations = [];
  checkIndex(root, config, (v) => violations.push(v));
  const r = reportViolations({ violations, config, root, args, t });
  if (r.clean) console.log(t('index.pass'));
  else if (r.exit === 1) console.error(`\n${t('index.fail', { n: r.enforced })}`); // F-003:总行只数强制,豁免另列;exit 2 自带成因行
  return r.exit;
}

// ── selftest ────────────────────────────────────────────────────────────────
export function selftest() {
  const H = DEFAULTS.index; // 目录职责 / 已归档任务
  const mkReadme = (dirs) => `# 索引\n\n## ${H.dirTableHeading}\n\n| 目录 | 放什么 |\n|---|---|\n${dirs.map((d) => `| \`${d}/\` | x |`).join('\n')}\n\n## 维护规则\n- x\n`;
  const mkWl = (names) => `# worklogs\n\n## ${H.archivedHeading}\n\n${names.length ? names.map((n) => `- 任务 — 2026-01-01 — 摘要 — \`${n}/\``).join('\n') : '暂无。'}\n`;
  const cfg = (over = {}) => ({ ...DEFAULTS, ...over, docsDir: 'docs' });
  // config 腿只在配置文件真实存在时生效,故 fixture 须能写仓根文件:`@/` 前缀 = 仓根,
  // 其余 = docs/ 下。写 `@/.worklogrc.jsonc` 的内容不被解析(checkIndex 只查存在性),
  // 声明值经 cfgOverride 传入——本 selftest 测的是门,不是 loadConfig。
  const RC = (dirs) => JSON.stringify({ dirs }, null, 2);

  // [名称, expectBad, {路径 → 内容 | '<dir>' 占位建空目录}, cfgOverride]
  const cases = [
    ['ok-全一致', false, {
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '', 'worklogs/README.md': mkWl(['2026-01-01-t']),
      'worklogs/2026-01-01-t/task_plan.md': '# p\n',
    }, {}],
    ['bad-实际目录未登记', true, { 'README.md': mkReadme(['designs']), 'designs/<dir>': '', 'extra/<dir>': '' }, {}],
    ['bad-登记幽灵目录', true, { 'README.md': mkReadme(['designs', 'ghost']), 'designs/<dir>': '' }, {}],
    // tier B B4:标题粘连后缀不算命中(词尾锚)——「目录职责说明」曾被前缀误中为「目录职责」节
    ['bad-标题粘连后缀不算职责节(词尾锚)', true, {
      'README.md': mkReadme(['designs']).replace(`## ${H.dirTableHeading}`, `## ${H.dirTableHeading}说明`),
      'designs/<dir>': '',
    }, {}],
    // tier B B8:围栏里的假节标题不误中——fence-blind 的 section() 曾从示例处取节,
    // 读到示例表(或读不到表)后对真实目录误报
    ['ok-围栏内假节标题不误中(fence-aware section)', false, {
      'README.md': `\`\`\`md\n## ${H.dirTableHeading}\n\`\`\`\n\n${mkReadme(['designs'])}`,
      'designs/<dir>': '',
    }, {}],
    ['bad-归档任务未登记', true, {
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '', 'worklogs/README.md': mkWl([]),
      'worklogs/2026-01-01-t/task_plan.md': '# p\n',
    }, {}],
    // ── N2(第七轮复核 §3):登记节内围栏是示例,不算登记也不产幻影 ──
    ['bad-N2:登记只在围栏示例里=仍未登记(includes 曾假命中)', true, {
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '',
      'worklogs/README.md': mkWl([]).replace('暂无。', '暂无。\n\n```md\n- 任务 — 2026-01-01 — 摘要 — `2026-01-01-t/`\n```'),
      'worklogs/2026-01-01-t/task_plan.md': '# p\n',
    }, {}],
    ['ok-N2:围栏内幽灵 token 不报 regGhost(matchAll 曾产幻影误报)', false, {
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '',
      'worklogs/README.md': mkWl([]).replace('暂无。', '暂无。\n\n```md\n- 任务 — 2026-01-01 — 摘要 — `2026-09-09-ghost/`\n```'),
    }, {}],
    ['bad-登记引用幽灵归档目录', true, {
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '', 'worklogs/README.md': mkWl(['2026-01-02-x']),
    }, {}],
    ['bad-缺README', true, { 'designs/<dir>': '' }, {}],
    // ── R5-M1:worklogs 入口不可缺 ──
    ['bad-worklogs存在但缺README(R5-M1)', true, {
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '', 'worklogs/2026-01-01-t/task_plan.md': '# p\n',
    }, {}],
    // ── R5-M4:config.dirs 三方一致 ──
    ['ok-三方全一致(config↔README↔实际)', false, {
      '@/.worklogrc.jsonc': RC(['designs', 'worklogs']),
      'README.md': mkReadme(['designs', 'worklogs']),
      'designs/<dir>': '', 'worklogs/README.md': mkWl([]),
    }, { dirs: ['designs', 'worklogs'] }],
    ['bad-config声明幽灵目录(README↔实际却双向绿)', true, {
      '@/.worklogrc.jsonc': RC(['designs', 'ghost']),
      'README.md': mkReadme(['designs']), 'designs/<dir>': '',
    }, { dirs: ['designs', 'ghost'] }],
    ['bad-实际目录未入config(README↔实际却双向绿)', true, {
      '@/.worklogrc.jsonc': RC(['designs']),
      'README.md': mkReadme(['designs', 'extra']), 'designs/<dir>': '', 'extra/<dir>': '',
    }, { dirs: ['designs'] }],
    ['ok-无配置文件则不验config腿(零配置起步)', false, {
      'README.md': mkReadme(['designs']), 'designs/<dir>': '',
    }, { dirs: ['designs', 'decisions', 'runbooks'] }],
  ];
  let failed = 0;
  for (const [name, expectBad, files, over] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'wk-index-selftest-'));
    try {
      for (const [rel, content] of Object.entries(files)) {
        if (rel.endsWith('/<dir>')) { mkdirSync(join(root, 'docs', ...rel.slice(0, -6).split('/')), { recursive: true }); continue; }
        const abs = rel.startsWith('@/') ? join(root, ...rel.slice(2).split('/')) : join(root, 'docs', ...rel.split('/'));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      const got = [];
      checkIndex(root, cfg(over), (v) => got.push(v));
      const pass = expectBad ? got.length > 0 : got.length === 0;
      console.log(`${pass ? '✓' : '✗'} selftest-index: ${name}${pass ? '' : `(违规 ${got.length} 条:${got.map((v) => `${locOf(v)} ${v.rule}`).join(' | ') || '无'})`}`);
      if (!pass) failed++;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  console.log(failed ? `\n✗ check-index selftest 失败 ${failed} 项` : '\n✓ check-index selftest 全部通过');
  return failed ? 1 : 0;
}
