// init 的导出、跳过与冲突预检。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { runInit } from '../src/init.mjs';
import { PKG_ROOT } from '../src/lib/paths.mjs';
import { cleanup, makeTempRoot, writeFiles } from './helpers.mjs';

const SOURCE = join(PKG_ROOT, 'skills', 'worklog');

function sourceFiles(dir = SOURCE, base = SOURCE) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...sourceFiles(abs, base));
    else out.push(relative(base, abs).split(sep).join('/'));
  }
  return out.sort();
}

test('默认目标导出完整 Skill,已有相同文件可跳过', () => {
  const root = makeTempRoot();
  try {
    const first = runInit({ root, cwd: root, target: null });
    assert.equal(first.code, 0, first.messages.join('\n'));
    const destDir = join(root, '.agents', 'skills', 'worklog');
    const files = sourceFiles();
    assert.ok(files.length > 0);
    for (const rel of files) {
      assert.ok(existsSync(join(destDir, rel)), rel);
      assert.equal(readFileSync(join(destDir, rel), 'utf8'), readFileSync(join(SOURCE, rel), 'utf8'), rel);
    }

    const second = runInit({ root, cwd: root, target: null });
    assert.equal(second.code, 0);
    assert.ok(second.messages.join('\n').includes('跳过'));
  } finally {
    cleanup(root);
  }
});

test('冲突时预检后整体停止,不覆盖也不部分复制', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, { '.agents/skills/worklog/SKILL.md': '# 本地定制\n' });
    const result = runInit({ root, cwd: root, target: null });
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('冲突'));
    assert.equal(readFileSync(join(root, '.agents/skills/worklog/SKILL.md'), 'utf8'), '# 本地定制\n');
    assert.ok(!existsSync(join(root, '.agents/skills/worklog/references/exploration.md')));
  } finally {
    cleanup(root);
  }
});

test('目标位置是目录时按冲突处理', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, { '.agents/skills/worklog/SKILL.md/keep.txt': 'x' });
    const result = runInit({ root, cwd: root, target: null });
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('目录'));
  } finally {
    cleanup(root);
  }
});

test('自定义目标目录', () => {
  const root = makeTempRoot();
  try {
    const result = runInit({ root, cwd: root, target: 'tools/skill' });
    assert.equal(result.code, 0, result.messages.join('\n'));
    assert.ok(existsSync(join(root, 'tools', 'skill', 'SKILL.md')));
  } finally {
    cleanup(root);
  }
});

test('绝对路径目标目录不被拼到 cwd 下', () => {
  const root = makeTempRoot();
  const targetRoot = makeTempRoot('worklog-init-abs-');
  try {
    const target = join(targetRoot, 'skill');
    const result = runInit({ root, cwd: root, target });
    assert.equal(result.code, 0, result.messages.join('\n'));
    assert.ok(existsSync(join(target, 'SKILL.md')));
    assert.deepEqual(readdirSync(root), []);
  } finally {
    cleanup(root);
    cleanup(targetRoot);
  }
});

test('不写项目 AGENTS、CI 或任务文件', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, { 'AGENTS.md': '# 项目规则\n', 'docs/tasks/demo/state.md': '# 任务\n' });
    runInit({ root, cwd: root, target: null });
    assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), '# 项目规则\n');
    assert.equal(readFileSync(join(root, 'docs/tasks/demo/state.md'), 'utf8'), '# 任务\n');
    assert.ok(!existsSync(join(root, '.github')));
  } finally {
    cleanup(root);
  }
});
