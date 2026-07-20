#!/usr/bin/env node
// release-selftest —— 真 package e2e(复审 P0-01(5)/D11):从最终 tgz 安装并 spawn bin,
// 不再只 import 私仓源码。进程内 e2e(src/e2e.mjs)看不见的断裂面在这里现形:
// files 清单漏文件、bin 头/权限、npm 装配路径、locales/模板随包分发、stdin 管道。
//
// 用法:node tools/release-selftest.mjs [源目录] [--full]
//   源目录缺省 = 本仓根;发布流程里传**净化导出树**(runbook §发布)。
//   --full 额外在装出的包上跑 `worklog-kit selftest` 全量(含 e2e,较慢)。
//
// 全程在 mkdtemp 临时目录:pack → 空白消费仓 npm install <tgz> → spawn 装出的 bin 走
// init/start/note(真 stdin)/checkpoint/resume/list/next-id/check/index/doctor 冒烟链。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDefault = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const FULL = argv.includes('--full');
const srcRoot = resolve(argv.find((a) => !a.startsWith('--')) || srcDefault);
if (!existsSync(join(srcRoot, 'package.json'))) {
  console.error(`[release-selftest] 源目录无 package.json:${srcRoot}`);
  process.exit(2);
}

// npm 在 Windows 是 .cmd:经 cmd.exe 固定命令串调用(与 sync-public 同款)。
// npm.cmd 的批处理 %* 透传会把内嵌引号当字面量(实测 --pack-destination "路径" 连引号
// 一起进了 npm),故命令串**不带引号**,含空白的路径提前拒——临时目录与常规仓路径无空白。
const npm = (cwd, cmdline) => (process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', `npm ${cmdline}`], { cwd, encoding: 'utf8' })
  : execFileSync('sh', ['-c', `npm ${cmdline}`], { cwd, encoding: 'utf8' }));
const noWs = (p, what) => {
  if (/\s/.test(p)) { console.error(`[release-selftest] ${what} 含空白字符,npm.cmd 引号透传不可靠,换无空白路径:${p}`); process.exit(2); }
  return p;
};

const work = mkdtempSync(join(tmpdir(), 'wk-release-'));
noWs(srcRoot, '源目录'); noWs(work, '临时目录');
let failedStep = null;
try {
  // 1. pack:exact tgz(与发布同一装配路径;cwd=work,tgz 直接落临时目录)
  npm(work, `pack --loglevel error ${srcRoot}`);
  const tgz = readdirSync(work).find((n) => n.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack 未产出 tgz');
  console.log(`[pack] ${tgz}`);

  // 2. 空白消费仓 + 从 tgz 安装(零依赖包,--prefer-offline 不吃 registry)
  const consumer = join(work, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), '{"name":"consumer-smoke","private":true}\n');
  execFileSync('git', ['init', '-q', consumer], { encoding: 'utf8' });
  npm(consumer, `install ${join(work, tgz)} --no-audit --no-fund --prefer-offline --loglevel error`);
  const bin = join(consumer, 'node_modules', 'worklog-kit', 'bin', 'worklog.mjs');
  if (!existsSync(bin)) throw new Error('装出的包缺 bin/worklog.mjs(files 清单断裂)');
  console.log('[install] tgz 安装完成,bin 在位');

  // 3. spawn 装出的 bin 走真实消费链(每步独立进程;stdin 步喂真管道)
  const run = (step, args, input) => {
    failedStep = step;
    const out = execFileSync(process.execPath, [bin, ...args], {
      cwd: consumer, encoding: 'utf8', ...(input !== undefined ? { input } : {}),
    });
    console.log(`[ok] ${step}`);
    return out;
  };
  run('init', ['init']);
  run('start', ['start', '发布冒烟']);
  run('note --stdin(真管道)', ['note', '发布冒烟', '--kind', 'finding', '--stdin'], '- 冒烟发现:tgz 安装面\n');
  run('checkpoint --stdin', ['checkpoint', '发布冒烟', '--stdin'], '- 当前:冒烟中\n- 未解错误:无\n');
  const resumeOut = run('resume', ['resume', '发布冒烟']);
  if (!resumeOut.includes('冒烟发现')) throw new Error('resume 输出缺 note 落的发现行');
  const listOut = run('list --json', ['list', '--json']);
  if (!JSON.parse(listOut).some((r) => r.dir.includes('发布冒烟'))) throw new Error('list --json 缺新任务');
  const idOut = run('next-id --json', ['next-id', '--json']);
  JSON.parse(idOut); // 形状即断言
  run('check', ['check']);
  run('index', ['index']);
  run('doctor', ['doctor']);
  if (FULL) run('selftest(--full)', ['selftest']);
  failedStep = null;

  console.log(`\n✓ release-selftest 全绿:tgz → install → spawn 消费链${FULL ? '(含全量 selftest)' : ''}`);
} catch (e) {
  const head = String(e.stdout || e.message || e).split('\n').slice(0, 15).join('\n');
  console.error(`\n✗ release-selftest 失败${failedStep ? `(步:${failedStep})` : ''}:\n${head}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
