// e2e:在临时目录里造一个**非 Node 消费仓**,走完 init → start → closeout → 双门绿 →
// 制造违规变红的全程。
//
// 为什么必须有它(R5-M6/R4-09):本仓**就是包**(package == repo),于是消费者才会撞上的
// 断裂在自测里结构性不可见——包内 `templates/` 在这里永远存在、`.worklogrc.jsonc` 永远
// 已配好、bin 永远在本地。dogfood 越顺,遮蔽越深。这套 e2e 是唯一能看见消费路径的眼睛,
// 故它排在功能之前:先有安全网,再往上叠 P2。
//
// 「非 Node」是刻意的:首要消费者 Scrollery 是 Rust/Tauri 仓(L11),init 与 CI 都不得
// 假设 package.json 或 npm 依赖拓扑存在(D-017)。mkdtemp 给的空目录天然满足这条。
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main as init, detectProfile } from './init.mjs';
import { main as checkDocs } from './check-docs.mjs';
import { main as checkIndex } from './check-index.mjs';
import { main as upgrade } from './upgrade.mjs';
import { main as buildIndex } from './build-index.mjs';
import { main as baseline } from './baseline.mjs';
import { main as teamCmd } from './team.mjs';
import { main as closeoutCmd } from './closeout.mjs';
import { loadConfig, DEFAULTS, LATEST_SCHEMA_VERSION } from './lib/config.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { makeTranslator } from './lib/i18n.mjs';

const t = makeTranslator('zh');

/** 静默跑一条命令并取回退出码(e2e 关心判定,不关心刷屏) */
function quiet(fn) {
  const log = console.log, err = console.error;
  const out = [];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try { return { code: fn(), out: out.join('\n') }; } finally { console.log = log; console.error = err; }
}

/** 在 root 上跑一道门,返回退出码(配置非法记 2,与 CLI 同语义) */
function gate(root, which) {
  return quiet(() => {
    const { config, errors } = loadConfig(root);
    if (errors.length) return 2;
    return which === 'check' ? checkDocs({ root, config, t, args: [] }) : checkIndex({ root, config, t });
  }).code;
}

const withTemp = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'wk-e2e-'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-e2e: ${name}`); if (!cond) failed++; };

  // ── A. 空的非 Node 仓:init → 双门绿 → 全生命周期 → 违规变红 ──────────────
  withTemp((root) => {
    assert(!existsSync(join(root, 'package.json')), '起点是非 Node 仓(无 package.json,不得假设 npm 拓扑)');

    // init --dry-run 零写入:预览不该留下痕迹
    assert(quiet(() => init({ root, t, args: ['--dry-run'] })).code === 0 && readdirSync(root).length === 0, 'init --dry-run 零写入');

    assert(quiet(() => init({ root, t, args: [] })).code === 0, 'init 在空的非 Node 仓 exit 0');
    // 「init 完当场绿」是最低承诺:自己 stamp 出来的仓自己判不合法,产品第一分钟就崩
    assert(gate(root, 'check') === 0, 'fresh init 后 check 绿');
    assert(gate(root, 'index') === 0, 'fresh init 后 index 绿');
    // init 幂等不只是「重跑绿」:skip-exists 语义下若首次写了半截、二次 skip 就永远半截(§5)。
    // 故比对代表文件重跑前后逐字节一致 + 非零字节,把「半截文件永不自愈」纳入回归网。
    const readmeBefore = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
    assert(quiet(() => init({ root, t, args: [] })).code === 0 && gate(root, 'check') === 0, 'init 幂等重跑仍绿');
    const readmeAfter = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
    assert(readmeAfter.length > 0 && readmeAfter === readmeBefore, 'init 幂等重跑:docs/README.md 逐字节不变且非零字节');

    // 消费仓自包含(R4-02):skill 与手册指的路径必须真在这个仓里——
    // 包内 templates/ 在消费仓不存在,引它等于给出一条走不通的指路。
    for (const rel of [
      '.worklog/templates/task_plan.md', '.worklog/templates/findings.md',
      '.worklog/templates/progress.md', '.worklog/templates/event.md',
      '.worklog/templates/closeout.md',
      'docs/runbooks/closeout.md', '.claude/skills/planning/SKILL.md',
    ]) assert(existsSync(join(root, ...rel.split('/'))), `消费仓可达:${rel}`);

    const { config } = loadConfig(root);
    // R4-01:fixed 靶点门禁**验存**,配置声明而 init 不造 = 每个新仓复刻同一个死配置
    for (const d of config.dispositions.filter((x) => x.targetKind === 'fixed')) {
      assert(existsSync(join(root, ...d.target.split('/'))), `fixed 靶点已由 init 造出:${d.target}`);
    }

    // D-017:消费仓答得出「跑的是哪个版本的引擎」
    const mf = JSON.parse(readFileSync(join(root, '.worklog', 'manifest.json'), 'utf8'));
    assert(mf.tool === 'worklog-kit' && !!mf.version && mf.schemaVersion === config.schemaVersion && mf.docsDir === config.docsDir, 'manifest 记录工具名/版本/schemaVersion/docsDir');
    assert(Object.keys(mf.templates ?? {}).length === 6, 'manifest 六件副本基线记账(F-004/D-030:skill + 五模板)');
    const ci = readFileSync(join(root, '.github', 'workflows', 'docs-governance.yml'), 'utf8');
    assert(!ci.includes('<WORKLOG_KIT_SPEC>'), 'CI 模板版本占位符已替换');
    assert(ci.includes(`worklog-kit@${mf.version}`), 'CI 调用钉到精确包版本');
    // 只看真正会执行的 `- run:` 行:模板注释里写着「不用裸 npx worklog」「不跑 npm ci」,
    // 拿全文做断言会把**解释为什么不这么做的文字**当成这么做了。
    const runLines = ci.split(/\r?\n/).filter((l) => /^\s*-\s*run:/.test(l));
    assert(runLines.length > 0 && runLines.every((l) => l.includes(`worklog-kit@${mf.version}`)), '每条 CI 执行行都钉了精确包版本');
    assert(!runLines.some((l) => /npx\s+worklog\b/.test(l)), 'CI 执行行不含裸 npx worklog(版本浮动 = 门禁判定浮动)');
    assert(!runLines.some((l) => /npm\s+ci\b/.test(l)), 'CI 执行行不跑 npm ci(消费仓未必是 Node 项目)');
    // P3 阶段 5:按 profile 生成(R2-M4)+ merge-queue 要件化(R2-C6)+ CODEOWNERS 脚手架
    assert(ci.includes('本份为 strict 档') && !ci.includes('<PROFILE>'), 'CI 头注写实际 profile(strict,占位符已替换)');
    assert(!runLines.some((l) => /worklog baseline/.test(l)), 'strict 档 CI 无 baseline 步(该档无视豁免账)');
    assert(/^\s*merge_group:/m.test(ci), 'CI 对 merge_group 事件注册(merge queue 要件,R2-C6)');
    const coScaffold = readFileSync(join(root, '.github', 'CODEOWNERS'), 'utf8');
    assert(coScaffold.split(/\r?\n/).filter(Boolean).every((l) => l.startsWith('#')), 'CODEOWNERS 脚手架全注释 stamp(不知道账号就不写活行——带假 handle 的活行是谎)');
    assert(coScaffold.includes('docs/worklogs/'), 'CODEOWNERS 指引覆盖归档区(E6 的 review 面半边)');

    // ── 全生命周期:用**仓内 stamp 的模板**走 start → closeout ──
    // 任务名用中文(D-007:中文文件名一等公民)——这条路必须在 e2e 里真走一遍,
    // 否则「支持中文」只是文档里的声称。
    const TASK = '2026-01-01-中文任务名';
    const wlDir = join(root, 'docs', 'worklogs', TASK);
    mkdirSync(wlDir, { recursive: true });
    const fill = (name) => readFileSync(join(root, '.worklog', 'templates', name), 'utf8')
      .replaceAll('<任务目录名>', TASK) // id 占位符(v3 起 frontmatter 必填 id)
      .replaceAll('<任务名>', '中文任务名')
      .replaceAll('<收口日 YYYY-MM-DD>', '2026-01-01')
      .replaceAll('<YYYY-MM-DD>', '2026-01-01');
    writeFileSync(join(wlDir, 'task_plan.md'), fill('task_plan.md'));
    writeFileSync(join(wlDir, 'progress.md'), fill('progress.md'));
    writeFileSync(join(wlDir, 'findings.md'), `${fill('findings.md')}| F-001 | 一条值得留的发现 | experience |\n`);
    writeFileSync(join(wlDir, 'closeout.md'), fill('closeout.md'));
    // 开线 = 新建 lines/<slug>.md 实体(Q7;阶段 2 引用门):closeout 的 line 须可解析
    mkdirSync(join(root, 'docs', 'lines'), { recursive: true });
    writeFileSync(join(root, 'docs', 'lines', '中文任务名.md'),
      '---\nid: 2026-01-01-line-中文任务名\nstatus: active\ntype: line\nline: 中文任务名\ncreated: 2026-01-01\n---\n\n# 中文任务名\n\n一句话使命:e2e 生命周期演练线。\n');
    const wlReadme = join(root, 'docs', 'worklogs', 'README.md');
    const readmeArchived = readFileSync(wlReadme, 'utf8').replace('暂无。', `- 中文任务名 — 2026-01-01 — 摘要 — \`${TASK}/\``);
    writeFileSync(wlReadme, readmeArchived);
    assert(gate(root, 'check') === 0, '照仓内模板收口一个中文名任务后 check 绿');
    assert(gate(root, 'index') === 0, '登记后 index 绿');

    // ── 制造违规:门必须真的会红(绿得起也要红得出,才算门)──
    const co = join(wlDir, 'closeout.md');
    const coOk = readFileSync(co, 'utf8');
    const redThenGreen = (name, file, mutate, orig, which) => {
      writeFileSync(file, mutate(orig));
      const red = gate(root, which) === 1;
      writeFileSync(file, orig);
      assert(red && gate(root, which) === 0, name);
    };
    redThenGreen('违规:verified=no → check 红(改回即绿)', co, (s) => s.replace('| yes |', '| no |'), coOk, 'check');
    redThenGreen('违规:target 越出仓根 → check 红', co, (s) => s.replace('repo:docs/experience.md', 'repo:../outside.md'), coOk, 'check');
    redThenGreen('违规:候选未处置 → check 红', co, (s) => s.replace(/^\| F-001 .*$/m, ''), coOk, 'check');
    redThenGreen('违规:归档任务未登记 → index 红', wlReadme, (s) => s.replace(/^- 中文任务名.*$/m, ''), readmeArchived, 'index');

    // 三件套不齐(R5-M1):删掉 progress 应当红
    const prog = join(wlDir, 'progress.md');
    const progOk = readFileSync(prog, 'utf8');
    rmSync(prog);
    const red = gate(root, 'check') === 1;
    writeFileSync(prog, progOk);
    assert(red && gate(root, 'check') === 0, '违规:归档任务三件套不齐 → check 红');
  });

  // ── B. init 必须读**已存在的配置**(R4-10)────────────────────────────────
  withTemp((root) => {
    const custom = {
      ...DEFAULTS,
      docsDir: 'documentation',
      dispositions: DEFAULTS.dispositions.map((d) => (d.targetKind === 'fixed' ? { ...d, target: 'documentation/todo.md' } : d)),
    };
    writeFileSync(join(root, '.worklogrc.jsonc'), JSON.stringify(custom, null, 2));
    assert(quiet(() => init({ root, t, args: [] })).code === 0, '有配置的仓 init exit 0');
    // 原实现写死 { ...DEFAULTS },于是用户把 docsDir 改成别的、再跑一次 init,
    // 仍然 stamp 出 docs/ —— 配置说了话,init 没听。
    assert(existsSync(join(root, 'documentation', 'README.md')) && !existsSync(join(root, 'docs')), 'init 按已有配置的 docsDir stamp,不回落 docs/');
    assert(existsSync(join(root, 'documentation', 'todo.md')), 'fixed 靶点按配置落在自定义 docsDir 下');
    // R5-M5 后半:skill/手册/模板的路径指引按配置派生——自定义 docsDir 的仓若仍写
    // `docs/planning/`,就是一条走不通的指路(R4-02 同病)。
    // 无条件件(skill + 模板副本,路径不含 docsDir)先断言**存在**再验路径——
    // 原 existsSync-continue 会让「本应生成却缺席」静默跳过成假绿(§5)。
    for (const rel of [['.claude', 'skills', 'planning', 'SKILL.md'], ['.worklog', 'templates', 'closeout.md']]) {
      const p = join(root, ...rel);
      assert(existsSync(p), `自定义 docsDir 下无条件件已生成:${rel.at(-1)}`);
      assert(!readFileSync(p, 'utf8').includes('docs/'), `stamped ${rel.at(-1)} 不残留硬编码 docs/ 路径(R5-M5)`);
    }
    // runbooks 是条件件(仅 dirs 声明 runbooks 时 stamp):存在才验,缺席合法
    const rbP = join(root, 'documentation', 'runbooks', 'closeout.md');
    if (existsSync(rbP)) assert(!readFileSync(rbP, 'utf8').includes('docs/'), 'stamped runbook 不残留硬编码 docs/ 路径(R5-M5)');
    assert(gate(root, 'check') === 0 && gate(root, 'index') === 0, '自定义 docsDir 的 fresh init 双门绿');
  });

  // ── B2. 存量仓判据与 --profile(阶段 0)────────────────────────────────
  // 判据须**固定可测**,不得靠模糊目录存在性猜测:stamp 前 docsDir 里已有 .md ⇒ brownfield。
  withTemp((root) => {
    assert(detectProfile(root, 'docs') === 'strict', '空仓 ⇒ 判定 strict');
    mkdirSync(join(root, 'docs'), { recursive: true });
    assert(detectProfile(root, 'docs') === 'strict', '**空的** docs/ 仍判 strict(目录在不在说明不了任何事)');
    writeFileSync(join(root, 'docs', 'legacy.md'), '# 存量文档\n');
    assert(detectProfile(root, 'docs') === 'brownfield', '有既存 .md ⇒ 判定 brownfield');
    quiet(() => init({ root, t, args: [] }));
    assert(loadConfig(root).config.profile === 'brownfield', 'init 把判定结果写进 stamp 出的配置');
    assert(JSON.parse(readFileSync(join(root, '.worklog', 'manifest.json'), 'utf8')).profile === 'brownfield', 'manifest 记录实际 profile');
    // brownfield 未立账时行为同 strict:那篇存量坏文档照样红 —— 自动判档**不静默放松任何门**
    assert(gate(root, 'check') === 1, '自动判为 brownfield 但未立账 ⇒ 存量违规照样红');
  });
  withTemp((root) => {
    writeFileSync(join(root, '.gitkeep'), '');
    quiet(() => init({ root, t, args: ['--profile', 'brownfield'] }));
    assert(loadConfig(root).config.profile === 'brownfield', '--profile 显式覆盖自动判定');
  });
  withTemp((root) => {
    const r = quiet(() => init({ root, t, args: ['--profile', 'advisory'] }));
    // advisory 已被 D-002 砍掉(它是输出级别不是档位),不能悄悄接受
    assert(r.code === 2 && !existsSync(join(root, 'docs')), '--profile 值非法 ⇒ exit 2 且零写入');
  });

  // ── B3. 存量仓采纳全程五步(阶段 1)──────────────────────────────────────
  // 这条是本阶段实测挖出的洞的回归钉:存量仓 `init` 出来配置就是**最新版**,而它那堆旧文档
  // 一个 id 都没有。upgrade 若只做「推进版本号」,这里会答「已是最新版」直接退出 ——
  // 于是 idMissing 满屏、且**没有任何梯子**(baseline 按 D-013 结构上豁免不了它)。
  // 五步:init → check 红 → **upgrade 播种** → baseline 立账 → check 绿。
  withTemp((root) => {
    const legacy = join(root, 'docs', 'legacy.md');
    mkdirSync(join(root, 'docs'), { recursive: true });
    // 存量文档的真实形态:有 created(实测靶场 85 篇一篇不缺),但没 id、没 line、type 也不在枚举里
    writeFileSync(legacy, '---\nstatus: active\ntype: 旧型\ncreated: 2020-01-01\n---\n\n# 存量文档\n');
    quiet(() => init({ root, t, args: [] }));
    assert(loadConfig(root).config.profile === 'brownfield', '① init 自动判 brownfield');
    assert(loadConfig(root).fileVersion === LATEST_SCHEMA_VERSION, '  init stamp 的配置就是最新版(故此仓一次迁移都不需要,却极需对账)');
    assert(gate(root, 'check') === 1, '② 未处理 ⇒ check 红');

    assert(quiet(() => upgrade({ root, t, args: [] })).code === 0, '③ upgrade 在「已是最新版」的仓上仍干活(对账播种)');
    assert(parseFrontmatter(readFileSync(legacy, 'utf8')).data.id === '2020-01-01-legacy', '  存量文档拿到派生的 id');
    assert(quiet(() => upgrade({ root, t, args: [] })).code === 0, '  再跑一次幂等');

    const cfg = loadConfig(root).config;
    assert(quiet(() => baseline({ root, config: cfg, t, args: ['--update'] })).code === 0, '④ baseline --update 为剩下的人判债立账');
    assert(gate(root, 'check') === 0, '⑤ 五步走完 check 绿 —— 存量仓真能采纳(此前此路不通)');
  });

  // ── B5. F-002:brownfield 的 dirs 从实况派生,不抄愿望清单 ────────────────
  // 靶场实测:存量仓有自家命名的目录(refactor_<年份>/ 形态;fixture 用合成名),init stamp 的 config.dirs 抄默认
  // 清单漏收它,init 完 `index check` 当场红——自己 stamp 的仓自己判不合法。
  withTemp((root) => {
    mkdirSync(join(root, 'docs', 'legacy_2020'), { recursive: true });
    writeFileSync(join(root, 'docs', 'legacy_2020', 'note.md'),
      '---\nid: 2020-01-01-note\nstatus: active\ntype: design\nline: 存量治理\ncreated: 2020-01-01\n---\n\n# 存量笔记\n');
    quiet(() => init({ root, t, args: [] }));
    const cfg = loadConfig(root).config;
    assert(cfg.dirs.includes('legacy_2020'), 'init stamp 的 config.dirs 收编实况目录(F-002)');
    assert(gate(root, 'index') === 0, '收编后索引门三方一致即绿(此前此处必红)');
    assert(!existsSync(join(root, 'docs', 'legacy_2020', '.gitkeep')), '既存非空目录不塞 .gitkeep 占位(F-002 顺手修)');
    // P3 阶段 5:brownfield 档 CI 多一步 baseline 报告(报告模式恒 exit 0,只报不改账)
    const bfCi = readFileSync(join(root, '.github', 'workflows', 'docs-governance.yml'), 'utf8');
    assert(bfCi.includes('本份为 brownfield 档'), 'brownfield 仓的 CI 头注写实际 profile(R2-M4 按档生成)');
    assert(bfCi.split(/\r?\n/).some((l) => /^\s*-\s*run:.*worklog baseline$/.test(l)), 'brownfield 档 CI 含 baseline 报告步(钉版本)');
  });
  // 已有配置 = 用户真源:init 不改它,只对未收目录告警
  withTemp((root) => {
    quiet(() => init({ root, t, args: [] }));
    mkdirSync(join(root, 'docs', '自家目录'), { recursive: true });
    writeFileSync(join(root, 'docs', '自家目录', 'x.md'), '# x\n');
    const r = quiet(() => init({ root, t, args: [] }));
    assert(r.code === 0 && !loadConfig(root).config.dirs.includes('自家目录'), '已有配置不被 init 改写(用户真源)');
    assert(r.out.includes('自家目录'), '未收目录显式告警(而非静默留一个必红的仓)');
  });

  // ── B4. R4-11:仓根文件在消费仓路径上真被扫(auto 档)───────────────────────
  // fixture 证的是单元行为;这里证的是**消费者实际拿到的那份配置**真会扫仓根 ——
  // 二者是两件事,阶段 0 的教训就是后者只有 e2e 看得见。
  withTemp((root) => {
    writeFileSync(join(root, '.gitkeep'), '');
    quiet(() => init({ root, t, args: [] }));
    assert(loadConfig(root).config.sourceRoots === 'auto', 'init stamp 的配置是 auto 档(隐含并扫仓根文件)');
    assert(gate(root, 'check') === 0, 'fresh 仓仓根无坏引用 ⇒ 绿');
    writeFileSync(join(root, 'README.md'), '# 我的仓\n\n见 docs/根本不存在.md\n');
    assert(gate(root, 'check') === 1, '仓根 README 里的坏 docs 引用被抓到(此前 1a/1b 双盲)');
    writeFileSync(join(root, 'README.md'), '# 我的仓\n\n见 `docs/根本不存在.md`(行内代码是在谈论它,不是引用)\n');
    assert(gate(root, 'check') === 0, '行内代码里的同一个路径不算引用(与 1a 同一条规则)');
  });

  // ── B6+B7. P3 阶段 4:solo→team 迁移 + closeout 命令全链(设计件 §4/§6)────
  // 消费仓视角走完:开 solo 任务 → worklog team(迁移引导事件 + 候选 ID 补作者段)→
  // 门绿 → E3 负例 → 写收口判断件 → worklog closeout(翻转/迁移/登记/双门)→ 双门绿。
  // 任务名与 owner 全中文(D-007 一等公民必须在 e2e 真走)。
  withTemp((root) => {
    quiet(() => init({ root, t, args: [] }));
    const TASK = '2026-01-01-协作任务';
    const pl = join(root, 'docs', 'planning', TASK);
    mkdirSync(pl, { recursive: true });
    writeFileSync(join(pl, 'task_plan.md'), '# 计划\n\n| 决策 | 理由 | 候选 ID |\n|---|---|---|\n| d | r | D-001 |\n');
    writeFileSync(join(pl, 'findings.md'), '# 发现\n\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n| F-001 | x | experience |\n\n叙事里提及 F-001 的地方也要跟着改名。\n');
    writeFileSync(join(pl, 'progress.md'), '# 进度\n\n- 做了:F-001 相关排查。\n');
    assert(gate(root, 'check') === 0, '开一个 solo 在施任务后 check 仍绿');

    const tpBefore = readFileSync(join(pl, 'task_plan.md'), 'utf8');
    const dr = quiet(() => teamCmd({ root, config: loadConfig(root).config, t, args: [TASK, '--owner', '小明', '--dry-run'] }));
    assert(dr.code === 0 && readFileSync(join(pl, 'task_plan.md'), 'utf8') === tpBefore && !existsSync(join(pl, 'progress')), 'team --dry-run 零写入');
    assert(quiet(() => teamCmd({ root, config: loadConfig(root).config, t, args: ['协作任务', '--owner', '小明'] })).code === 0,
      'worklog team exit 0(剥日期前缀解析任务名 + 中文 owner)');
    const tp2 = readFileSync(join(pl, 'task_plan.md'), 'utf8');
    assert(/^mode: team$/m.test(tp2) && /^owner: 小明$/m.test(tp2), 'task_plan 声明 mode: team + owner');
    assert(tp2.includes('D-小明-001') && !/(?<![\w-])D-001(?![\w-])/.test(tp2), '决策表候选 ID 已补作者段(E5 的梯子)');
    const fnd2 = readFileSync(join(pl, 'findings.md'), 'utf8');
    assert(fnd2.includes('F-小明-001') && !/(?<![\w-])F-001(?![\w-])/.test(fnd2), 'findings 声明与叙事提及一并改名');
    const evts = readdirSync(join(pl, 'progress', 'events'));
    assert(!existsSync(join(pl, 'progress.md')) && evts.length === 1 && /-小明-00\.md$/.test(evts[0]), '原 progress.md 已搬入引导事件(seq 00)');
    assert(readFileSync(join(pl, 'progress', 'events', evts[0]), 'utf8').includes('F-小明-001'), '引导事件内的提及也已改名');
    assert(gate(root, 'check') === 0, '迁移后 check 绿(E1~E5 全过)');
    assert(quiet(() => teamCmd({ root, config: loadConfig(root).config, t, args: [TASK] })).code === 2, '重入拒绝(已是 team,切换不可隐式重来)');
    // tier B B3:task_plan 畸形到 frontmatter 无法定位(整篇仅 `---`)——报人话 exit 2,
    // 不是 renameIn(null) 的 TypeError 裸崩(裸崩会把整套 selftest 拖死在异常栈里)
    const BAD = '2026-01-02-坏计划任务';
    mkdirSync(join(root, 'docs', 'planning', BAD), { recursive: true });
    writeFileSync(join(root, 'docs', 'planning', BAD, 'task_plan.md'), '---');
    assert(quiet(() => teamCmd({ root, config: loadConfig(root).config, t, args: [BAD, '--owner', '小明'] })).code === 2,
      'task_plan 整篇仅 `---` ⇒ team 诊断 exit 2(不裸崩)');
    rmSync(join(root, 'docs', 'planning', BAD), { recursive: true, force: true });
    writeFileSync(join(pl, 'progress', 'events', '20260102T000000Z-mallory-01.md'), '# 混入\n');
    assert(gate(root, 'check') === 1, '成员外作者的事件被门拦(E3)');
    rmSync(join(pl, 'progress', 'events', '20260102T000000Z-mallory-01.md'));

    // ── B7:收口判断件先写好(runbook 语义),命令只收机械步 ──
    mkdirSync(join(root, 'docs', 'lines'), { recursive: true });
    writeFileSync(join(root, 'docs', 'lines', '协作任务.md'),
      '---\nid: 2026-01-01-line-协作任务\nstatus: active\ntype: line\nline: 协作任务\ncreated: 2026-01-01\n---\n\n# 协作任务\n');
    const coBody = '---\nid: 2026-01-01-协作任务-closeout\nstatus: active\ntype: closeout\nline: 协作任务\ncreated: 2026-01-01\nowner: 小明\n---\n\n# 收口\n\n| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |\n|---|---|---|---|---|---|---|\n| F-小明-001 | experience | repo:docs/experience.md | — | new | — | yes |\n| D-小明-001 | no-promotion | — | — | — | 会话内已消化 | yes |\n';
    writeFileSync(join(pl, 'closeout.md'), coBody);
    // tier B B8:worklogs README 真节前插一段围栏示例(内含同名标题)——fence-blind 的
    // closeout 会把登记行插到示例后、真节外,索引门当场红;修后行落真节,门绿即直证
    const wlP = join(root, 'docs', 'worklogs', 'README.md');
    writeFileSync(wlP, readFileSync(wlP, 'utf8').replace('## 已归档任务', '```md\n## 已归档任务\n```\n\n## 已归档任务'));
    // tier B B13:文件尾加一段 CRLF 小节——旧实现按「主导行尾」整文重排,LF 行全被
    // 改写成 CRLF,一行登记淹没在满屏 EOL 噪声;新实现各行行尾原样、登记行随邻行走
    writeFileSync(wlP, `${readFileSync(wlP, 'utf8')}\r\n## 附注\r\n备注一行\r\n`);
    assert(quiet(() => closeoutCmd({ root, config: loadConfig(root).config, t, args: ['协作任务', '--dry-run'] })).code === 0 && existsSync(pl),
      'closeout --dry-run 零迁移');
    writeFileSync(join(pl, 'closeout.md'), coBody.replace('owner: 小明', 'owner: mallory'));
    assert(quiet(() => closeoutCmd({ root, config: loadConfig(root).config, t, args: ['协作任务'] })).code === 2, '非 owner 收口起跑线即拒(E6 前置)');
    writeFileSync(join(pl, 'closeout.md'), coBody);
    assert(quiet(() => closeoutCmd({ root, config: loadConfig(root).config, t, args: ['协作任务', '--summary', 'e2e 收口演练'] })).code === 0,
      'worklog closeout exit 0(机械步落盘 + 双门绿)');
    assert(!existsSync(pl), 'planning 原目录已迁走');
    const arch = readdirSync(join(root, 'docs', 'worklogs')).filter((n) => n.includes('协作任务'));
    assert(arch.length === 1 && /^\d{4}-\d{2}-\d{2}-协作任务$/.test(arch[0]), '归档目录 = 收口日-任务名(开工日前缀已剥换)');
    assert(parseFrontmatter(readFileSync(join(root, 'docs', 'worklogs', arch[0], 'closeout.md'), 'utf8')).data.status === 'snapshot',
      'closeout status 已翻 snapshot(BOM/行尾原位编辑)');
    const wlReadme2 = readFileSync(join(root, 'docs', 'worklogs', 'README.md'), 'utf8');
    assert(wlReadme2.includes(`\`${arch[0]}/\``) && wlReadme2.includes('e2e 收口演练'), 'README 登记行含反引号目录名 + --summary 摘要');
    assert((wlReadme2.match(/\r\n/g) || []).length === 3 && wlReadme2.includes('## 附注\r\n'),
      'B13:混合行尾各行原样(CRLF 三行仍是三行,LF 行不被整文重排)');
    assert(gate(root, 'check') === 0 && gate(root, 'index') === 0, '收口后双门绿(归档 team 任务契约随行)');
  });

  // ── D. 全链路升档 e2e(阶段 5;§12「升档迁移 e2e」判据点名)────────────────
  // v1 时代的存量仓(字母登记表 + 无 id + 自由 line + 单文件 todo + 旧契约 closeout)
  // 一路升到 v5 generated 档,每一级都走**真 upgrade**(复用阶段 0 基座,不另起炉灶)。
  // 全程用自定义 docsDir(documentation/):任何一处硬编码 docs/ 都会在此现形——
  // 「自定义 docsDir 全生命周期不回落」与升档串成同一条链验。
  withTemp((root) => {
    const D = 'documentation';
    const fm = (f) => `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n`;
    // 配置以**带注释的 JSONC 原文**入链(F-005):两枚哨兵注释必须活着走到 v5——
    // 升档链任何一级整体重写配置,这里当场现形。
    const v1cfgText = [
      '// 契约注释:升档不许弄丢我(F-005 全链哨兵)',
      '{',
      '  "$schema": "./schema/worklogrc.schema.json",',
      '  "schemaVersion": 1,',
      '  "lang": "zh",',
      `  "docsDir": "${D}",`,
      '  "dirs": ["designs", "worklogs"], // 行尾注也是哨兵',
      '  "status": ["draft", "active", "snapshot", "superseded", "archived"],',
      '  "types": ["design", "index", "closeout"],',
      '  "dispositions": [',
      '    { "name": "experience", "targetKind": "docs" },',
      `    { "name": "todo", "targetKind": "fixed", "target": "${D}/todo.md" },`,
      '    { "name": "no-promotion", "targetKind": "none", "reasonRequired": true }',
      '  ]',
      '}',
      '',
    ].join('\n');
    const files = {
      '.worklogrc.jsonc': v1cfgText,
      [`${D}/README.md`]: fm({ status: 'active', type: 'index', line: '甲线', created: '2026-01-01' })
        + `# 索引\n\n## 目录职责\n\n| 目录 | 放什么 |\n|---|---|\n| \`designs/\` | x |\n| \`worklogs/\` | x |\n\n## 工作线字母登记表\n\n> 新立项先来此取号\n\n| 字母 | 工作线 | 立项 | 权威文档 |\n|---|---|---|---|\n| A | 甲线 | 2026-01-02 | [甲案](designs/a.md) |\n\n## 维护规则\n- x\n`,
      [`${D}/todo.md`]: fm({ status: 'active', type: 'index', line: '甲线', created: '2026-01-01' })
        + `# 滚动状态\n\n## A. 甲线\n\n- 甲线待办一\n- 见[甲案](designs/a.md)\n\n\`\`\`\n见[例](../foo.md)\n\`\`\`\n`,
      [`${D}/designs/a.md`]: fm({ status: 'active', type: 'design', line: '甲线(A)', created: '2026-01-03' }) + '# 甲案\n',
      [`${D}/worklogs/README.md`]: fm({ status: 'active', type: 'index', line: '甲线', created: '2026-01-01' })
        + '# worklogs\n\n## 已归档任务\n\n- 旧任务 — 2026-01-05 — 摘要 — `2026-01-05-旧任务/`\n',
      [`${D}/worklogs/2026-01-05-旧任务/task_plan.md`]: '# p\n',
      [`${D}/worklogs/2026-01-05-旧任务/progress.md`]: '# p\n',
      [`${D}/worklogs/2026-01-05-旧任务/findings.md`]: '# f\n\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n| F-001 | x | todo |\n',
      [`${D}/worklogs/2026-01-05-旧任务/closeout.md`]: fm({ status: 'snapshot', type: 'closeout', line: '甲线', created: '2026-01-05' })
        + `# c\n\n| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |\n|---|---|---|---|---|---|---|\n| F-001 | todo | repo:${D}/todo.md | ## A. 甲线 | new | — | yes |\n`,
    };
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, ...rel.split('/'));
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, content);
    }
    // 第一程:v1 → v5(invariant)。字母登记表归并/退役、id 播种、线实体、README 补行、todo 分节退役
    assert(quiet(() => upgrade({ root, t, args: [] })).code === 0, '升档第一程 v1→v5 exit 0');
    const after1 = loadConfig(root);
    assert(after1.fileVersion === LATEST_SCHEMA_VERSION && after1.errors.length === 0, '配置落最新版且过校验');
    assert(parseFrontmatter(readFileSync(join(root, D, 'designs', 'a.md'), 'utf8')).data.id === '2026-01-03-a', '存量文档播上 id');
    const ent = readFileSync(join(root, D, 'lines', '甲线.md'), 'utf8');
    assert(parseFrontmatter(ent).data.created === '2026-01-02' && ent.includes('登记表 A 行'), '中心登记 → 线实体 frontmatter(立项日随迁,R3-3)');
    // 权威文档格的相对链接须 rebase ../(README 根 → lines/ 深一级);不 rebase 则播种即断链,
    // 下面 385 行的双门绿断言也会独立咬住(真语料曾以 6 处断链暴露此盲区——fixture 空值格 = 测试盲区)。
    assert(ent.includes('](../designs/a.md)'), '登记表格内相对链接随归并 rebase 到实体所在深度');
    const rm1 = readFileSync(join(root, D, 'README.md'), 'utf8');
    assert(rm1.includes('本表已退役') && rm1.includes('| `lines/` |'), '登记表退役 + 职责表补 lines/ 行');
    assert(readFileSync(join(root, D, 'todo.md'), 'utf8').includes('## 甲线'), 'todo 分节号退役(## A. → ##)');
    const cfgText1 = readFileSync(join(root, '.worklogrc.jsonc'), 'utf8');
    assert(cfgText1.includes('F-005 全链哨兵') && cfgText1.includes('行尾注也是哨兵'), '升档第一程注释原样保全(F-005)');
    // F-004:第一程顺手补齐消费仓副本(missing→补齐),渲染按 docsDir 派生零 docs/ 回落
    const skill1 = readFileSync(join(root, '.claude', 'skills', 'planning', 'SKILL.md'), 'utf8');
    assert(!skill1.includes('docs/') && existsSync(join(root, '.worklog', 'templates', 'task_plan.md')), 'F-004 升档补齐六件副本,skill 按 docsDir 派生');
    assert(Object.keys(JSON.parse(readFileSync(join(root, '.worklog', 'manifest.json'), 'utf8')).templates).length === 6, 'F-004 消费仓升档拿到六件基线');
    assert(gate(root, 'check') === 0 && gate(root, 'index') === 0, '第一程后双门绿(升档不留悬账)');

    // 第二程:用户显式改档(R3-3 开关归人)→ 对账兑现 generated 数据布局。
    // 手编辑插键(带注释配置的真实改法),不整文重写;顺手定制一件副本,验 D-030 不覆盖
    writeFileSync(join(root, '.worklogrc.jsonc'), cfgText1.replace('"lang": "zh",', '"lang": "zh",\n  "index": { "mode": "generated" },'));
    writeFileSync(join(root, '.worklog', 'templates', 'findings.md'), '# 我的定制模板\n');
    assert(quiet(() => upgrade({ root, t, args: [] })).code === 0, '升档第二程(改档对账)exit 0');
    const cfg2 = loadConfig(root).raw;
    const td2 = cfg2.dispositions.find((d) => d.name === 'todo');
    assert(td2.targetKind === 'line-status' && td2.statusDir === `${D}/status` && cfg2.dirs.includes('status'), 'todo 处置 flip + dirs 补 status(全按 docsDir 派生)');
    const shard1 = readFileSync(join(root, D, 'status', '甲线.md'), 'utf8');
    assert(shard1.includes('甲线待办一'), 'todo 单文件 → status 分片,内容随迁');
    assert(shard1.includes('](../designs/a.md)'), 'todo 分节内相对链接随迁 rebase ../(docsDir 根 → status/ 深一级)');
    assert(shard1.includes('见[例](../foo.md)') && !shard1.includes('../../foo.md'), 'todo 迁移 rebase 跳围栏:围栏内示例链接逐字不变(F-001 fence-blind)');
    assert(readFileSync(join(root, D, 'worklogs', '2026-01-05-旧任务', 'closeout.md'), 'utf8').includes(`repo:${D}/status/甲线.md`), '旧 closeout 台账改指新靶点');
    assert(readFileSync(join(root, D, 'todo.md'), 'utf8').includes('本文件退役'), '旧滚动状态源退役留横幅');
    const cfgText2 = readFileSync(join(root, '.worklogrc.jsonc'), 'utf8');
    assert(cfgText2.includes('F-005 全链哨兵') && cfgText2.includes('行尾注也是哨兵'), '升档第二程(改档对账)注释仍保全');
    assert(readFileSync(join(root, '.worklog', 'templates', 'findings.md'), 'utf8') === '# 我的定制模板\n', 'F-004 定制副本升档不被覆盖(D-030 方向性安全)');
    assert(gate(root, 'check') === 0 && gate(root, 'index') === 0, '第二程后双门绿(含 line-status 验存)');

    // 生成器:两次构建逐字节一致(§12「生成器幂等」在消费仓路径上复证)
    const runBuild = () => quiet(() => buildIndex({ root, config: loadConfig(root).config, t })).code;
    assert(runBuild() === 0, 'index build 在升档后的消费仓 exit 0');
    const bytes1 = ['INDEX.md', 'STATUS.md'].map((n) => readFileSync(join(root, '.worklog', 'generated', n), 'utf8'));
    assert(runBuild() === 0, 'index build 重跑 exit 0');
    const bytes2 = ['INDEX.md', 'STATUS.md'].map((n) => readFileSync(join(root, '.worklog', 'generated', n), 'utf8'));
    assert(JSON.stringify(bytes1) === JSON.stringify(bytes2), '两次构建逐字节一致');
    assert(bytes1[1].includes(`${D}/lines/甲线.md`) && !bytes1.join('').includes('docs/'), '产物路径全按 docsDir 派生,零 docs/ 回落');

    // 第三程:幂等——什么都不该再变(含配置原文:注释、格式一个字节不动)
    const snap = readFileSync(join(root, D, 'todo.md'), 'utf8');
    const snapCfg = readFileSync(join(root, '.worklogrc.jsonc'), 'utf8');
    assert(quiet(() => upgrade({ root, t, args: [] })).code === 0 && readFileSync(join(root, D, 'todo.md'), 'utf8') === snap, '升档全链路幂等(第三程零变更)');
    assert(readFileSync(join(root, '.worklogrc.jsonc'), 'utf8') === snapCfg, '第三程配置原文逐字节不动(注释/格式零漂移)');
  });

  // ── C. 配置非法时 init 拒绝 stamp ────────────────────────────────────────
  withTemp((root) => {
    writeFileSync(join(root, '.worklogrc.jsonc'), JSON.stringify({ schemaVersion: 'bad', unknownKey: 1 }));
    const r = quiet(() => init({ root, t, args: [] }));
    // 配置非法却照 stamp,产出必然与配置不符——半对的骨架比没有更难收拾
    assert(r.code === 2 && !existsSync(join(root, 'docs')), '配置非法时 init 拒绝 stamp(exit 2 且零写入)');
  });

  console.log(failed ? `\n✗ e2e selftest 失败 ${failed} 项` : '\n✓ e2e selftest 全部通过');
  return failed ? 1 : 0;
}
