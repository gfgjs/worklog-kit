// 产品化机械命令(复审 §8.2):`worklog start/list/resume/note/checkpoint/next-id`。
//
// 立场(复审 §4.2/§4.3):三件套是 **append-only lossless ledger**——工具只做机械事
// (建骨架、定位节、原子写、EOL/BOM 保形、有界视图输出),内容判断(前情蒸馏、发现措辞、
// 阶段折叠)仍归人/AI。`note --stdin` 是 heredoc 的产品化替代:内容全程当**数据**,
// 纯字符串操作,绝不进 shell 解析——独占行 `EOF`、反引号、`$()` 在这里只是字符。
// `checkpoint` 是「原账不丢」的压缩:旧会话段**迁移**到 progress-archive.md,不删除;
// 写序先归档后裁剪,中断最坏留重复、不丢账。
import { existsSync, readFileSync, readdirSync, mkdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PKG_ROOT, writeAtomic, walk, DOCS_SKIP, relPath } from './lib/fsutil.mjs';
import { parseFrontmatter, escapeRe, makeFenceSkipper, section } from './lib/frontmatter.mjs';
import { resolveTaskDir, stripTaskDate } from './lib/taskref.mjs';
import { withDocsDir, KIT_DIR } from './lib/templates.mjs';
import { allPhasesComplete } from './doctor.mjs';
import { todayLocal } from './lib/dates.mjs';

/** 任务名消毒 = skill §起步同一规则:剔除文件系统非法字符、空格→`-`、NFC 归一。
 *  不用 slug.mjs 的 slugify:那是 `line` 值专用,会剥 `名(X)` 字母尾——任务名不剥。 */
const ILLEGAL = /[\\/:*?"<>|]/g;
export const sanitizeTaskName = (raw) =>
  String(raw ?? '').replace(ILLEGAL, '').trim().replace(/\s+/g, '-').normalize('NFC');

/** 模板取用:消费仓副本(.worklog/templates/,用户可能已定制)优先,包内渲染兜底。
 *  checkpoint.md(memory-lite)当前不在 stamp 清单,常走包内路径。 */
function templateText(root, config, name) {
  const repoCopy = join(root, KIT_DIR, 'templates', name);
  if (existsSync(repoCopy)) return readFileSync(repoCopy, 'utf8');
  return withDocsDir(readFileSync(join(PKG_ROOT, 'templates', name), 'utf8'), config);
}

/** 行切分保行尾(与 closeout README 插行同款纪律:各行保留自身 EOL,真变更不淹没在归一噪声里) */
const splitKeep = (raw) => raw.split(/(?<=\n)/);

/** 全文的 H2 块界定(围栏感知,B8 同契约):返回 [{start, headingText}],块体到下一 H2 前。 */
function h2Starts(lines) {
  const skip = makeFenceSkipper();
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const inCode = skip(lines[i]);
    if (!inCode && /^##\s+/.test(lines[i])) out.push({ start: i, headingText: lines[i].replace(/^##\s+/, '').replace(/\r?\n$/, '').trim() });
  }
  return out;
}

/** 节尾追加(closeout 登记行同款):anchor 前缀匹配 H2 标题,插到该节最后一个非空行之后。
 *  行尾随插入点邻行走;找不到节返回 null(调用方报错,不盲落文件尾)。 */
export function sectionAppend(raw, anchor, contentLines) {
  const lines = splitKeep(raw);
  const blocks = h2Starts(lines);
  const hit = blocks.find((b) => b.headingText.startsWith(anchor));
  if (!hit) return null;
  const nextStart = blocks[blocks.indexOf(hit) + 1]?.start ?? lines.length;
  let insertAt = hit.start + 1;
  for (let i = hit.start + 1; i < nextStart; i++) if (lines[i].trim() !== '') insertAt = i + 1;
  const anchorLine = lines[insertAt - 1];
  const eol = anchorLine.endsWith('\r\n') ? '\r\n' : '\n';
  if (!/\n$/.test(anchorLine)) lines[insertAt - 1] = `${anchorLine}${eol}`;
  lines.splice(insertAt, 0, ...contentLines.map((l) => `${l}${eol}`));
  return lines.join('');
}

/** 文件尾追加(progress 账本语义:最新永远在末尾)。行尾取全文最后一个换行的形态。 */
export function appendEof(raw, contentLines) {
  const li = raw.lastIndexOf('\n');
  const eol = li > 0 && raw[li - 1] === '\r' ? '\r\n' : '\n';
  const head = raw === '' || /\n$/.test(raw) ? raw : `${raw}${eol}`;
  return head + contentLines.map((l) => `${l}${eol}`).join('');
}

/** 任务目录形态判定:trio / lite(仅 checkpoint.md)/ team(progress/events/) */
function taskShape(dir) {
  const team = existsSync(join(dir, 'progress', 'events'));
  const trio = existsSync(join(dir, 'task_plan.md'));
  const lite = !trio && existsSync(join(dir, 'checkpoint.md'));
  return { team, trio, lite };
}

function resolveOrComplain(root, config, t, nameArg) {
  const r = resolveTaskDir(root, config, nameArg);
  if (!r.ok) {
    console.error(t(r.reason === 'ambiguous' ? 'task.ambiguous' : 'task.notFound',
      { name: nameArg, base: `${config.docsDir}/planning`, dirs: (r.dirs ?? []).join(', ') }));
  }
  return r;
}

/** stdin 全量读(fd 0)。测试/e2e 经 stdinText 注入,绕开进程级管道。 */
function readContent(stdinText) {
  if (stdinText !== undefined) return stdinText;
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

// ── start ────────────────────────────────────────────────────────────────────
export function mainStart({ root, config, t, args }) {
  const dry = args.includes('--dry-run');
  let mode = 'trio';
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') continue;
    if (a === '--mode') { mode = args[++i]; continue; }
    if (!a.startsWith('-')) positionals.push(a);
  }
  if (!positionals[0]) { console.error(t('tasks.startUsage')); return 2; }
  if (mode !== 'trio' && mode !== 'lite') { console.error(t('tasks.startBadMode', { mode })); return 2; }
  const name = sanitizeTaskName(positionals[0]);
  if (!name) { console.error(t('tasks.startEmptyName', { raw: positionals[0] })); return 2; }
  const today = todayLocal();
  const base = join(root, config.docsDir, 'planning');
  let dirName = `${today}-${name}`;
  for (let n = 2; existsSync(join(base, dirName)); n++) {
    if (n > 99) { console.error(t('tasks.startTooMany', { name })); return 1; }
    dirName = `${today}-${name}-${n}`;
  }
  const files = mode === 'trio' ? ['task_plan.md', 'findings.md', 'progress.md'] : ['checkpoint.md'];
  const rel = `${config.docsDir}/planning/${dirName}`;
  if (dry) {
    console.log(t('tasks.startDryRun', { dir: rel, files: files.join(', '), mode }));
    return 0;
  }
  const dir = join(base, dirName);
  mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const content = templateText(root, config, f)
      .replaceAll('<任务名>', name)
      .replaceAll('<YYYY-MM-DD>', today);
    writeAtomic(join(dir, f), content);
  }
  console.log(t('tasks.startCreated', { dir: rel, files: files.join(', '), mode }));
  console.log(t('tasks.startHint'));
  return 0;
}

// ── list ─────────────────────────────────────────────────────────────────────
export function mainList({ root, config, t, args }) {
  const json = args.includes('--json');
  const onlyActive = args.includes('--active');
  const onlyReady = args.includes('--ready');
  const base = join(root, config.docsDir, 'planning');
  const rows = [];
  if (existsSync(base)) {
    for (const d of readdirSync(base).sort()) {
      const dir = join(base, d);
      if (!statSync(dir).isDirectory()) continue;
      const shape = taskShape(dir);
      const planFile = shape.trio ? 'task_plan.md' : shape.lite ? 'checkpoint.md' : null;
      if (!planFile) { rows.push({ dir: d, mode: 'unknown', team: shape.team, status: '?', created: '', phase: '', ready: false }); continue; }
      const raw = readFileSync(join(dir, planFile), 'utf8');
      const fm = parseFrontmatter(raw).data;
      const sec = section(raw, new RegExp(`^##\\s+${escapeRe(shape.trio ? '当前阶段' : '当前')}`));
      const phase = (sec ?? []).map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('<!--')) ?? '';
      rows.push({
        dir: d,
        mode: shape.trio ? 'trio' : 'lite',
        team: shape.team,
        status: fm.status ?? '?',
        created: fm.created ?? '',
        phase,
        // ready 提示与 doctor 同判据(复审 §6.2):只提示可收口,不代发起——收口仍认用户明示
        ready: shape.trio && allPhasesComplete(raw),
      });
    }
  }
  let out = rows;
  if (onlyActive) out = out.filter((r) => r.status === 'active');
  if (onlyReady) out = out.filter((r) => r.ready);
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!out.length) { console.log(t('tasks.listNone', { base: `${config.docsDir}/planning` })); return 0; }
  for (const r of out) {
    const tags = `${r.mode === 'lite' ? ' [lite]' : ''}${r.team ? ' [team]' : ''}${r.ready ? ` ${t('tasks.listReadyTag')}` : ''}`;
    console.log(t('tasks.listRow', { dir: r.dir, status: r.status, phase: r.phase || '—', tags }));
  }
  console.log(t('tasks.listCount', { n: out.length }));
  return 0;
}

// ── resume ───────────────────────────────────────────────────────────────────
/** progress 有界热视图:前情段 + 最近 keep 个会话段(skill §接续的分层读,做成命令输出)。 */
export function compactProgress(raw, keep = 2) {
  const lines = splitKeep(raw);
  const blocks = h2Starts(lines);
  const endOf = (bi) => blocks[bi + 1]?.start ?? lines.length;
  const picked = [];
  let intro = -1;
  const sessions = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].headingText.startsWith('前情')) intro = i;
    if (blocks[i].headingText.startsWith('会话')) sessions.push(i);
  }
  if (intro !== -1) picked.push(intro);
  picked.push(...sessions.slice(-keep));
  const view = picked
    .sort((a, b) => a - b)
    .map((bi) => lines.slice(blocks[bi].start, endOf(bi)).join(''))
    .join('');
  return { view, omitted: Math.max(0, sessions.length - keep), hasIntro: intro !== -1 };
}

export function mainResume({ root, config, t, args }) {
  const full = args.includes('--full');
  const nameArg = args.find((a) => !a.startsWith('-'));
  if (!nameArg) { console.error(t('tasks.resumeUsage')); return 2; }
  const r = resolveOrComplain(root, config, t, nameArg);
  if (!r.ok) return 2;
  const dir = r.dir;
  const rel = relPath(root, dir);
  const say = (f, body) => {
    console.log(`\n━━ ${rel}/${f} ━━`);
    console.log(body.replace(/\r?\n$/, ''));
  };
  const shape = taskShape(dir);
  if (shape.lite) { say('checkpoint.md', readFileSync(join(dir, 'checkpoint.md'), 'utf8')); return 0; }
  for (const f of ['task_plan.md', 'findings.md']) {
    if (existsSync(join(dir, f))) say(f, readFileSync(join(dir, f), 'utf8'));
  }
  if (shape.team) { console.log(`\n${t('tasks.resumeTeam', { dir: rel })}`); return 0; }
  const pp = join(dir, 'progress.md');
  if (!existsSync(pp)) { console.log(`\n${t('tasks.resumeNoProgress', { dir: rel })}`); return 0; }
  const raw = readFileSync(pp, 'utf8');
  if (full) {
    say('progress.md', raw);
  } else {
    const { view, omitted, hasIntro } = compactProgress(raw, 2);
    say('progress.md(前情+最近2段)', view || raw);
    if (omitted > 0) console.log(t('tasks.resumeOmitted', { n: omitted }));
    if (!hasIntro) console.log(t('tasks.resumeNoIntro'));
  }
  if (existsSync(join(dir, 'progress-archive.md'))) console.log(t('tasks.resumeArchiveNote', { path: `${rel}/progress-archive.md` }));
  return 0;
}

// ── note ─────────────────────────────────────────────────────────────────────
const NOTE_TARGETS = {
  finding: ['findings.md', '发现'],
  decision: ['task_plan.md', '关键决策'],
  progress: ['progress.md', null], // 账本语义:最新在文件尾
};

export function mainNote({ root, config, t, args, stdinText }) {
  let kind = '';
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--stdin') continue;
    if (a === '--kind') { kind = args[++i]; continue; }
    if (!a.startsWith('-')) positionals.push(a);
  }
  const nameArg = positionals[0];
  if (!nameArg || !kind) { console.error(t('tasks.noteUsage')); return 2; }
  if (!(kind in NOTE_TARGETS)) { console.error(t('tasks.noteBadKind', { kind })); return 2; }
  if (!args.includes('--stdin') && stdinText === undefined) { console.error(t('tasks.noteNeedStdin')); return 2; }
  const body = readContent(stdinText).replace(/\r?\n$/, '');
  if (!body.trim()) { console.error(t('tasks.noteEmpty')); return 2; }
  const r = resolveOrComplain(root, config, t, nameArg);
  if (!r.ok) return 2;
  const dir = r.dir;
  const shape = taskShape(dir);
  if (shape.lite) { console.error(t('tasks.noteLite', { dir: relPath(root, dir) })); return 2; }
  if (shape.team && kind === 'progress') { console.error(t('tasks.noteTeamProgress', { dir: relPath(root, dir) })); return 2; }
  const [file, anchor] = NOTE_TARGETS[kind];
  const p = join(dir, file);
  if (!existsSync(p)) { console.error(t('tasks.noteNoFile', { dir: relPath(root, dir), file })); return 2; }
  const raw = readFileSync(p, 'utf8');
  const contentLines = body.split(/\r?\n/);
  const next = anchor === null ? appendEof(raw, contentLines) : sectionAppend(raw, anchor, contentLines);
  if (next === null) { console.error(t('tasks.noteNoHeading', { file, anchor })); return 2; }
  writeAtomic(p, next);
  console.log(t('tasks.noteDone', {
    n: contentLines.length,
    file: `${relPath(root, dir)}/${file}`,
    section: anchor ?? t('tasks.noteEofSection'),
  }));
  return 0;
}

// ── checkpoint ───────────────────────────────────────────────────────────────
/** 模板同文案的前情标题(缺前情段的存量档,--stdin 时新建这一节) */
const INTRO_HEADING = '## 前情(接续先读这段,≤10 行;旧会话细节在 progress-archive.md)';

export function mainCheckpoint({ root, config, t, args, stdinText }) {
  const dry = args.includes('--dry-run');
  const useStdin = args.includes('--stdin') || stdinText !== undefined;
  const nameArg = args.find((a) => !a.startsWith('-'));
  if (!nameArg) { console.error(t('tasks.checkpointUsage')); return 2; }
  const r = resolveOrComplain(root, config, t, nameArg);
  if (!r.ok) return 2;
  const dir = r.dir;
  const rel = relPath(root, dir);
  const shape = taskShape(dir);
  if (shape.team) { console.error(t('tasks.checkpointTeam', { dir: rel })); return 2; }
  if (shape.lite) { console.log(t('tasks.checkpointLite', { dir: rel })); return 0; }
  const pp = join(dir, 'progress.md');
  if (!existsSync(pp)) { console.error(t('tasks.noteNoFile', { dir: rel, file: 'progress.md' })); return 2; }
  const raw = readFileSync(pp, 'utf8');
  const lines = splitKeep(raw);
  const blocks = h2Starts(lines);
  const endOf = (bi) => blocks[bi + 1]?.start ?? lines.length;
  const sessions = [];
  let intro = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].headingText.startsWith('前情')) intro = i;
    if (blocks[i].headingText.startsWith('会话')) sessions.push(i);
  }
  const KEEP = 2; // skill §接续的分层读口径:热区 = 前情 + 最近 2 段
  const old = sessions.slice(0, Math.max(0, sessions.length - KEEP));
  const introBody = useStdin ? readContent(stdinText).replace(/\r?\n$/, '') : null;
  if (useStdin && !String(introBody).trim()) { console.error(t('tasks.noteEmpty')); return 2; }
  if (!old.length && introBody === null) { console.log(t('tasks.checkpointNothing', { dir: rel, keep: KEEP })); return 0; }

  const oldTitles = old.map((bi) => blocks[bi].headingText);
  if (dry) {
    console.log(t('tasks.checkpointDry', {
      dir: rel,
      moved: oldTitles.length ? oldTitles.join(' / ') : t('tasks.checkpointNone'),
      intro: introBody !== null ? t('tasks.checkpointIntroYes') : t('tasks.checkpointIntroNo'),
    }));
    return 0;
  }

  // 1. 先归档(lossless 偏置:中断最坏留重复,绝不丢账),再裁剪 progress
  const ap = join(dir, 'progress-archive.md');
  if (old.length) {
    const fmLine = parseFrontmatter(raw).data.line || stripTaskDate(r.name);
    let archive;
    if (existsSync(ap)) {
      archive = readFileSync(ap, 'utf8');
      if (archive !== '' && !/\n$/.test(archive)) archive += archive.includes('\r\n') ? '\r\n' : '\n';
    } else {
      archive = [
        '---', 'status: active', 'type: working-memory', `line: ${fmLine}`, `created: ${todayLocal()}`, '---', '',
        `# 进度归档:${fmLine}`, '',
        '<!-- 旧会话段的冷账(worklog checkpoint 迁入,原文照录);接续只读 progress.md 热区,本档按需查 -->', '',
      ].join('\n') + '\n';
    }
    const moved = old.map((bi) => lines.slice(blocks[bi].start, endOf(bi)).join('')).join('');
    writeAtomic(ap, archive + moved);
  }

  // 2. 重组 progress:剔除已归档块;--stdin 则换前情段体(标题行保留/新建)
  const drop = new Set();
  for (const bi of old) for (let i = blocks[bi].start; i < endOf(bi); i++) drop.add(i);
  let out = [];
  const introEol = intro !== -1 && lines[blocks[intro].start].endsWith('\r\n') ? '\r\n' : '\n';
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) continue;
    if (introBody !== null && intro !== -1 && i === blocks[intro].start) {
      out.push(lines[i], ...introBody.split(/\r?\n/).map((l) => `${l}${introEol}`), introEol);
      i = endOf(intro) - 1; // 跳过旧前情体
      continue;
    }
    out.push(lines[i]);
  }
  if (introBody !== null && intro === -1) {
    // 存量档无前情段:插到第一个 H2 之前(模板位置);全文无 H2 则落文件尾
    const firstH2 = blocks.find((b) => !drop.has(b.start))?.start ?? lines.length;
    const at = out.indexOf(lines[firstH2]); // 剔除已归档块后重新定位
    const seg = [`${INTRO_HEADING}\n`, ...introBody.split(/\r?\n/).map((l) => `${l}\n`), '\n'];
    if (at === -1) out.push(...seg);
    else out.splice(at, 0, ...seg);
  }
  writeAtomic(pp, out.join(''));

  if (old.length) console.log(t('tasks.checkpointMoved', { n: oldTitles.length, titles: oldTitles.join(' / '), path: `${rel}/progress-archive.md` }));
  if (introBody !== null) console.log(t('tasks.checkpointIntroDone'));
  console.log(t('tasks.checkpointDone', { dir: rel, keep: KEEP }));
  return 0;
}

// ── next-id ──────────────────────────────────────────────────────────────────
export function mainNextId({ root, config, t, args }) {
  const json = args.includes('--json');
  const files = walk(join(root, config.docsDir), ['.md'], DOCS_SKIP);
  let maxF = 0;
  let maxD = 0;
  for (const f of files) {
    let s;
    try { s = readFileSync(f, 'utf8'); } catch { continue; }
    // 围栏内的 ID 也计入:next-id 要的是**安全上界**,示例里的编号也占号,宁跳不撞
    const re = /\b([FD])-(\d{3,})\b/g;
    let m;
    while ((m = re.exec(s))) {
      const n = Number(m[2]);
      if (m[1] === 'F') maxF = Math.max(maxF, n);
      else maxD = Math.max(maxD, n);
    }
  }
  const pad = (n) => String(n).padStart(3, '0');
  const nextF = `F-${pad(maxF + 1)}`;
  const nextD = `D-${pad(maxD + 1)}`;
  if (json) { console.log(JSON.stringify({ nextF, nextD, maxF, maxD, scanned: files.length })); return 0; }
  console.log(t('tasks.nextId', {
    nextF, nextD,
    maxF: maxF ? `F-${pad(maxF)}` : t('tasks.nextIdNone'),
    maxD: maxD ? `D-${pad(maxD)}` : t('tasks.nextIdNone'),
    files: files.length,
  }));
  return 0;
}

// ── selftest ─────────────────────────────────────────────────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => {
    if (cond) console.log(`  ✓ ${name}`);
    else { console.error(`  ✗ ${name}`); failed++; }
  };
  const config = { docsDir: 'docs' };
  const t = (key, params = {}) => `${key} ${Object.values(params).join(' ')}`.trim(); // 文案不在测,键名即输出
  const withRepo = (fn) => {
    const root = mkdtempSync(join(tmpdir(), 'wk-tasks-'));
    try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const capture = (fn) => {
    const logs = [];
    const ol = console.log; const oe = console.error;
    console.log = (...a) => logs.push(a.join(' '));
    console.error = (...a) => logs.push(a.join(' '));
    let code;
    try { code = fn(); } finally { console.log = ol; console.error = oe; }
    return { code, out: logs.join('\n') };
  };

  // 1. start:trio 三件落地、占位符填实、撞名 -2 递增、lite 单文件、非法字符消毒
  withRepo((root) => {
    let r = capture(() => mainStart({ root, config, t, args: ['甲任务'] }));
    assert(r.code === 0, 'start trio 建档成功');
    const base = join(root, 'docs', 'planning');
    const d1 = readdirSync(base).find((n) => n.endsWith('-甲任务'));
    assert(!!d1, 'start 目录名 = 日期-任务名');
    for (const f of ['task_plan.md', 'findings.md', 'progress.md']) assert(existsSync(join(base, d1, f)), `start 落 ${f}`);
    const plan = readFileSync(join(base, d1, 'task_plan.md'), 'utf8');
    assert(!plan.includes('<任务名>') && plan.includes('line: 甲任务'), 'start 占位符已填(任务名/日期)');
    r = capture(() => mainStart({ root, config, t, args: ['甲任务'] }));
    assert(r.code === 0 && existsSync(join(base, `${d1}-2`)), 'start 撞名后缀 -2 递增');
    r = capture(() => mainStart({ root, config, t, args: ['乙 任务:x', '--mode', 'lite'] }));
    assert(r.code === 0, 'start lite 成功');
    const d3 = readdirSync(base).find((n) => n.endsWith('乙-任务x'));
    assert(!!d3 && existsSync(join(base, d3, 'checkpoint.md')) && !existsSync(join(base, d3, 'task_plan.md')), 'start lite 单文件 + 名字消毒(空格→-,冒号剔除)');
    assert(capture(() => mainStart({ root, config, t, args: ['x', '--mode', 'trioo'] })).code === 2, 'start --mode 手滑拒绝');
    assert(capture(() => mainStart({ root, config, t, args: [] })).code === 2, 'start 缺任务名拒绝');
    const dry = capture(() => mainStart({ root, config, t, args: ['丙任务', '--dry-run'] }));
    assert(dry.code === 0 && !readdirSync(base).some((n) => n.endsWith('丙任务')), 'start --dry-run 零落盘');
  });

  // 2. note:发现进「## 发现」节(不落文件尾候选表)、决策进任务计划、progress 落文件尾;CRLF 保形
  withRepo((root) => {
    capture(() => mainStart({ root, config, t, args: ['丁任务'] }));
    const base = join(root, 'docs', 'planning');
    const d = readdirSync(base)[0];
    const fp = join(base, d, 'findings.md');
    let r = capture(() => mainNote({ root, config, t, args: ['丁任务', '--kind', 'finding', '--stdin'], stdinText: '- EOF\n- 第二行含 `$(rm -rf)` 也只是数据\n' }));
    assert(r.code === 0, 'note finding 成功');
    const fr = readFileSync(fp, 'utf8');
    const secIdx = fr.indexOf('## 发现');
    const nextIdx = fr.indexOf('## 外部资料');
    const hitIdx = fr.indexOf('- EOF');
    assert(hitIdx > secIdx && hitIdx < nextIdx, 'note finding 落「发现」节内(非文件尾候选表)');
    assert(fr.includes('$(rm -rf)'), 'note 内容当数据保真(shell 元字符原样)');
    r = capture(() => mainNote({ root, config, t, args: ['丁任务', '--kind', 'decision', '--stdin'], stdinText: '| 走方案A | 省一轮迁移 | D-901 |' }));
    assert(r.code === 0 && readFileSync(join(base, d, 'task_plan.md'), 'utf8').includes('| 走方案A |'), 'note decision 进任务计划决策表');
    // progress 文件尾账本语义 + CRLF 文件保形
    const ppp = join(base, d, 'progress.md');
    writeFileSync(ppp, readFileSync(ppp, 'utf8').replaceAll('\n', '\r\n'));
    r = capture(() => mainNote({ root, config, t, args: ['丁任务', '--kind', 'progress', '--stdin'], stdinText: '## 会话:2026-07-19\n- 做了:x' }));
    const pr = readFileSync(ppp, 'utf8');
    assert(r.code === 0 && pr.endsWith('- 做了:x\r\n'), 'note progress 落文件尾且 CRLF 保形');
    assert(capture(() => mainNote({ root, config, t, args: ['丁任务', '--kind', 'insight', '--stdin'], stdinText: 'x' })).code === 2, 'note 未知 kind 拒绝');
    assert(capture(() => mainNote({ root, config, t, args: ['丁任务', '--kind', 'finding', '--stdin'], stdinText: '  \n' })).code === 2, 'note 空内容拒绝');
    assert(capture(() => mainNote({ root, config, t, args: ['没这个', '--kind', 'finding', '--stdin'], stdinText: 'x' })).code === 2, 'note 任务不存在拒绝');
  });

  // 3. checkpoint:旧段迁 archive(原文照录)、热区留 2 段、--stdin 换前情、dry-run 零写
  withRepo((root) => {
    capture(() => mainStart({ root, config, t, args: ['戊任务'] }));
    const base = join(root, 'docs', 'planning');
    const d = readdirSync(base)[0];
    const pp = join(base, d, 'progress.md');
    let raw = readFileSync(pp, 'utf8');
    raw += ['## 会话:2026-07-01', '- 做了:第一段(最旧)', '', '## 会话:2026-07-02', '- 做了:第二段', '', '## 会话:2026-07-03', '- 做了:第三段(最新)', ''].join('\n');
    writeFileSync(pp, raw);
    // 模板自带 1 个会话段 + 追加 3 段 = 4 段;KEEP=2 ⇒ 迁 2 段
    const dry = capture(() => mainCheckpoint({ root, config, t, args: ['戊任务', '--dry-run'] }));
    assert(dry.code === 0 && !existsSync(join(base, d, 'progress-archive.md')), 'checkpoint --dry-run 零落盘');
    const r = capture(() => mainCheckpoint({ root, config, t, args: ['戊任务'], stdinText: '- 当前:阶段 2,下一步修门禁\n- 未解错误:无' }));
    assert(r.code === 0, 'checkpoint 执行成功');
    const after = readFileSync(pp, 'utf8');
    const arch = readFileSync(join(base, d, 'progress-archive.md'), 'utf8');
    assert(!after.includes('第一段(最旧)') && arch.includes('第一段(最旧)'), 'checkpoint 最旧段已迁 archive');
    assert(!after.includes('做了:<') && arch.includes('做了:<'), 'checkpoint 模板初始段(最旧)也迁');
    assert(after.includes('第二段') && after.includes('第三段(最新)'), 'checkpoint 热区留最近 2 段');
    assert(after.includes('- 当前:阶段 2,下一步修门禁'), 'checkpoint --stdin 换前情段');
    assert(arch.startsWith('---\n'), 'archive 新建带轻 frontmatter');
    // 幂等:再跑一次,4-2 已迁,剩 2 段 + 无 stdin ⇒ 无事可做
    const r2 = capture(() => mainCheckpoint({ root, config, t, args: ['戊任务'] }));
    assert(r2.code === 0 && r2.out.includes('checkpointNothing'), 'checkpoint 幂等(热区已是 2 段即无事可做)');
  });

  // 4. resume:分层输出 = task_plan + findings 全文 + progress 前情+最近2段;--full 全量
  withRepo((root) => {
    capture(() => mainStart({ root, config, t, args: ['己任务'] }));
    const base = join(root, 'docs', 'planning');
    const d = readdirSync(base)[0];
    const pp = join(base, d, 'progress.md');
    writeFileSync(pp, readFileSync(pp, 'utf8') + ['## 会话:2026-07-01', '- 旧段甲', '', '## 会话:2026-07-02', '- 旧段乙', '', '## 会话:2026-07-03', '- 新段丙', ''].join('\n'));
    const r = capture(() => mainResume({ root, config, t, args: ['己任务'] }));
    assert(r.code === 0 && r.out.includes('task_plan.md') && r.out.includes('findings.md'), 'resume 输出含 task_plan/findings');
    assert(r.out.includes('前情') && r.out.includes('新段丙') && r.out.includes('旧段乙'), 'resume 热区含前情+最近2段');
    assert(!r.out.includes('旧段甲'), 'resume 最旧段不进热区');
    const rf = capture(() => mainResume({ root, config, t, args: ['己任务', '--full'] }));
    assert(rf.out.includes('旧段甲'), 'resume --full 全量');
    assert(capture(() => mainResume({ root, config, t, args: [] })).code === 2, 'resume 缺任务名拒绝');
    // lite 任务:整文件即热视图
    capture(() => mainStart({ root, config, t, args: ['庚任务', '--mode', 'lite'] }));
    const rl = capture(() => mainResume({ root, config, t, args: ['庚任务'] }));
    assert(rl.code === 0 && rl.out.includes('checkpoint.md') && rl.out.includes('## 目标'), 'resume lite 输出单文件');
  });

  // 5. list:状态/阶段/ready 过滤与 --json
  withRepo((root) => {
    capture(() => mainStart({ root, config, t, args: ['辛任务'] }));
    capture(() => mainStart({ root, config, t, args: ['壬任务'] }));
    const base = join(root, 'docs', 'planning');
    const dirs = readdirSync(base).sort();
    const done = join(base, dirs.find((n) => n.endsWith('辛任务')), 'task_plan.md');
    writeFileSync(done, readFileSync(done, 'utf8').replaceAll('**状态:** in_progress', '**状态:** complete').replaceAll('**状态:** pending', '**状态:** complete'));
    const all = capture(() => mainList({ root, config, t, args: [] }));
    assert(all.code === 0 && all.out.includes('辛任务') && all.out.includes('壬任务'), 'list 列出全部在施任务');
    const ready = capture(() => mainList({ root, config, t, args: ['--ready'] }));
    assert(ready.out.includes('辛任务') && !ready.out.includes('壬任务'), 'list --ready 只留全阶段完成者');
    const j = JSON.parse(capture(() => mainList({ root, config, t, args: ['--json'] })).out);
    assert(Array.isArray(j) && j.length === 2 && j.some((x) => x.ready === true), 'list --json 机器可读且带 ready');
    const empty = capture(() => mainList({ root, config: { docsDir: 'nodocs' }, t, args: [] }));
    assert(empty.code === 0 && empty.out.includes('listNone'), 'list 无任务不报错');
  });

  // 6. next-id:全 docsDir 扫描取最大号 + 1
  withRepo((root) => {
    mkdirSync(join(root, 'docs', 'worklogs', 'x'), { recursive: true });
    writeFileSync(join(root, 'docs', 'worklogs', 'x', 'closeout.md'), '| F-007 | x | 进 experience |\nD-012 拍板\n');
    mkdirSync(join(root, 'docs', 'planning'), { recursive: true });
    writeFileSync(join(root, 'docs', 'planning', 'stray.md'), '正文提到 F-003 与 D-002\n');
    const r = capture(() => mainNextId({ root, config, t, args: ['--json'] }));
    const j = JSON.parse(r.out);
    assert(j.nextF === 'F-008' && j.nextD === 'D-013', 'next-id 取全仓最大号 +1');
    const r2 = capture(() => mainNextId({ root, config: { docsDir: 'nodocs' }, t, args: ['--json'] }));
    assert(JSON.parse(r2.out).nextF === 'F-001', 'next-id 空仓从 001 起');
  });

  if (failed) { console.error(`✗ tasks selftest:${failed} 项失败`); return 1; }
  console.log('✓ tasks selftest 全部通过');
  return 0;
}
