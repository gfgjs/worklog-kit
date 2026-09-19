// init:把包内 skills/worklog 整目录导出到目标目录。
// 已有内容完全相同的文件跳过;发现冲突时先预检再整体停止,不覆盖、不部分复制。
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { PKG_ROOT, isDir, readText } from './lib/paths.mjs';

export const DEFAULT_SKILL_TARGET = '.agents/skills/worklog';

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(abs);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * 导出 Skill 目录。
 * @returns {{code:number, messages:string[]}}
 */
export function runInit({ root, cwd, target }) {
  const sourceDir = join(PKG_ROOT, 'skills', 'worklog');
  if (!isDir(sourceDir)) {
    return { code: 2, messages: [`包内缺少 Skill 源目录：${sourceDir}`] };
  }
  const destArg = target ?? DEFAULT_SKILL_TARGET;
  const destDir = resolve(cwd, destArg);
  const files = listFiles(sourceDir);
  if (files.length === 0) {
    return { code: 2, messages: [`Skill 源目录为空：${sourceDir}`] };
  }

  // 预检:先判定全部目标状态,冲突时不做任何写入
  const plan = [];
  const conflicts = [];
  for (const abs of files) {
    const rel = relative(sourceDir, abs).split(sep).join('/');
    const dest = join(destDir, rel);
    if (!existsSync(dest)) {
      plan.push({ rel, dest, action: 'write', src: abs });
      continue;
    }
    if (isDir(dest)) {
      conflicts.push(`${rel}(目标位置是目录)`);
      continue;
    }
    if (readText(dest) === readText(abs)) {
      plan.push({ rel, dest, action: 'skip' });
      continue;
    }
    conflicts.push(`${rel}(目标已有不同内容)`);
  }
  if (conflicts.length > 0) {
    return {
      code: 1,
      messages: [
        `目标目录 ${destDir} 存在冲突,未写入任何文件：`,
        ...conflicts.map((c) => `- ${c}`),
        '请先人工处理这些文件,或改用其它目标目录。',
      ],
    };
  }

  const written = [];
  for (const item of plan) {
    if (item.action !== 'write') continue;
    mkdirSync(dirname(item.dest), { recursive: true });
    writeFileSync(item.dest, readText(item.src));
    written.push(item.rel);
  }
  const skipped = plan.filter((p) => p.action === 'skip').map((p) => p.rel);
  const messages = [`已导出 Skill 到 ${destDir}`];
  if (written.length > 0) messages.push(`- 写入 ${written.length} 个文件：${written.join('、')}`);
  if (skipped.length > 0) messages.push(`- 跳过 ${skipped.length} 个内容相同的文件：${skipped.join('、')}`);
  messages.push('本命令只复制 Skill 文件,不修改项目 AGENTS、CI 或任务文件。');
  return { code: 0, messages };
}
