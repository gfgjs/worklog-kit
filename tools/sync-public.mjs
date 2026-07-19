#!/usr/bin/env node
// 公私双源净化同步:私仓(开发源)HEAD 快照 → allowlist 默认拒发 → 剔除排除表路径
// → 敏感词/通用模式终检(导出树 + exact package tgz + 公史全 refs)**零命中才放行**
// → 一次性临时克隆里 overlay+commit → 成功才 fast-forward 公仓(--apply)→ push(--push)。
//
// 模型(2026-07-18 裁 + 复审 P1-05 事务化):私仓与 Scrollery 联动迭代 = 唯一开发源;
// 公开仓 = 净化快照镜像,不带私史(fresh-export 断档纪律的常态化)。
// 事务边界:一切 mutate 先落**临时克隆**(disposable clone),失败整个丢弃,常驻公仓克隆
// 与远端在 --apply 的 ff 之前一个字节不动——不再有「半覆盖工作树 + 人工复原命令」路径。
// 流程契约见 docs/runbooks/sync-public.md。
//
// 公开面三层门(层层收窄):
//   1. `.sync-allowlist.json`(**入库**,只含公开路径名)——默认拒发:导出树里不在
//      清单的路径直接剔除并汇总报告。tracked-default-publish 的反转:漏登记 = 不公开,
//      而不是漏 exclude = 公开。
//   2. `.sync-blocklist.local.json`(gitignored)excludePaths——私有路径减法,真实路径
//      只活在本地词表,不入库不进日志。
//   3. 终检扫描(词表 tokens / control bytes / 邮箱白名单外 / 用户目录路径)——对导出树、
//      `npm pack` 的 exact tgz 内容、公仓全 refs 历史(tokens)三面同扫。
//
// 用法:node tools/sync-public.mjs [--apply] [--push] [--selftest] [--offline]
//                                  [--public <path>] [--message <msg>] [--init-allowlist]
//                                  [--scan-only [路径]]
//   无参 = dry-run:导出+净化+终检+临时克隆预览 diff 后整体丢弃,公仓零接触。
//   --init-allowlist = 从当前导出树(剔除排除表后)生成初版 allowlist 并退出,人工 review 后入库。
//   --scan-only [路径] = 只跑终检扫描(词表/control bytes/邮箱/用户目录路径),直接扫**私仓
//     工作树**(缺省整仓,可传子路径只扫一个任务目录),不碰公仓、不 pack、不需 allowlist——
//     收口(归档进 docs/worklogs/ 之前)、任何怕手滑写进敏感值的时刻,独立跑这条即可,
//     比等下次完整 sync 才发现要早一步(见 docs/runbooks/sync-public.md)。

import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const privateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const APPLY = flag('--apply');
const PUSH = flag('--push');
const SELFTEST = flag('--selftest');
const OFFLINE = flag('--offline');
const INIT_ALLOWLIST = flag('--init-allowlist');
const SCAN_ONLY = flag('--scan-only');
const publicRoot = resolve(privateRoot, opt('--public', join('..', 'worklog-kit-public')));

const git = (cwd, ...a) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...a], { cwd, encoding: 'utf8' });
const die = (msg) => { console.error(`[sync-public] 中止:${msg}`); process.exit(1); };

// GNU tar 显式定位:Windows System32 的 tar.exe 是 bsdtar(libarchive),啃不动 git archive
// 的 pax/UTF-8 中文路径头(报 "Invalid empty pathname");GNU tar(Git 自带 usr/bin/tar.exe)
// 才干净往返。裸 `tar` 走 PATH 会被调用方 shell 决定(PowerShell 拿 System32、Git Bash 拿
// GNU),同一脚本行为分叉。故显式挑 GNU tar,同步不再吃调用方 shell。*nix 的 tar 解 pax 无碍,直接用。
function resolveTar() {
  if (process.platform !== 'win32') return 'tar';
  const cands = [];
  // git --exec-path 给 <git>/mingw64/libexec/git-core;上溯三层到 <git> 再下 usr/bin/tar.exe(装法/盘符无关)
  try {
    const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    if (execPath) cands.push(resolve(execPath, '..', '..', '..', 'usr', 'bin', 'tar.exe'));
  } catch { /* git 不在 PATH:ProgramFiles 兜底,再不成 die */ }
  for (const pf of [process.env.ProgramW6432, process.env.ProgramFiles, 'C:\\Program Files']) {
    if (pf) cands.push(join(pf, 'Git', 'usr', 'bin', 'tar.exe'));
  }
  for (const cand of cands) {
    if (!existsSync(cand)) continue;
    try {
      if (execFileSync(cand, ['--version'], { encoding: 'utf8' }).includes('GNU tar')) return cand;
    } catch { /* 该候选跑不起来:试下一个 */ }
  }
  die('Windows 下找不到 GNU tar(System32 的 bsdtar 啃不动 git archive 的 UTF-8 路径)。'
    + '装 Git for Windows 即带 usr/bin/tar.exe,或从 Git Bash 跑本脚本。');
}

// ── 0. 词表硬门:没有本地词表就不许跑——防「忘了终检」的裸同步 ─────────────
const blocklistPath = join(privateRoot, '.sync-blocklist.local.json');
if (!existsSync(blocklistPath)) {
  die(`缺 ${blocklistPath}(gitignored 本地词表)。首次使用照 docs/runbooks/sync-public.md 建立;丢失则从私史 no-leak commits 重提取。`);
}
const bl = JSON.parse(readFileSync(blocklistPath, 'utf8'));
const TOKENS = bl.tokens ?? [];
const EXCLUDE = bl.excludePaths ?? [];
const ALLOW_EMAILS = new Set(bl.allowEmails ?? []);
const ALLOW_PATTERNS = bl.allowPatterns ?? [];
if (TOKENS.length === 0) die('词表 tokens 为空——不可能是对的,拒跑。');

// ── --scan-only:独立诊断,不接触公仓/allowlist/pack,直扫**活工作树**(含未 commit
// 的改动——收口前扫任务目录正是要在写死进 worklogs 之前拦下,不能等 HEAD 快照)──
if (SCAN_ONLY) {
  const targetArg = args.find((a) => !a.startsWith('--'));
  const target = targetArg ? resolve(privateRoot, targetArg) : privateRoot;
  if (!existsSync(target)) die(`扫描目标不存在:${target}`);
  // 词表本地文件自身逐字含全部真实值(它就是词表存放处),扫它是自触发噪声,须跳过;
  // EXCLUDE 里的身份勾连件本就永不导出,同样跳过(诊断价值 = 提醒真会外泄的东西)。
  const skip = new Set(['.git', 'node_modules', basename(blocklistPath)]);
  const { files, violations } = scanTree(target, '工作树', skip, EXCLUDE);
  if (violations.length) {
    console.error(`[scan-only] ${target} 下 ${violations.length} 项命中(${files} 文件),拒绝(值未回显,见本地词表定位):`);
    for (const v of violations) console.error('  - ' + v);
    process.exit(1);
  }
  console.log(`[scan-only] ${target}:${files} 文件零命中(词表 ${TOKENS.length} 词 + 通用模式)。`);
  process.exit(0);
}

// ── 0b. allowlist 硬门(复审 P1-05):公开面须显式声明,默认拒发 ────────────
// 入库文件,只含**允许公开**的路径名(公开路径本身无密可泄)。条目形态:
//   `dir/`  = 该顶层(或嵌套)目录整树允许;`file` = 恰这一个文件允许。
const allowlistPath = join(privateRoot, '.sync-allowlist.json');
let ALLOW = null;
if (!INIT_ALLOWLIST) {
  if (!existsSync(allowlistPath)) {
    die(`缺 .sync-allowlist.json(入库的公开面清单;默认拒发的声明面)。初次生成:node tools/sync-public.mjs --init-allowlist,review 后 commit。`);
  }
  ALLOW = JSON.parse(readFileSync(allowlistPath, 'utf8')).allow;
  if (!Array.isArray(ALLOW) || ALLOW.length === 0) die('.sync-allowlist.json 的 allow 数组为空/缺失——全拒发不可能是对的,拒跑。');
}
const isAllowed = (rel) =>
  ALLOW.some((e) => (e.endsWith('/') ? rel === e.slice(0, -1) || rel.startsWith(e) : rel === e));

// ── 1. 前置:私仓树净、公仓克隆净且与 origin 齐平(否则先回灌,见 runbook)。
//    --init-allowlist 只读 HEAD 导出、不碰公仓,整节跳过(树净与否不影响清单生成)──
if (!INIT_ALLOWLIST) {
if (git(privateRoot, 'status', '--porcelain').trim() !== '')
  die('私仓工作树不净——导出的是 HEAD,先 commit 或 stash。');
if (!existsSync(join(publicRoot, '.git'))) die(`公仓克隆不存在:${publicRoot}(--public 指定)。`);
if (git(publicRoot, 'status', '--porcelain').trim() !== '')
  die('公仓克隆工作树不净——先处理残留改动。');
// R7-04:齐平校验读的是 main,ff 落点也是**当前 checkout 分支**——公仓停在别的分支时
// 检查与落点各说各话。收窄:必须就在 main 上。
const pubBranch = git(publicRoot, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
if (pubBranch !== 'main') die(`公仓克隆当前在 ${pubBranch},须 checkout main(齐平校验与 ff 均以 main 为锚)。`);
// R7-03 残留意义(事务化后):覆写步已迁临时克隆,公仓不再被 rm;但 --apply 的 ff 会
// checkout 新树,git 对 ignored 文件与新增同名路径的碰撞是**静默覆写**——仍有丢失面,保留此门。
const ignored = git(publicRoot, 'status', '--porcelain', '--ignored')
  .split(/\r?\n/).filter((l) => l.startsWith('!!'));
if (ignored.length) {
  die(`公仓克隆含 ${ignored.length} 项 ignored 文件(ff checkout 撞同名路径会静默覆写):\n  ${ignored.map((l) => l.slice(3)).join('\n  ')}\n先移走或删除再跑。`);
}
if (!OFFLINE) {
  execFileSync('git', ['fetch', 'origin'], { cwd: publicRoot, stdio: 'inherit' });
  const local = git(publicRoot, 'rev-parse', 'main').trim();
  const remote = git(publicRoot, 'rev-parse', 'origin/main').trim();
  if (local !== remote)
    die(`公仓 main(${local.slice(0, 7)})≠ origin/main(${remote.slice(0, 7)})——公仓有未推或未回灌笔。回灌:git format-patch + git apply 到私仓,推平后重跑。离线跳过检查用 --offline。`);
}
}

// ── 2..6 主流程。mkdtemp 之后的一切都包进 try/finally(R7-03):终检命中/门禁抛错
// 任一路径都不得绕过临时目录清理(内含私仓全量快照 + tokens 模式文件)。
// 主流程只返回布尔、不 exit,退出码在 finally 之后统一给。
const work = mkdtempSync(join(tmpdir(), 'worklog-sync-'));
let ok = false;
try {
  ok = runSync(work);
} catch (e) {
  console.error(`[sync-public] 中止:${e.message}`);
  console.error('[sync-public] 事务模型:全部 mutate 在临时克隆内,已随本次失败丢弃;常驻公仓克隆与远端未被触碰。');
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (!ok) process.exit(1);

/** 终检扫描(单一实现,导出树/tgz 内容树/scan-only 工作树三处共用):词表命中 /
 *  control bytes / 邮箱白名单外 / 用户目录路径。命中报告全部脱敏(R7-03/复审 P1-05):
 *  值不入日志,只报文件(公开件路径可示)+ 类别 + 序号/长度,操作者本地对照定位。
 *  skipDirs:导出树/tgz 已是净化过的候选公开集,不必跳;scan-only 直扫活工作树,
 *  须跳 `.git`(内含全部历史,规模与语义都不该被当「即将发布的文件」逐个扫)。
 *  excludeRel:身份勾连件永不导出(runbook 纪律 5)——这些路径本就在 EXCLUDE 减法里,
 *  导出树/tgz 早已不含它们;scan-only 直扫工作树时若不同样跳过,会对「反正不会发布
 *  的私有文档」逐次误报,拿掉这条就失去「只提醒真会外泄的东西」这个诊断价值。 */
function scanTree(rootDir, label, skipDirs = new Set(), excludeRel = []) {
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const HOMEPATH_RE = /[A-Za-z]:[\\/]Users[\\/][^\s"'`)\]]+|\/(?:home|Users)\/[A-Za-z0-9._-]+/g;
  const allowed = (hit) => ALLOW_PATTERNS.some((p) => hit.includes(p));
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (skipDirs.has(name)) continue;
      const abs = join(dir, name);
      const rel0 = abs.slice(rootDir.length + 1).replaceAll(sep, '/');
      if (excludeRel.some((e) => rel0 === e || rel0.startsWith(`${e}/`))) continue;
      if (statSync(abs).isDirectory()) walk(abs);
      else files.push(abs);
    }
  })(rootDir);
  const violations = [];
  for (const abs of files) {
    const rel = abs.slice(rootDir.length + 1).replaceAll(sep, '/');
    const buf = readFileSync(abs);
    let ctrl = 0;
    for (const b of buf) if (b < 9 || b === 11 || b === 12 || (b > 13 && b < 32)) ctrl++;
    if (ctrl > 0) violations.push(`${rel}: control bytes ×${ctrl}(NUL/控制字符——git 会判二进制)`);
    const text = buf.toString('utf8');
    for (const [i, t] of TOKENS.entries())
      if (text.includes(t)) violations.push(`${rel}: 词表命中第 ${i + 1}/${TOKENS.length} 词(长 ${t.length};真实值见本地词表)`);
    for (const m of text.matchAll(EMAIL_RE))
      if (!ALLOW_EMAILS.has(m[0]) && !allowed(m[0])) violations.push(`${rel}: 邮箱命中(长 ${m[0].length},白名单外;真实值本地 grep 该文件)`);
    for (const m of text.matchAll(HOMEPATH_RE))
      if (!allowed(m[0])) violations.push(`${rel}: 用户目录路径命中(长 ${m[0].length};真实值本地 grep 该文件)`);
  }
  return { files: files.length, violations, label };
}

function runSync(work) {
  // ── 2. 导出 HEAD 快照(git archive 走 .gitattributes 钉 LF,绕开工作树 EOL 污染)──
  const tarPath = join(work, 'export.tar');
  const exportDir = join(work, 'tree');
  const tar = resolveTar();
  mkdirSync(exportDir, { recursive: true });
  execFileSync('git', ['archive', '--format=tar', '-o', tarPath, 'HEAD'], { cwd: privateRoot });
  // 相对路径 + cwd:GNU tar 会把 `C:` 盘符冒号当远程主机语法,绝对 Windows 路径必炸;
  // 二进制显式挑 GNU tar(见 resolveTar),不吃调用方 shell 的 PATH 决定。
  execFileSync(tar, ['-xf', 'export.tar', '-C', 'tree'], { cwd: work });

  // ── 2a. 排除表减法(本地私有路径;先减再算 allowlist/初版生成,两清单语义正交)──
  for (const [i, rel] of EXCLUDE.entries()) {
    // R7-04 containment:排除表是本地词表文件里的自由文本,`..` 条目会让 rmSync 越出
    // 导出树删到别处。resolve 后须仍在 exportDir **之内**(整树本身也不行)。
    const abs = resolve(exportDir, rel);
    // R7-03 脱敏(复审 P1-05):excludePaths 是本地私有路径,不原文入日志(终端/CI 记录再泄一次)。
    // 只报序号+长度,操作者对照本地词表定位。
    if (!abs.startsWith(exportDir + sep)) { console.error(`[sync-public] 中止:excludePaths 第 ${i + 1}/${EXCLUDE.length} 条越出导出树(长 ${rel.length};见本地词表)`); return false; }
    if (existsSync(abs)) { rmSync(abs, { recursive: true, force: true }); console.log(`[排除] 第 ${i + 1}/${EXCLUDE.length} 条(长 ${rel.length})`); }
  }

  // ── 2b. --init-allowlist:从净化后导出树生成初版清单(顶层粒度),review 后入库 ──
  if (INIT_ALLOWLIST) {
    const entries = readdirSync(exportDir).sort()
      .map((n) => (statSync(join(exportDir, n)).isDirectory() ? `${n}/` : n));
    writeFileSync(allowlistPath, `${JSON.stringify({
      _note: '公开面 allowlist(默认拒发):不在此清单的路径不会同步到公仓。dir/=整树,file=单文件。加行须 review——这是公开面的唯一声明点。',
      allow: entries,
    }, null, 2)}\n`);
    console.log(`[init] 已生成 ${allowlistPath}(${entries.length} 条,顶层粒度):\n  ${entries.join('\n  ')}`);
    console.log('[init] review 后 git add/commit 入库;需更细粒度(如只放 docs/ 部分子目录)手工编辑。');
    return true;
  }

  // ── 2c. allowlist 执法:不在清单的路径剔除并汇总(默认拒发;路径名可能私有,只报
  //        顶层聚合计数,不落全路径)──
  {
    const denied = [];
    (function walk(dir) {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        const rel = abs.slice(exportDir.length + 1).replaceAll(sep, '/');
        const isDir = statSync(abs).isDirectory();
        if (isAllowed(isDir ? `${rel}/` : rel) || (isDir && ALLOW.some((e) => e.startsWith(`${rel}/`)))) {
          // 目录整体允许,或其内部有更深的允许条目 ⇒ 继续下钻;文件允许 ⇒ 留
          if (isDir) walk(abs);
          continue;
        }
        denied.push(rel.split('/')[0]);
        rmSync(abs, { recursive: true, force: true });
      }
    })(exportDir);
    if (denied.length) {
      const byTop = {};
      for (const d of denied) byTop[d] = (byTop[d] ?? 0) + 1;
      console.log(`[allowlist] 默认拒发 ${denied.length} 项(按顶层:${Object.entries(byTop).map(([k, v]) => `${k}×${v}`).join('、')});确需公开则加进 .sync-allowlist.json`);
    }
  }

  // ── 3. 终检:导出树 + exact package tgz 内容,零命中即门 ─────────────────────
  const treeScan = scanTree(exportDir, '导出树');
  // npm pack 产出 exact tgz(与将来发布同一装配路径),解开重扫:门禁面 = 消费者拿到的字节
  let pkgScan = { files: 0, violations: [], label: 'package tgz' };
  {
    // --loglevel error:npm notice 全量清单走 stderr,会淹掉本脚本的脱敏报告面。
    // Windows 上 npm 是 .cmd,经 cmd.exe 显式调(固定命令串,无用户输入拼接;
    // execFileSync+shell:true 会触 DEP0190 且逐参拼接语义含糊)。
    const packOut = (process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm pack --loglevel error'], { cwd: exportDir, encoding: 'utf8' })
      : execFileSync('npm', ['pack', '--loglevel', 'error'], { cwd: exportDir, encoding: 'utf8' })).trim();
    const tgzName = packOut.split(/\r?\n/).pop().trim();
    const tgzTmp = join(work, tgzName);
    renameSync(join(exportDir, tgzName), tgzTmp); // 移出导出树:tgz 本身绝不进公仓 overlay
    const pkgDir = join(work, 'pkg');
    mkdirSync(pkgDir, { recursive: true });
    execFileSync(tar, ['-xzf', tgzName, '-C', 'pkg'], { cwd: work });
    pkgScan = scanTree(pkgDir, 'package tgz');
  }
  const violations = [...treeScan.violations.map((v) => `[树] ${v}`), ...pkgScan.violations.map((v) => `[tgz] ${v}`)];
  if (violations.length > 0) {
    console.error(`[sync-public] 终检 ${violations.length} 项命中(树 ${treeScan.files} + tgz ${pkgScan.files} 文件),拒绝同步:`);
    for (const v of violations) console.error('  - ' + v);
    return false;
  }
  console.log(`[终检] 导出树 ${treeScan.files} + tgz ${pkgScan.files} 文件零命中(词表 ${TOKENS.length} 词 + 通用模式)。`);

  // ── 4. 导出树内跑门禁:check + index 必过;--selftest 加跑全量 ─────────────
  const gate = (...a) => execFileSync(process.execPath, [join(exportDir, 'bin', 'worklog.mjs'), ...a], { cwd: exportDir, stdio: 'inherit' });
  gate('check');
  gate('index');
  if (SELFTEST) gate('selftest');
  console.log('[门禁] 导出树 check/index 绿' + (SELFTEST ? ' + selftest 绿' : '(全量自检用 --selftest)') + '。');

  // ── 5. disposable clone:overlay+commit 全落临时克隆;dry-run 在此终止,公仓零接触 ──
  const pubClone = join(work, 'pub');
  execFileSync('git', ['clone', '-q', '--branch', 'main', publicRoot, pubClone], { encoding: 'utf8' });
  // 公史全 refs 的 tokens 扫描(复审 P1-05 第 3 点):已发布历史里若有词表命中,自动流程
  // 不可能修复(要动公史),必须停下交人裁决。模式经 -f 文件传递(临时目录内,finally 即焚),
  // -l 只报 rev:path,不回显命中行。
  {
    const patterns = join(work, 'patterns.txt');
    writeFileSync(patterns, TOKENS.join('\n') + '\n');
    const revs = git(pubClone, 'rev-list', '--all').trim().split(/\r?\n/).filter(Boolean);
    const histHits = [];
    for (const rev of revs) {
      try {
        const out = execFileSync('git', ['grep', '-I', '-F', '-l', '-f', patterns, rev], { cwd: pubClone, encoding: 'utf8' });
        for (const line of out.trim().split(/\r?\n/)) if (line) histHits.push(line);
      } catch { /* git grep 无命中即非零退出:这正是想要的干净态 */ }
    }
    if (histHits.length) {
      console.error(`[sync-public] 公史扫描命中 ${histHits.length} 处(全 ${revs.length} refs;仅示 rev:path,值不回显):`);
      for (const h of histHits) console.error('  - ' + h);
      console.error('[sync-public] 已发布历史含词表值——自动流程到此为止,处置(改史/换密钥/接受)须人工裁决。');
      return false;
    }
    console.log(`[公史] ${revs.length} 个 rev 全树 tokens 零命中。`);
  }
  for (const name of readdirSync(pubClone)) {
    if (name === '.git') continue;
    rmSync(join(pubClone, name), { recursive: true, force: true });
  }
  cpSync(exportDir, pubClone, { recursive: true });
  git(pubClone, 'add', '-A');
  const stat = git(pubClone, 'diff', '--cached', '--stat').trim();
  if (stat === '') {
    console.log('[同步] 两源内容已一致,无事可做。');
    return true;
  }
  console.log('[预览] 公仓待落变更:\n' + stat);
  if (!APPLY) {
    console.log('[dry-run] 临时克隆随即丢弃,公仓零接触。确认无误后加 --apply 落 commit 并 ff 公仓,--push 推远端。');
    return true;
  }
  const msg = opt('--message', `sync: 私源净化快照 ${new Date().toISOString().slice(0, 10)}`);
  git(pubClone, 'commit', '-m', msg);
  console.log('[commit] ' + git(pubClone, 'log', '--oneline', '-1').trim());

  // ── 6. 全绿才动常驻公仓:fetch 临时克隆 + ff-only(非 ff 即拒,公仓保持一致态)──
  git(publicRoot, 'fetch', pubClone, 'main');
  git(publicRoot, 'merge', '--ff-only', 'FETCH_HEAD');
  console.log('[ff] 公仓克隆 main 已推进到净化快照笔。');
  if (PUSH) {
    execFileSync('git', ['push', 'origin', 'main'], { cwd: publicRoot, stdio: 'inherit' });
    console.log('[push] origin/main 已更新。');
  } else {
    console.log('[待推] 复核后 git -C 公仓 push origin main,或重跑加 --push。');
  }
  return true;
}
