#!/usr/bin/env node
// 公私双源净化同步:私仓(开发源)HEAD 快照 → 剔除排除表路径 → 敏感词/通用模式终检
// **零命中才放行** → 覆写公开仓克隆工作树 → commit(--apply)→ push(--push)。
//
// 模型(2026-07-18 裁):私仓与 Scrollery 联动迭代 = 唯一开发源;公开仓 = 净化快照镜像,
// 不带私史(fresh-export 断档纪律的常态化)。流程契约见 docs/runbooks/sync-public.md。
//
// 敏感词表在 `.sync-blocklist.local.json`(gitignored)——真实值只活在那里,
// 本脚本只含通用模式(control bytes / 邮箱 / 用户目录路径),可安全导出公开。
//
// 用法:node tools/sync-public.mjs [--apply] [--push] [--selftest] [--offline]
//                                  [--public <path>] [--message <msg>]
//   无参 = dry-run:导出+终检+预览 diff,公仓工作树复原,不留痕。

import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
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

// ── 1. 前置:私仓树净、公仓克隆净且与 origin 齐平(否则先回灌,见 runbook)──
if (git(privateRoot, 'status', '--porcelain').trim() !== '')
  die('私仓工作树不净——导出的是 HEAD,先 commit 或 stash。');
if (!existsSync(join(publicRoot, '.git'))) die(`公仓克隆不存在:${publicRoot}(--public 指定)。`);
if (git(publicRoot, 'status', '--porcelain').trim() !== '')
  die('公仓克隆工作树不净——先处理残留改动。');
// R7-04:齐平校验读的是 main,commit 却落**当前 checkout 分支**——公仓停在别的分支时
// 检查与落点各说各话。收窄:必须就在 main 上。
const pubBranch = git(publicRoot, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
if (pubBranch !== 'main') die(`公仓克隆当前在 ${pubBranch},须 checkout main(齐平校验与 commit 均以 main 为锚)。`);
// R7-03:覆写步删 .git 外一切,而复原用 `clean -fd`(无 -x)——公仓里的 ignored 文件
// 一旦被删 git 无从恢复,dry-run 也一样。porcelain 不列 ignored,单独查;有即拒跑。
const ignored = git(publicRoot, 'status', '--porcelain', '--ignored')
  .split(/\r?\n/).filter((l) => l.startsWith('!!'));
if (ignored.length) {
  die(`公仓克隆含 ${ignored.length} 项 ignored 文件(覆写会删且无法从 git 恢复):\n  ${ignored.map((l) => l.slice(3)).join('\n  ')}\n先移走或删除再跑。`);
}
if (!OFFLINE) {
  execFileSync('git', ['fetch', 'origin'], { cwd: publicRoot, stdio: 'inherit' });
  const local = git(publicRoot, 'rev-parse', 'main').trim();
  const remote = git(publicRoot, 'rev-parse', 'origin/main').trim();
  if (local !== remote)
    die(`公仓 main(${local.slice(0, 7)})≠ origin/main(${remote.slice(0, 7)})——公仓有未推或未回灌笔。回灌:git format-patch + git apply 到私仓,推平后重跑。离线跳过检查用 --offline。`);
}

// ── 2..5 主流程。mkdtemp 之后的一切都包进 try/finally(R7-03):此前终检命中走
// process.exit(1)、门禁抛错走裸异常,两条路都绕过末尾唯一的 rmSync,TEMP 残留导出树
// (含私仓全量快照)。主流程只返回布尔、不 exit,退出码在 finally 之后统一给。
const work = mkdtempSync(join(tmpdir(), 'worklog-sync-'));
let ok = false;
try {
  ok = runSync(work);
} catch (e) {
  console.error(`[sync-public] 中止:${e.message}`);
  console.error(`[sync-public] 若已进入覆写步,公仓工作树可能半覆盖;复原:git -C ${publicRoot} reset && git checkout -- . && git clean -fd`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (!ok) process.exit(1);

function runSync(work) {
  // ── 2. 导出 HEAD 快照(git archive 走 .gitattributes 钉 LF,绕开工作树 EOL 污染)──
  const tarPath = join(work, 'export.tar');
  const exportDir = join(work, 'tree');
  mkdirSync(exportDir, { recursive: true });
  execFileSync('git', ['archive', '--format=tar', '-o', tarPath, 'HEAD'], { cwd: privateRoot });
  // 相对路径 + cwd:GNU tar 会把 `C:` 盘符冒号当远程主机语法,绝对 Windows 路径必炸;
  // 二进制显式挑 GNU tar(见 resolveTar),不吃调用方 shell 的 PATH 决定。
  execFileSync(resolveTar(), ['-xf', 'export.tar', '-C', 'tree'], { cwd: work });

  for (const rel of EXCLUDE) {
    // R7-04 containment:排除表是本地词表文件里的自由文本,`..` 条目会让 rmSync 越出
    // 导出树删到别处。resolve 后须仍在 exportDir **之内**(整树本身也不行)。
    const abs = resolve(exportDir, rel);
    if (!abs.startsWith(exportDir + sep)) { console.error(`[sync-public] 中止:excludePaths 条目越出导出树:${rel}`); return false; }
    if (existsSync(abs)) { rmSync(abs, { recursive: true, force: true }); console.log(`[排除] ${rel}`); }
  }

  // ── 3. 终检:词表命中 / control bytes / 邮箱白名单外 / 用户目录路径,零命中即门 ──
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const HOMEPATH_RE = /[A-Za-z]:[\\/]Users[\\/][^\s"'`)\]]+|\/(?:home|Users)\/[A-Za-z0-9._-]+/g;
  const allowed = (hit) => ALLOW_PATTERNS.some((p) => hit.includes(p));
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else files.push(abs);
    }
  })(exportDir);

  const violations = [];
  for (const abs of files) {
    const rel = abs.slice(exportDir.length + 1).replaceAll(sep, '/');
    const buf = readFileSync(abs);
    let ctrl = 0;
    for (const b of buf) if (b < 9 || b === 11 || b === 12 || (b > 13 && b < 32)) ctrl++;
    if (ctrl > 0) violations.push(`${rel}: control bytes ×${ctrl}(NUL/控制字符——git 会判二进制)`);
    const text = buf.toString('utf8');
    // R7-03:命中值**不复录进日志**——词表存的是敏感真实值,原文打印等于把它抄进
    // 终端记录/CI 日志再泄一次。报序号+长度,人对照本地词表即可定位。
    for (const [i, t] of TOKENS.entries())
      if (text.includes(t)) violations.push(`${rel}: 词表命中第 ${i + 1}/${TOKENS.length} 词(长 ${t.length};真实值见本地词表)`);
    for (const m of text.matchAll(EMAIL_RE))
      if (!ALLOW_EMAILS.has(m[0]) && !allowed(m[0])) violations.push(`${rel}: 邮箱「${m[0]}」不在白名单`);
    for (const m of text.matchAll(HOMEPATH_RE))
      if (!allowed(m[0])) violations.push(`${rel}: 用户目录路径「${m[0]}」`);
  }
  if (violations.length > 0) {
    console.error(`[sync-public] 终检 ${violations.length} 项命中(${files.length} 文件),拒绝同步:`);
    for (const v of violations) console.error('  - ' + v);
    return false;
  }
  console.log(`[终检] ${files.length} 文件零命中(词表 ${TOKENS.length} 词 + 通用模式)。`);

  // ── 4. 导出树内跑门禁:check + index 必过;--selftest 加跑全量 ─────────────
  const gate = (...a) => execFileSync(process.execPath, [join(exportDir, 'bin', 'worklog.mjs'), ...a], { cwd: exportDir, stdio: 'inherit' });
  gate('check');
  gate('index');
  if (SELFTEST) gate('selftest');
  console.log('[门禁] 导出树 check/index 绿' + (SELFTEST ? ' + selftest 绿' : '(全量自检用 --selftest)') + '。');

  // ── 5. 覆写公仓工作树(保 .git),预览 diff;--apply 才 commit ──────────────
  for (const name of readdirSync(publicRoot)) {
    if (name === '.git') continue;
    rmSync(join(publicRoot, name), { recursive: true, force: true });
  }
  cpSync(exportDir, publicRoot, { recursive: true });
  git(publicRoot, 'add', '-A');
  const stat = git(publicRoot, 'diff', '--cached', '--stat').trim();
  if (stat === '') {
    console.log('[同步] 两源内容已一致,无事可做。');
    git(publicRoot, 'reset');
  } else {
    console.log('[预览] 公仓待落变更:\n' + stat);
    if (!APPLY) {
      git(publicRoot, 'reset');
      git(publicRoot, 'checkout', '--', '.');
      execFileSync('git', ['clean', '-fd'], { cwd: publicRoot });
      console.log('[dry-run] 公仓已复原。确认无误后加 --apply 落 commit,--push 推远端。');
    } else {
      const msg = opt('--message', `sync: 私源净化快照 ${new Date().toISOString().slice(0, 10)}`);
      git(publicRoot, 'commit', '-m', msg);
      console.log('[commit] ' + git(publicRoot, 'log', '--oneline', '-1').trim());
      if (PUSH) {
        execFileSync('git', ['push', 'origin', 'main'], { cwd: publicRoot, stdio: 'inherit' });
        console.log('[push] origin/main 已更新。');
      } else {
        console.log('[待推] 复核后 git -C 公仓 push origin main,或重跑加 --push。');
      }
    }
  }
  return true;
}
