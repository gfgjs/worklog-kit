// CLI 入口:帮助、版本、未知命令与参数、退出码。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PKG_ROOT } from '../src/lib/paths.mjs';
import { cleanup, makeTempRoot, simpleTask, writeFiles } from './helpers.mjs';

const CLI = join(PKG_ROOT, 'bin', 'worklog.mjs');

function run(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('无参数、--help 与 --version', () => {
  const root = makeTempRoot();
  try {
    const bare = run([], root);
    assert.equal(bare.code, 0);
    assert.ok(bare.out.includes('worklog-kit'));
    assert.ok(bare.out.includes('init'));
    assert.ok(bare.out.includes('context'));
    assert.ok(bare.out.includes('check'));
    // 默认检查范围要在帮助里写明
    assert.ok(bare.out.includes('docs/history'));
    for (const flag of ['--help', '-h']) {
      assert.equal(run([flag], root).code, 0, flag);
    }
    const version = run(['--version'], root);
    assert.equal(version.code, 0);
    assert.match(version.out.trim(), /^\d+\.\d+\.\d+/);
    assert.equal(run(['-v'], root).out.trim(), version.out.trim());
    // 命令后的 --help 只打印帮助,不执行命令(init --help 不写任何文件)
    const initHelp = run(['init', '--help'], root);
    assert.equal(initHelp.code, 0);
    assert.ok(initHelp.out.includes('用法'));
    assert.ok(!existsSync(join(root, '.agents')));
  } finally {
    cleanup(root);
  }
});

test('未知命令与未知参数被拒绝', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask());
    const unknownCmd = run(['index'], root);
    assert.equal(unknownCmd.code, 2);
    assert.ok(unknownCmd.err.includes('未知命令'));

    for (const args of [
      ['context', 'demo', '--task', 'demo'],
      ['context', 'demo', '--role', 'explore', '--unit', 'T1'],
      ['check', '--fix'],
      ['init', '--force'],
      ['context', '--role'],
      ['context', 'a', 'b'],
    ]) {
      const r = run(args, root);
      assert.equal(r.code, 2, args.join(' '));
      assert.ok(r.err.length > 0, args.join(' '));
    }
  } finally {
    cleanup(root);
  }
});

test('context 与 check 的退出码与输出', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask());
    const list = run(['context'], root);
    assert.equal(list.code, 0);
    assert.ok(list.out.includes('demo'));

    const state = run(['context', 'demo'], root);
    assert.equal(state.code, 0);
    assert.ok(state.out.includes('## 当前'));
    assert.ok(!state.out.includes('## 共同约束'));

    const implement = run(['context', 'demo', '--role', 'implement', '--unit', 'T1'], root);
    assert.equal(implement.code, 0);
    assert.ok(implement.out.includes('## 共同约束'));
    assert.ok(implement.out.includes('### 回传要求'));

    const missingUnit = run(['context', 'demo', '--role', 'implement', '--unit', 'T9'], root);
    assert.equal(missingUnit.code, 1);
    assert.equal(missingUnit.out, '');
    assert.ok(missingUnit.err.includes('T9'));

    assert.equal(run(['check'], root).code, 0);
    assert.equal(run(['check', 'docs/tasks/demo'], root).code, 0);
    assert.equal(run(['check', 'nope'], root).code, 2);
  } finally {
    cleanup(root);
  }
});

test('init 通过 CLI 导出到默认目录', () => {
  const root = makeTempRoot();
  try {
    const r = run(['init'], root);
    assert.equal(r.code, 0, r.err);
    assert.ok(r.out.includes('.agents'));
  } finally {
    cleanup(root);
  }
});
