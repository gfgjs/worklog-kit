// doctor:本机诊断(非仓库 CI)。检查配置合法性 + 个人 skill 一致性 + 模板副本漂移
// + stale trio + 三件套行数护栏 + 仓库 EOL 体检(六项;仅配置问题计退出码,余为信息级)。
// R2-M4:个人 skill 安装一致性是本机检查,不进仓库 CI;故归入 doctor。
// R3-9:烂尾三件套(>N 天无 progress 更新)只有 doctor/status 报得出——closeout 门
// 只咬归档目录,弃置在 planning/ 的任务永不触发任何门。
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadConfig, LATEST_SCHEMA_VERSION } from './lib/config.mjs';
import { classifyTemplates } from './lib/templates.mjs';
import { targets, run as runSkills } from './install-skills.mjs';
import { makeTranslator } from './lib/i18n.mjs';

const STALE_DAYS = 14;
// 三件套体积护栏(token 税实测 2026-07-17/19):harness 的 Edit 前置 Read 让文件体积
// 逐轮进上下文重计费,读税占 kit 总税 ~60%,体积是唯一有杠杆的变量。只 warn 不
// fail——硬门会逼施工中途压缩,分心且丢证据,与 skill「宁多勿漏」候选纪律冲突。
// 双轨口径(2026-07-19 案例:三件 110/48/119 行全低于行数阈,合计 est 6.8k 已被用户
// 判重——行数单轨对中文密集文件失真,故补 est-token 轨):
//   - 行数 200:实测正常 ≤134 行,失控样本 211–309 行(ASCII 长文件兜底);
//   - 单件 est 4k:约对应中文密集 160–180 行(失控样本单件 5k+);
//   - 三件合计 est 6k:接续每轮全量读的分母(正常任务 <4k,案例 6.8k 咬到)。
export const TRIO_WARN_LINES = 200;
export const TRIO_WARN_EST_FILE = 4000;
export const TRIO_WARN_EST_TOTAL = 6000;

// token 估算与 tools/token-audit.mjs 同式(CJK=1/字、其余=1/4 字符,±30% fold 级
// 估值);tools/ 是仓 dev 工具不入包,故此处内联而非 import。
const CJK_RE = /[　-ヿ㐀-䶿一-鿿豈-﫿！-｠]/;
export function estTokens(s) {
  if (!s) return 0;
  let cjk = 0, other = 0;
  for (const ch of s) (CJK_RE.test(ch) ? cjk++ : other++);
  return Math.round(cjk + other / 4);
}

/** task_plan 内已完成却未折叠的阶段:[{stage, checked}](H2/H3 块内含「状态: complete|done」
    且 `- [x]` 超 3 条——skill 纪律是翻 complete 当场压成一行,细节证据在 git/progress)。
    #{2,3} 兼收 H2 阶段写法(复审 §3.6:旧版只切 H3,H2 完成节完全不看);非阶段 H2
    节(目标/关键决策等)无「状态:」行,天然不命中,不误报。 */
export function foldableStages(content) {
  const out = [];
  for (const block of content.split(/^#{2,3}\s+/m).slice(1)) {
    if (!/\*\*状态:\*\*\s*(complete|done)/i.test(block)) continue;
    const checked = block.split('\n').filter((l) => l.trim().startsWith('- [x]')).length;
    if (checked > 3) out.push({ stage: block.slice(0, block.indexOf('\n')).trim().slice(0, 40), checked });
  }
  return out;
}

/** 全阶段已完成却仍滞留 planning/ 的任务 = ready-for-closeout(复审 §6.2:doctor 只
    提示、不自动迁移——收口仍认用户明示)。判据:task_plan 有 ≥1 个带「状态:」行的阶段
    块,且**全部** complete|done。无阶段块(判据不足)返回 false,不猜。 */
export function allPhasesComplete(content) {
  const statuses = [];
  for (const block of content.split(/^#{2,3}\s+/m).slice(1)) {
    const m = block.match(/\*\*状态:\*\*\s*([A-Za-z_]+)/);
    if (m) statuses.push(m[1].toLowerCase());
  }
  return statuses.length > 0 && statuses.every((s) => s === 'complete' || s === 'done');
}

/** 扫 planning/ 下超体积护栏的三件套:{files: [{rel, lines, est}], dirs: [{rel, est}],
    folds: [{rel, stage, checked}], ready: [rel]}(team 档 events/ 是目录,天然不咬)。
    ready = 全阶段完成却未收口的任务(复审 §6.2 ready-for-closeout 提示)。 */
export function fatTrio(root, docsDir) {
  const files = [], dirs = [], folds = [], ready = [];
  const planning = join(root, docsDir, 'planning');
  if (!existsSync(planning)) return { files, dirs, folds, ready };
  for (const name of readdirSync(planning)) {
    const dir = join(planning, name);
    if (!statSync(dir).isDirectory()) continue;
    let total = 0;
    for (const f of ['task_plan.md', 'findings.md', 'progress.md']) {
      const p = join(dir, f);
      if (!existsSync(p)) continue;
      const s = readFileSync(p, 'utf8');
      const lines = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
      const est = estTokens(s);
      total += est;
      if (lines > TRIO_WARN_LINES || est > TRIO_WARN_EST_FILE) files.push({ rel: `planning/${name}/${f}`, lines, est });
      if (f === 'task_plan.md') {
        for (const x of foldableStages(s)) folds.push({ rel: `planning/${name}/${f}`, ...x });
        if (allPhasesComplete(s)) ready.push(`planning/${name}`);
      }
    }
    if (total > TRIO_WARN_EST_TOTAL) dirs.push({ rel: `planning/${name}`, est: total });
  }
  return { files, dirs, folds, ready };
}

/** 层 1(F-019):.gitattributes 内容是否含全局(模式 `*`)`eol=lf` 规则;注释/空行/非全局模式不算 */
export function hasGlobalLfPin(content) {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [pattern, ...attrs] = line.split(/\s+/);
    if (pattern === '*' && attrs.includes('eol=lf')) return true;
  }
  return false;
}

/**
 * 层 2(F-019):解析 `git ls-files --eol` 输出,返回 index/worktree 行尾不一致项。
 * 行格式 `i/<eol> w/<eol> attr/<attrs>\t<path>`——attr 值可含空格(如 `text=auto eol=lf`),
 * path 以**首个 TAB** 为界,按空白切列会把 attr 尾巴切进 path。
 * 只有 lf/crlf/mixed 有行尾语义;`-text`(binary)与 `none`(无行尾)跳过。
 */
export function eolMismatches(output) {
  const meaningful = (v) => v === 'lf' || v === 'crlf' || v === 'mixed';
  const out = [];
  // 切行用 /\r?\n/ 与同文件 `:43`(.gitattributes 解析)同尺(F-024):CRLF 输入下
  // split('\n') 会给每行残尾 \r,路径正则 `(.+)$` 因 . 不吞 \r 而整条失配被跳=静默漏报。
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^i\/(\S+)\s+w\/(\S+)\s+attr\/[^\t]*\t(.+)$/);
    if (!m) continue;
    const [, i, w, path] = m;
    if (meaningful(i) && meaningful(w) && i !== w) out.push({ i, w, path });
  }
  return out;
}

export function main({ root, t, args = [] }) {
  let problems = 0;
  const verbose = args.includes('--verbose');
  const asJson = args.includes('--json');

  // 1. 配置合法性
  // 单次体检内配置不变(只读),loadConfig 一次取全(含 config)后复用——
  // 原先 §4/§5 各处重复 loadConfig(root) 达四遍,重复读盘+JSON.parse(R6-§5)。
  const { path, errors, fileVersion, config } = loadConfig(root);

  // --json:机读治理载荷(CI ratchet 用),不打印人读诊断。配置错仍反映进退出码。
  if (asJson) {
    const fat = fatTrio(root, config.docsDir);
    console.log(JSON.stringify({
      configErrors: errors.length,
      thresholds: { lines: TRIO_WARN_LINES, estFile: TRIO_WARN_EST_FILE, estTotal: TRIO_WARN_EST_TOTAL },
      fatFiles: fat.files, fatDirs: fat.dirs, foldableStages: fat.folds, readyToClose: fat.ready,
      counts: { fatFiles: fat.files.length, fatDirs: fat.dirs.length, foldableStages: fat.folds.length, readyToClose: fat.ready.length },
    }, null, 2));
    return errors.length ? 1 : 0;
  }

  if (errors.length) {
    console.error(t('doctor.configErrors', { n: errors.length }));
    for (const e of errors) console.error(`    ${e}`);
    problems += errors.length;
  } else {
    console.log(t('doctor.configOk', { path: path || '(缺,用默认)' }));
    // 旧版配置**不算 problem**:载入时归一,今天照样能用(R5-C3 的梯子先于门)。
    // 只提示,不计入退出码——否则「装了新工具、还没来得及 upgrade」会被判成坏仓。
    if (fileVersion !== null && fileVersion < LATEST_SCHEMA_VERSION) {
      console.log(t('doctor.configOutdated', { got: fileVersion, latest: LATEST_SCHEMA_VERSION }));
    }
  }

  // 2. 个人 skill 一致性(本机;仅信息,不计入 problems——skill 可选)
  const codex = targets().codex;
  if (existsSync(codex.src)) {
    const r = runSkills({ srcDir: codex.src, destDir: codex.destUnder(codex.defaultHome()), mode: 'check', t });
    for (const a of r.actions) console.log(`  ${a}`);
  }

  // 3. 模板/skill 副本漂移(F-004;信息级,不计入 problems——定制是权利,漂移给梯子)。
  //    判定基线 = manifest.templates(工具最后写入内容的 hash,D-030);四种非 ok 态
  //    各配一句「下一步是什么」,不让读者对着状态词猜。
  if (!errors.length) {
    const cls = classifyTemplates(root, config);
    const bad = cls.filter((c) => c.state !== 'ok');
    if (!bad.length) {
      console.log(t('doctor.tplOk', { n: cls.length }));
    } else {
      for (const c of bad) console.log(t(`doctor.tpl.${c.state}`, { path: c.rel }));
    }
  }

  // 4. stale trio(>STALE_DAYS 天无 progress 更新)
  const planning = join(root, config.docsDir, 'planning');
  if (existsSync(planning)) {
    const now = Date.now();
    for (const name of readdirSync(planning)) {
      const dir = join(planning, name);
      if (!statSync(dir).isDirectory()) continue;
      const prog = join(dir, 'progress.md');
      // team 档的 progress 承载是 progress/events/(P3 设计件 §2):stale 判据取最新事件
      const evDir = join(dir, 'progress', 'events');
      let mtime;
      if (existsSync(prog)) mtime = statSync(prog).mtimeMs;
      else if (existsSync(evDir)) {
        const times = readdirSync(evDir).map((n) => statSync(join(evDir, n)).mtimeMs);
        mtime = times.length ? Math.max(...times) : statSync(dir).mtimeMs;
      } else mtime = statSync(dir).mtimeMs;
      const days = Math.floor((now - mtime) / 86400000);
      if (days > STALE_DAYS) console.log(t('doctor.staleTrio', { days, dir: `planning/${name}` }));
    }
  }

  // 5. 三件套体积护栏(信息级,不计入 problems——真大任务超了就超了,由人裁量)。
  //    复审 §3.6:默认逐件全列 = 诊断本身比 cold resume 还吵。改摘要默认:每类总数 + top 5
  //    (按 est/checked 降序),--verbose 展开全部,--json 给机器。TOP 排序让最肥的先现形。
  const TOP = 5;
  const fat = fatTrio(root, config.docsDir);
  const byEst = (a, b) => b.est - a.est;
  const total = fat.files.length + fat.dirs.length + fat.folds.length;
  if (total > 0) {
    console.log(t('doctor.fatSummary', {
      files: fat.files.length, dirs: fat.dirs.length, folds: fat.folds.length,
      hint: verbose ? '' : t('doctor.fatVerboseHint'),
    }));
    const files = [...fat.files].sort(byEst);
    const dirs = [...fat.dirs].sort(byEst);
    const folds = [...fat.folds].sort((a, b) => b.checked - a.checked);
    for (const f of (verbose ? files : files.slice(0, TOP))) {
      console.log('  ' + t('doctor.fatTrio', { lines: f.lines, est: f.est, maxLines: TRIO_WARN_LINES, maxEst: TRIO_WARN_EST_FILE, file: f.rel }));
    }
    if (!verbose && files.length > TOP) console.log('  ' + t('doctor.fatTrunc', { n: files.length - TOP }));
    for (const d of (verbose ? dirs : dirs.slice(0, TOP))) {
      console.log('  ' + t('doctor.fatTrioDir', { est: d.est, maxEst: TRIO_WARN_EST_TOTAL, dir: d.rel }));
    }
    if (!verbose && dirs.length > TOP) console.log('  ' + t('doctor.fatTrunc', { n: dirs.length - TOP }));
    for (const s of (verbose ? folds : folds.slice(0, TOP))) {
      console.log('  ' + t('doctor.foldStage', { stage: s.stage, n: s.checked, file: s.rel }));
    }
    if (!verbose && folds.length > TOP) console.log('  ' + t('doctor.fatTrunc', { n: folds.length - TOP }));
  }
  // ready-for-closeout 提示(复审 §6.2:只提示不迁移,收口仍认用户明示)
  for (const rel of fat.ready) {
    console.log(t('doctor.readyToClose', { dir: rel }));
  }

  // 6. 仓库 EOL 配置体检(F-019;信息级,不计入 problems——历史仓 renormalize 是全仓
  //    diff 的大动作,由人裁量)。P5 实证:`git archive` 按 autocrlf 转行尾即便 blob 是
  //    LF,未钉 LF 的仓在 Windows 上 clone/archive 必踩行尾漂移。
  //    execFileSync 直调不走 shell(cmd.exe 会吃 `^`);quotepath=off 保中文路径样例可读。
  let eolOutput = null;
  try {
    eolOutput = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '--eol'], {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    console.log(t('doctor.eolSkip')); // 非 git 仓或 git 不可用:体检对象不存在,如实说跳过
  }
  if (eolOutput !== null) {
    const ga = join(root, '.gitattributes');
    const pinned = existsSync(ga) && hasGlobalLfPin(readFileSync(ga, 'utf8'));
    const mism = eolMismatches(eolOutput);
    if (!pinned) console.log(t('doctor.eolNoPin'));
    if (mism.length) {
      const samples = mism.slice(0, 3).map((x) => `${x.path}(i/${x.i} w/${x.w})`).join('、');
      console.log(t('doctor.eolMismatch', { n: mism.length, samples }));
    }
    if (pinned && !mism.length) console.log(t('doctor.eolOk'));
  }

  return problems ? 1 : 0;
}

// ── selftest:fatTrio/EOL 纯函数边界 + main() 主流程(F-018)。全程 fixture 临时仓,
//    不触真实仓;main() 的 codex 检查经 CODEX_HOME 重定向,不触真实 user home。 ─────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-doctor: ${name}`); if (!cond) failed++; };

  /** 截获 console 跑 main():返回 {exit, logs}。真 zh catalog 断译文子串——
      fake t 断 key 名会漏「代码引了 key、catalog 没加」的漏译(t 缺 key 静默返回 key)。 */
  const t = makeTranslator('zh');
  const captureMain = (mroot, extraArgs = []) => {
    const logs = [];
    const orig = { log: console.log, error: console.error };
    const prevCodex = process.env.CODEX_HOME;
    console.log = (...a) => logs.push(a.join(' '));
    console.error = (...a) => logs.push(a.join(' '));
    process.env.CODEX_HOME = join(mroot, 'codex-home-空'); // 不存在即可:check 模式只报 missing
    try {
      return { exit: main({ root: mroot, t, args: extraArgs }), logs };
    } finally {
      console.log = orig.log; console.error = orig.error;
      if (prevCodex === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevCodex;
    }
  };
  const has = (logs, s) => logs.some((l) => l.includes(s));

  const root = mkdtempSync(join(tmpdir(), 'wk-doctor-'));
  try {
    // 1. 无 planning/ 目录:空结果不抛
    assert(fatTrio(root, 'docs').files.length === 0, '无 planning/ 目录返回空');

    const dir = join(root, 'docs', 'planning', '2026-01-01-测试任务');
    mkdirSync(dir, { recursive: true });
    // 2. 行数轨边界:恰 200 行不报,201 行报;尾无换行符的行数不虚增;纯 ASCII 短行不触 est 轨
    writeFileSync(join(dir, 'task_plan.md'), 'x\n'.repeat(TRIO_WARN_LINES));
    writeFileSync(join(dir, 'findings.md'), 'x\n'.repeat(TRIO_WARN_LINES + 1));
    writeFileSync(join(dir, 'progress.md'), `${'x\n'.repeat(TRIO_WARN_LINES)}末行无换行`);
    const hits = fatTrio(root, 'docs');
    assert(hits.files.length === 2 && hits.dirs.length === 0, '恰 200 行不报,超线才报(2 件命中;est 合计不触)');
    assert(hits.files.some((h) => h.rel.endsWith('findings.md') && h.lines === TRIO_WARN_LINES + 1), 'findings 201 行命中且行数准确');
    assert(hits.files.some((h) => h.rel.endsWith('progress.md') && h.lines === TRIO_WARN_LINES + 1), '尾行无换行符按实际行数计(201)');
    // 3. 只咬三件套平文件:同目录其它手写文件不进护栏
    writeFileSync(join(dir, '辅助笔记.md'), 'x\n'.repeat(TRIO_WARN_LINES + 50));
    assert(fatTrio(root, 'docs').files.length === 2, '非三件套文件不咬');
    // 4. team 档:progress 承载是 progress/events/ 目录,平文件缺位天然跳过
    const teamDir = join(root, 'docs', 'planning', '2026-01-02-team任务');
    mkdirSync(join(teamDir, 'progress', 'events'), { recursive: true });
    writeFileSync(join(teamDir, 'task_plan.md'), 'x\n');
    assert(fatTrio(root, 'docs').files.length === 2, 'team 档 events 目录不咬、小文件不报');
    // 4b. est 轨:170 行中文密集(行数不超)单件 est>4k 命中;三件合计 >6k 目录级命中
    const estDir = join(root, 'docs', 'planning', '2026-01-04-中文密集');
    mkdirSync(estDir, { recursive: true });
    const cjkLine = `${'汉'.repeat(25)}\n`; // est ≈25/行
    writeFileSync(join(estDir, 'task_plan.md'), cjkLine.repeat(170)); // est ≈4293,行数 170<200
    writeFileSync(join(estDir, 'findings.md'), cjkLine.repeat(60));   // est ≈1515
    writeFileSync(join(estDir, 'progress.md'), cjkLine.repeat(60));   // 合计 ≈7323>6000
    const eh = fatTrio(root, 'docs');
    assert(eh.files.some((h) => h.rel.includes('中文密集') && h.lines <= TRIO_WARN_LINES && h.est > TRIO_WARN_EST_FILE), 'est 轨:行数不超但单件 est 超 → 命中');
    assert(eh.dirs.length === 1 && eh.dirs[0].rel.endsWith('中文密集') && eh.dirs[0].est > TRIO_WARN_EST_TOTAL, 'est 轨:三件合计超 → 目录级命中(仅该目录)');
    // 4c. foldableStages:complete/done 且 >3 条 [x] 才报;in_progress 不咬;经 fatTrio 集成带 rel
    const tp = [
      '### 阶段 1:肥完成段', '- [x] a', '- [x] b', '- [x] c', '- [x] d', '- **状态:** complete', '',
      '### 阶段 2:瘦完成段', '- [x] a', '- **状态:** done(附注)', '',
      '### 阶段 3:在施段', '- [x] a', '- [x] b', '- [x] c', '- [x] d', '- [x] e', '- **状态:** in_progress', '',
    ].join('\n');
    const f6 = foldableStages(tp);
    assert(f6.length === 1 && f6[0].stage.includes('阶段 1') && f6[0].checked === 4, 'fold:complete 且 4 条 [x] 恰报一段(done 带附注瘦段/在施肥段不报)');
    assert(foldableStages('').length === 0, 'fold:空内容不报');
    const foldDir = join(root, 'docs', 'planning', '2026-01-05-折叠');
    mkdirSync(foldDir, { recursive: true });
    writeFileSync(join(foldDir, 'task_plan.md'), tp);
    const fh = fatTrio(root, 'docs');
    assert(fh.folds.length === 1 && fh.folds[0].rel.includes('2026-01-05-折叠') && fh.folds[0].checked === 4, 'fold:集成进 fatTrio 扫描且 rel 准确');
    // 4d. foldableStages 认 H2 阶段(复审 §3.6:旧版只切 H3)——非阶段 H2 节无「状态:」不误报
    const tpH2 = [
      '## 目标', '一句话', '',            // 非阶段 H2,无状态行 → 不报
      '## 阶段 A:H2 肥完成段', '- [x] a', '- [x] b', '- [x] c', '- [x] d', '- **状态:** complete', '',
    ].join('\n');
    const fH2 = foldableStages(tpH2);
    assert(fH2.length === 1 && fH2[0].stage.includes('阶段 A') && fH2[0].checked === 4, 'fold:H2 完成阶段命中(目标等非阶段 H2 不误报)');
    // 4e. allPhasesComplete + fatTrio.ready:全阶段完成 → ready;有 pending/无阶段 → 不 ready
    assert(allPhasesComplete(tp) === false, 'ready:含 in_progress 阶段 ⇒ 非 ready');
    assert(allPhasesComplete('## 目标\n无阶段块\n') === false, 'ready:无带状态阶段块 ⇒ 非 ready(判据不足不猜)');
    const tpDone = [
      '### 阶段 1:甲', '- [x] a', '- **状态:** complete', '',
      '### 阶段 2:乙', '- [x] b', '- **状态:** done', '',
    ].join('\n');
    assert(allPhasesComplete(tpDone) === true, 'ready:全阶段 complete/done ⇒ ready');
    const readyDir = join(root, 'docs', 'planning', '2026-01-06-可收口');
    mkdirSync(readyDir, { recursive: true });
    writeFileSync(join(readyDir, 'task_plan.md'), tpDone);
    const rh = fatTrio(root, 'docs');
    assert(rh.ready.includes('planning/2026-01-06-可收口') && !rh.ready.includes('planning/2026-01-05-折叠'), 'ready:集成进 fatTrio(全完成任务入 ready,含在施阶段的不入)');
    rmSync(readyDir, { recursive: true, force: true });

    // 5. hasGlobalLfPin 边界:全局 `*` 规则才算钉;注释/局部模式/无 eol 属性不算
    assert(hasGlobalLfPin('* text=auto eol=lf\n'), 'pin:标准全局规则命中');
    assert(hasGlobalLfPin('# 注释\n\n*   eol=lf\n'), 'pin:多空白分隔 + 前置注释命中');
    assert(!hasGlobalLfPin('# * text=auto eol=lf\n'), 'pin:注释行不算');
    assert(!hasGlobalLfPin('*.md text=auto eol=lf\n'), 'pin:非全局模式(*.md)不算');
    assert(!hasGlobalLfPin('* text=auto\n'), 'pin:无 eol=lf 属性不算');
    assert(!hasGlobalLfPin(''), 'pin:空内容不算');

    // 6. eolMismatches 边界:只报 i≠w 且两侧均有行尾语义;attr 含空格时 path 按 TAB 锚定
    const eolFix = [
      'i/lf    w/lf    attr/text=auto eol=lf     \ta.md',          // 一致:不报
      'i/crlf  w/lf    attr/text=auto eol=lf     \t中文 带空格.md', // 不一致:报;path 含空格/中文
      'i/lf    w/crlf  attr/                     \tb.txt',          // 不一致:报;attr 空
      'i/mixed w/lf    attr/                     \tc.txt',          // mixed 有行尾语义:报
      'i/-text w/-text attr/                     \tbin.png',        // binary:跳过
      'i/lf    w/none  attr/                     \tempty.txt',      // none 无行尾语义:跳过
      '',
    ].join('\n');
    const mm = eolMismatches(eolFix);
    assert(mm.length === 3, 'eol:六行 fixture 恰报三件(binary/none/一致均不报)');
    assert(mm.some((x) => x.path === '中文 带空格.md' && x.i === 'crlf' && x.w === 'lf'), 'eol:attr 含空格时 path 按 TAB 完整取出');
    assert(eolMismatches('').length === 0, 'eol:空输出不报');
    // F-024 回归锁:CRLF 行终止(git 在 Windows 直发或输出经 CRLF 管道)仍解析。旧 split('\n')
    // 下每行残尾 \r,路径正则 `(.+)$` 因 . 不吞 \r 而整条失配被跳,是静默漏报——非串列错位。
    const eolCrlf = [
      'i/crlf  w/lf    attr/text=auto eol=lf     \tcrlf行终止.md',
      'i/lf    w/crlf  attr/                     \tb.txt',
    ].join('\r\n') + '\r\n';
    const mmCrlf = eolMismatches(eolCrlf);
    assert(mmCrlf.length === 2, 'eol:CRLF 行终止仍报两件(旧 split 残 \\r 令整条失配漏报)');
    assert(mmCrlf.some((x) => x.path === 'crlf行终止.md'), 'eol:行末 \\r 不残入 path 尾');

    // ── main() 主流程(F-018)──
    // 7. 缺配置文件走默认:exit 0;configOk + 模板 missing 报告 + 非 git 仓 EOL 跳过
    const m1 = captureMain(root);
    assert(m1.exit === 0, 'main:缺配置走默认 exit 0');
    assert(has(m1.logs, '✓ 配置合法'), 'main:configOk 行输出');
    assert(has(m1.logs, '副本缺失'), 'main:空仓模板报 missing 态');
    assert(has(m1.logs, 'EOL 体检跳过'), 'main:非 git 仓 EOL 体检跳过');
    assert(!has(m1.logs, '最新为'), 'main:无配置文件不报版本过旧');

    // 8. 坏配置:计入 problems,exit 1
    writeFileSync(join(root, '.worklogrc.jsonc'), '{ "schemaVersion": "bad" }\n');
    const m2 = captureMain(root);
    assert(m2.exit === 1, 'main:坏配置 exit 1');
    assert(has(m2.logs, '✗ 配置问题'), 'main:configErrors 行输出');

    // 9. 旧版配置:合法可用,只提示不计退出码(R5-C3 梯子先于门)
    writeFileSync(join(root, '.worklogrc.jsonc'), `${JSON.stringify({
      schemaVersion: 2, docsDir: 'docs', dirs: ['designs'], status: ['active'],
      types: [{ name: 'design', canBeAuthoritative: true }],
      dispositions: [{ name: 'experience', targetKind: 'docs' }],
    })}\n`);
    const m3 = captureMain(root);
    assert(m3.exit === 0, 'main:旧版配置 exit 0');
    assert(has(m3.logs, '最新为'), 'main:旧版配置报 configOutdated 提示');

    // 10. stale trio:mtime 拨回 20 天触发;恰 14 天(判据 >STALE_DAYS,含当日)不触发
    const staleDir = join(root, 'docs', 'planning', '2026-01-03-烂尾任务');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(staleDir, 'progress.md'), 'x\n');
    const back = (days) => new Date(Date.now() - days * 86400000);
    utimesSync(join(staleDir, 'progress.md'), back(20), back(20));
    const m4 = captureMain(root);
    assert(has(m4.logs, '疑似烂尾三件套') && has(m4.logs, '2026-01-03-烂尾任务'), 'main:20 天无更新报 stale');
    utimesSync(join(staleDir, 'progress.md'), back(14), back(14));
    const m5 = captureMain(root);
    assert(!has(m5.logs, '2026-01-03-烂尾任务'), 'main:恰 14 天(阈值边界)不报 stale');

    // 10b. 摘要默认 / --verbose 展开 / --json 机读(复审 §3.6):6 个可折叠阶段 > top 5
    const sumDir = join(root, 'docs', 'planning', '2026-01-07-摘要');
    mkdirSync(sumDir, { recursive: true });
    const sixFolds = Array.from({ length: 6 }, (_, i) =>
      [`### 阶段 ${i + 1}:段`, '- [x] a', '- [x] b', '- [x] c', '- [x] d', '- **状态:** complete', ''].join('\n')).join('\n');
    writeFileSync(join(sumDir, 'task_plan.md'), sixFolds);
    const mSum = captureMain(root);
    assert(has(mSum.logs, '完成阶段可折叠'), 'main:体积护栏命中出摘要行(fatSummary)');
    assert(has(mSum.logs, 'top 5') && mSum.logs.some((l) => l.includes('另有') && l.includes('--verbose')), 'main:默认只列 top 5 + 截断提示');
    const mVerb = captureMain(root, ['--verbose']);
    assert(!mVerb.logs.some((l) => l.includes('另有') && l.includes('--verbose')), 'main:--verbose 展开无截断提示');
    assert(mVerb.logs.filter((l) => l.includes('仍留') && l.includes('checklist')).length >= 6, 'main:--verbose 六个折叠阶段全列');
    const mJson = captureMain(root, ['--json']);
    assert(mJson.exit === 0, 'main:--json 配置合法 exit 0');
    let parsed = null;
    try { parsed = JSON.parse(mJson.logs.join('\n')); } catch { /* parsed 留 null */ }
    assert(parsed && parsed.counts && parsed.counts.foldableStages >= 6 && Array.isArray(parsed.readyToClose), 'main:--json 输出合法 JSON 且含 counts/readyToClose');
    assert(!has(mJson.logs, '配置合法') && !has(mJson.logs, 'EOL 体检'), 'main:--json 不夹带人读诊断行');
    rmSync(sumDir, { recursive: true, force: true });

    // 11. EOL 体检 git fixture 三态(git 不可用则跳过——与产品行为同构,不硬红)
    let gitOk = true;
    try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitOk = false; }
    if (gitOk) {
      const gRoot = join(root, 'git仓');
      mkdirSync(gRoot, { recursive: true });
      const g = (args) => execFileSync('git', args, { cwd: gRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      g(['init', '-q']);
      g(['config', 'core.autocrlf', 'false']);
      writeFileSync(join(gRoot, 'a.txt'), 'x\r\ny\r\n'); // CRLF 入 index
      g(['add', 'a.txt']);
      writeFileSync(join(gRoot, 'a.txt'), 'x\ny\n');      // worktree 改 LF ⇒ i/crlf w/lf
      const m6 = captureMain(gRoot);
      assert(has(m6.logs, '未钉全局 eol=lf'), 'main:无 .gitattributes 报未钉 LF');
      assert(has(m6.logs, '行尾不一致') && has(m6.logs, 'a.txt'), 'main:i/w 不一致件名进样例');
      assert(m6.exit === 0, 'main:EOL 告警信息级不计退出码');
      writeFileSync(join(gRoot, '.gitattributes'), '* text=auto eol=lf\n');
      g(['add', '--renormalize', '.']);                   // 钉 LF 后归一 index
      const m7 = captureMain(gRoot);
      assert(has(m7.logs, 'EOL 体检通过'), 'main:钉 LF + renormalize 后体检通过');
    } else {
      console.log('· selftest-doctor: git 不可用,EOL git fixture 三态跳过(纯函数边界已覆盖)');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(failed ? `\n✗ doctor selftest 失败 ${failed} 项` : '\n✓ doctor selftest 全部通过');
  return failed ? 1 : 0;
}
