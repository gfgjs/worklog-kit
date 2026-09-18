// list 命令：列出 docs/tasks 下的任务，默认只列 planned 与 active。
import { STATUSES, TaskError, loadAllTasks } from './taskfile.mjs';
import { parseArgs } from './args.mjs';

export const parseListArgs = (args) => parseArgs(args, ['--status'], ['--all', '--json']);

/** 过滤后按路径排序的任务（纯函数，便于定点测试）。 */
export function selectTasks(tasks, { keyword = '', statuses = ['planned', 'active'] } = {}) {
  const q = keyword.trim().toLowerCase();
  return tasks
    .filter((t) => statuses.includes(t.status))
    .filter((t) => !q || `${t.title}\n${t.summary}\n${t.path}`.toLowerCase().includes(q))
    .map(({ path, title, status, summary }) => ({ path, title, status, summary }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function listMain(opts, rest, root = process.cwd()) {
  try {
    if (rest.length > 1) throw new TaskError('list 最多接受一个关键词');
    const asked = opts['--status'] ?? [];
    if (asked.length && opts['--all']) throw new TaskError('--status 与 --all 互斥');
    if (asked.length > 1) throw new TaskError('--status 只能给一次');
    if (asked.length && !STATUSES.includes(asked[0])) {
      throw new TaskError(`未知状态 ${asked[0]}；可用：${STATUSES.join('|')}`);
    }
    const statuses = asked.length ? asked : opts['--all'] ? STATUSES : ['planned', 'active'];
    const rows = selectTasks(loadAllTasks(root), { keyword: rest[0] ?? '', statuses });
    if (opts['--json']) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    } else if (rows.length) {
      process.stdout.write(`${rows.map((r) => `${r.path}\t${r.status}\t${r.title}\t${r.summary}`).join('\n')}\n`);
    }
    return 0;
  } catch (e) {
    process.stderr.write(`worklog-kit list：${e instanceof TaskError ? e.message : `内部错误 ${e.stack ?? e}`}\n`);
    return 2;
  }
}
