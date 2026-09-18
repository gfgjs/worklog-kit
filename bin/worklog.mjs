#!/usr/bin/env node
// worklog-kit CLI:init / context / check 三个入口。零运行依赖。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PKG_ROOT } from '../src/lib/paths.mjs';
import { runContext } from '../src/context.mjs';
import { runCheck } from '../src/check.mjs';
import { DEFAULT_SKILL_TARGET, runInit } from '../src/init.mjs';

const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

const HELP = `worklog-kit ${pkg.version}

任务中枢工具:定位任务、按角色提取接续材料、检查本地文档引用。

用法:
  worklog-kit init [skill目标目录]
      把包内 skills/worklog 整目录导出到目标目录。
      默认目标:${DEFAULT_SKILL_TARGET}(相对当前目录)。
      已有内容完全相同的文件跳过;存在冲突时预检后整体停止,不覆盖、不部分复制。
      不写项目 AGENTS、CI 或任务文件。

  worklog-kit context [任务目录或任务名] [--role explore|design|implement|accept] [--unit T1]
      不带任务时列出 docs/tasks 下未完成任务的名称与阶段。
      任务名按 docs/tasks 下的目录名解析;也可给仓根内路径。
      不带 --role 时只输出 state.md 状态。
      --role 决定追加的 details.md 章节;implement 必须带 --unit。

  worklog-kit check [路径]
      检查本地 Markdown 链接与片段、任务核心格式与状态指向的单元。
      默认范围:docs,并跳过 docs/history。
      显式指定 docs/history(或其子路径)时才按历史材料检查。
      退出码:0 通过;1 发现问题;2 输入或运行错误。

全局:
  -h, --help     显示本帮助
  -v, --version  显示版本
`;

/** 各命令允许的参数。 */
const SPECS = {
  init: { flags: [], values: [] },
  context: { flags: [], values: ['--role', '--unit'] },
  check: { flags: [], values: [] },
};

function fail(messages, code = 2) {
  for (const m of messages) console.error(m);
  return code;
}

function parseArgs(cmd, args) {
  const spec = SPECS[cmd];
  const out = { positional: [], role: null, unit: null, unknown: [], missingValue: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (spec.values.includes(arg)) {
        const value = args[i + 1];
        if (value === undefined || value.startsWith('-')) {
          out.missingValue.push(arg);
          continue;
        }
        i += 1;
        if (arg === '--role') out.role = value;
        else out.unit = value;
        continue;
      }
      out.unknown.push(arg);
      continue;
    }
    out.positional.push(arg);
  }
  return out;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  // 全局开关:任何位置都只打印帮助或版本,不执行命令
  if (cmd === undefined || cmd === '--help' || cmd === '-h' || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  if (cmd === '--version' || cmd === '-v' || args.includes('--version') || args.includes('-v')) {
    console.log(pkg.version);
    return 0;
  }
  if (!Object.hasOwn(SPECS, cmd)) {
    return fail([`未知命令：${cmd}`, '可用命令：init、context、check。用 --help 查看用法。']);
  }
  const parsed = parseArgs(cmd, args);
  if (parsed.unknown.length > 0) {
    return fail([`${cmd} 不支持的参数：${parsed.unknown.join(' ')}`, '用 --help 查看用法。']);
  }
  if (parsed.missingValue.length > 0) {
    return fail([`${parsed.missingValue.join(' ')} 缺少参数值`, '用 --help 查看用法。']);
  }
  if (parsed.positional.length > 1) {
    return fail([`${cmd} 只接受一个位置参数,收到：${parsed.positional.join(' ')}`, '用 --help 查看用法。']);
  }

  const root = process.cwd();
  const target = parsed.positional[0] ?? null;
  if (cmd === 'init') {
    const result = runInit({ root, cwd: root, target });
    for (const m of result.messages) (result.code === 0 ? console.log : console.error)(m);
    return result.code;
  }
  if (cmd === 'context') {
    const result = runContext({ root, cwd: root, target, role: parsed.role, unit: parsed.unit });
    if (result.text) console.log(result.text);
    if (result.messages) for (const m of result.messages) console.error(m);
    return result.code;
  }
  const result = runCheck({ root, cwd: root, scope: target ?? 'docs' });
  if (result.text) console.log(result.text);
  if (result.messages) for (const m of result.messages) console.error(m);
  return result.code;
}

process.exitCode = main();
