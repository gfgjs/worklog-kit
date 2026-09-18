// read 命令：输出一份任务文档的接续视图或完整内容。
import { TaskError, loadTaskFile, resolveTaskArg } from './taskfile.mjs';
import { parseArgs } from './args.mjs';

export const parseReadArgs = (args) => parseArgs(args, [], ['--full']);

/** 默认视图：元数据 + ## 当前 + 被省略的详情标题及原文件行号。 */
export function renderTask(task) {
  const out = [
    `path: ${task.path}`,
    `title: ${task.title}`,
    `status: ${task.status}`,
    `summary: ${task.summary}`,
    '',
    '## 当前',
    ...task.current,
    '',
  ];
  if (task.details.length) {
    out.push('## 省略的详情', '');
    for (const d of task.details) out.push(`${'#'.repeat(d.level)} ${d.text} (line ${d.line})`);
    out.push('');
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

export function readMain(opts, rest, root = process.cwd()) {
  try {
    if (rest.length === 0) throw new TaskError('缺少任务文件路径');
    if (rest.length > 1) throw new TaskError('read 只接受一个任务文件路径');
    const { path, file } = resolveTaskArg(root, rest[0]);
    const task = loadTaskFile(file, path);
    if (opts['--full']) {
      process.stdout.write(task.raw.endsWith('\n') ? task.raw : `${task.raw}\n`);
      return 0;
    }
    process.stdout.write(renderTask(task));
    return 0;
  } catch (e) {
    process.stderr.write(`worklog-kit read：${e instanceof TaskError ? e.message : `内部错误 ${e.stack ?? e}`}\n`);
    return 2;
  }
}
