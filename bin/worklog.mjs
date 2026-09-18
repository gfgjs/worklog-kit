#!/usr/bin/env node
// worklog-kit CLI：docs/tasks 任务清单与读取。用法见 `worklog-kit help`。
import { listMain, parseListArgs } from '../src/list.mjs';
import { readMain, parseReadArgs } from '../src/read.mjs';

const USAGE = `worklog-kit — docs/tasks 任务清单与读取

用法：
  worklog-kit list [关键词] [--status <状态>] [--all] [--json]
  worklog-kit read <docs/tasks/...md> [--full]
  worklog-kit help

list  列出任务，按路径排序。默认只列 planned 与 active；关键词匹配 title、summary 与 path。
      --status <状态>  只看指定状态（planned|active|done|cancelled）
      --all            列出全部状态（与 --status 互斥）
      --json           输出 JSON 数组 [{path,title,status,summary}]
read  输出一份任务文档。默认给出元数据、## 当前 一节，以及被省略的详情标题与原文件行号；
      --full           输出完整文件

在项目根目录（当前工作目录）调用。两个命令都只读，不创建、不修改任何文件。
退出码：0 成功（含空结果）；2 参数、格式、路径或读写错误。`;

const dispatch = (argv) => {
  const [cmd, ...args] = argv;
  if (cmd === undefined || cmd === 'help' || cmd === '-h' || cmd === '--help' || args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    return 0;
  }
  if (cmd === 'list') {
    const parsed = parseListArgs(args);
    if (parsed === null) return badArgs('list', args);
    return listMain(parsed.opts, parsed.rest);
  }
  if (cmd === 'read') {
    const parsed = parseReadArgs(args);
    if (parsed === null) return badArgs('read', args);
    return readMain(parsed.opts, parsed.rest);
  }
  console.error(`未知命令：${cmd}；用 \`worklog-kit help\` 查看用法`);
  return 2;
};

const badArgs = (cmd, args) => {
  console.error(`worklog-kit ${cmd}：无法识别的参数 ${args.join(' ')}（用 \`worklog-kit help\` 查看用法）`);
  return 2;
};

process.exitCode = dispatch(process.argv.slice(2));
