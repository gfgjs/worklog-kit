// 黑盒测试公共设施:临时项目、CLI 调用、目录快照。只经 stdout/stderr/退出码观察。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');
export const cliPath = join(repoRoot, 'bin', 'worklog.mjs');

/** 建一个空临时项目;测试结束自动清理。 */
export function makeProject(t, prefix = 'worklog-kit-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 在临时项目内按相对路径落文件,自动建目录。 */
export function writeProjectFile(dir, relPath, contents) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  return abs;
}

/** 跑 CLI,返回 { code, stdout, stderr }。 */
export function runCli(cwd, args) {
  const res = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (res.error) throw res.error;
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** 目录快照(相对路径 + 文件长度 + 内容摘要),用于断言命令零写入。 */
export function snapshotTree(dir) {
  const out = [];
  const walk = (abs, rel) => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const childRel = rel ? rel + '/' + entry.name : entry.name;
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) {
        out.push(childRel + '/');
        walk(childAbs, childRel);
      } else {
        const body = readFileSync(childAbs);
        out.push(childRel + ':' + body.length + ':' + createHash('sha256').update(body).digest('hex').slice(0, 12));
      }
    }
  };
  walk(dir, '');
  return out;
}

/** 任务文档构造器:frontmatter 三字段 + 正文。 */
export function taskDoc({ title, status, summary, body }) {
  return '---\n'
    + 'title: ' + title + '\n'
    + 'status: ' + status + '\n'
    + 'summary: ' + summary + '\n'
    + '---\n'
    + '\n'
    + (body ?? '## 当前\n\n继续做这件事。') + '\n';
}
