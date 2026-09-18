// 黑盒契约测试:临时项目 + 子进程调用 bin/worklog.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, runCli, snapshotTree, taskDoc, writeProjectFile } from './helpers.mjs';

const TASKS = 'docs/tasks';
const DETAIL_MARKER = 'DETAIL-ONLY-MARKER-7f31';

/** 任务文件名与内容的简写。 */
function task(name, status, summary) {
  return [TASKS + '/' + name + '.md', taskDoc({ title: name, status, summary })];
}

test('干净非 Node 项目:list 成功空结果,不写文件不建目录', (t) => {
  const dir = makeProject(t);
  writeProjectFile(dir, 'README.md', '# 普通项目\n');
  const before = snapshotTree(dir);

  const plain = runCli(dir, ['list']);
  assert.equal(plain.code, 0, plain.stderr);
  assert.equal(plain.stdout.trim(), '');

  const json = runCli(dir, ['list', '--json']);
  assert.equal(json.code, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), []);

  const all = runCli(dir, ['list', '--all', '--json']);
  assert.equal(all.code, 0, all.stderr);
  assert.deepEqual(JSON.parse(all.stdout), []);

  assert.deepEqual(snapshotTree(dir), before, 'list 不得写任何文件');
  assert.equal(existsSync(join(dir, 'docs')), false, '不得创建 docs/');
});

test('默认只列 planned 与 active,--all 列四状态', (t) => {
  const dir = makeProject(t);
  const specs = [['plan-a', 'planned'], ['work-b', 'active'], ['done-c', 'done'], ['drop-d', 'cancelled']];
  for (const [name, status] of specs) {
    const [path, contents] = task(name, status, status + ' 的任务');
    writeProjectFile(dir, path, contents);
  }

  const def = runCli(dir, ['list']);
  assert.equal(def.code, 0, def.stderr);
  assert.ok(def.stdout.includes('plan-a.md'), def.stdout);
  assert.ok(def.stdout.includes('work-b.md'), def.stdout);
  assert.ok(!def.stdout.includes('done-c.md'), 'done 默认不列');
  assert.ok(!def.stdout.includes('drop-d.md'), 'cancelled 默认不列');

  const all = runCli(dir, ['list', '--all', '--json']);
  assert.equal(all.code, 0, all.stderr);
  const rows = JSON.parse(all.stdout);
  assert.deepEqual(rows.map((row) => row.status).sort(), ['active', 'cancelled', 'done', 'planned']);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['path', 'status', 'summary', 'title']);
    assert.equal(row.path, TASKS + '/' + row.title + '.md');
  }
  const paths = rows.map((row) => row.path);
  assert.deepEqual(paths, [...paths].sort(), '按路径稳定排序');
});

test('--status 过滤,关键词匹配 title/summary/path 且不读详情', (t) => {
  const dir = makeProject(t);
  const details = ['## 当前', '', '继续。', '', '## 详情', '', DETAIL_MARKER].join('\n');
  writeProjectFile(dir, ...task('title-hit', 'active', 'plain summary'));
  writeProjectFile(dir, ...task('summary-hit', 'planned', '包含 哨兵词 的摘要'));
  writeProjectFile(dir, TASKS + '/哨兵词-path.md', taskDoc({ title: 'third', status: 'done', summary: 'plain again' }));
  writeProjectFile(dir, TASKS + '/detail-carry.md', taskDoc({ title: 'fourth', status: 'active', summary: 'plain summary', body: details }));

  const byTitle = JSON.parse(runCli(dir, ['list', 'title-hit', '--json']).stdout);
  assert.deepEqual(byTitle.map((row) => row.path), [TASKS + '/title-hit.md']);

  const defaultKeyword = runCli(dir, ['list', '哨兵词', '--json']);
  assert.equal(defaultKeyword.code, 0, defaultKeyword.stderr);
  assert.deepEqual(
    JSON.parse(defaultKeyword.stdout).map((row) => row.path),
    [TASKS + '/summary-hit.md'],
    '默认只列 planned/active,关键词命中 done 也不列',
  );

  const bySummary = runCli(dir, ['list', '哨兵词', '--all', '--json']);
  assert.equal(bySummary.code, 0, bySummary.stderr);
  assert.deepEqual(
    JSON.parse(bySummary.stdout).map((row) => row.path).sort(),
    [TASKS + '/summary-hit.md', TASKS + '/哨兵词-path.md'].sort(),
  );

  const byStatus = JSON.parse(runCli(dir, ['list', '--status', 'done', '--json']).stdout);
  assert.deepEqual(byStatus.map((row) => row.path), [TASKS + '/哨兵词-path.md']);

  const detailRun = runCli(dir, ['list', 'detail-carry', '--json']);
  assert.equal(detailRun.code, 0, detailRun.stderr);
  assert.ok(!detailRun.stdout.includes(DETAIL_MARKER), '匹配与输出都不应读详情正文');

  const empty = runCli(dir, ['list', '不存在的词']);
  assert.equal(empty.code, 0, empty.stderr);
  assert.equal(empty.stdout.trim(), '');
});

test('改 status 后路径与 title 不变,只影响列表归属', (t) => {
  const dir = makeProject(t);
  const rel = TASKS + '/status-change.md';
  writeProjectFile(dir, rel, taskDoc({ title: '状态流转', status: 'active', summary: '第一版摘要' }));

  const before = JSON.parse(runCli(dir, ['list', '--all', '--json']).stdout);
  assert.equal(before.length, 1);
  assert.equal(before[0].path, rel);
  assert.equal(before[0].title, '状态流转');
  assert.equal(before[0].status, 'active');

  writeProjectFile(dir, rel, taskDoc({ title: '状态流转', status: 'done', summary: '第一版摘要' }));

  const after = JSON.parse(runCli(dir, ['list', '--all', '--json']).stdout);
  assert.equal(after.length, 1);
  assert.equal(after[0].path, rel, '路径即身份,不随状态改变');
  assert.equal(after[0].title, '状态流转');
  assert.equal(after[0].status, 'done');

  assert.equal(runCli(dir, ['list']).stdout.trim(), '', 'done 不在默认列表里');
  const listed = JSON.parse(runCli(dir, ['list', '--status', 'done', '--json']).stdout);
  assert.deepEqual(listed.map((row) => row.path), [rel]);
});

test('read 默认给元数据与当前节,省略的详情标题带原文件行号且正文不外泄', (t) => {
  const dir = makeProject(t);
  const rel = TASKS + '/read-basic.md';
  const body = [
    '## 当前',
    '',
    '正在验证 read 的默认输出。',
    '',
    '### 验证步骤',
    '',
    '先跑 list,再看 read。',
    '',
    '## 详情',
    '',
    DETAIL_MARKER,
    '',
    '## 另一个详情',
    '',
    '第二段细节。',
  ].join('\n');
  const contents = taskDoc({ title: '读取基础', status: 'active', summary: '摘要行在这里', body });
  writeProjectFile(dir, rel, contents);

  const res = runCli(dir, ['read', rel]);
  assert.equal(res.code, 0, res.stderr);
  assert.ok(res.stdout.includes('读取基础'), res.stdout);
  assert.ok(res.stdout.includes('摘要行在这里'), res.stdout);
  assert.ok(res.stdout.includes('正在验证 read 的默认输出。'), res.stdout);
  assert.ok(!res.stdout.includes(DETAIL_MARKER), '默认输出不展开详情正文');
  assert.ok(!res.stdout.includes('第二段细节。'), '默认输出不展开详情正文');
  assert.ok(res.stdout.includes('详情'), res.stdout);
  assert.ok(res.stdout.includes('另一个详情'), res.stdout);

  const h3Hits = res.stdout.split('验证步骤').length - 1;
  assert.equal(h3Hits, 1, '当前节内的三级标题随摘要出现一次,不重复进省略目录:\n' + res.stdout);

  const headingLine = contents.split('\n').indexOf('## 详情') + 1;
  assert.ok(headingLine > 0);
  const tokens = res.stdout.split(/[^0-9]+/);
  assert.ok(tokens.includes(String(headingLine)), '省略标题应带原文件行号 ' + headingLine + ':\n' + res.stdout);

  const full = runCli(dir, ['read', rel, '--full']);
  assert.equal(full.code, 0, full.stderr);
  assert.ok(full.stdout.includes(DETAIL_MARKER), '--full 展开完整正文');
  assert.ok(full.stdout.includes('## 详情'), full.stdout);
  assert.ok(full.stdout.includes('## 另一个详情'), full.stdout);
});

test('任务数增长不改变选中任务的 read 输出', (t) => {
  const dir = makeProject(t);
  const rel = TASKS + '/selected.md';
  writeProjectFile(dir, rel, taskDoc({ title: '选中任务', status: 'active', summary: '只关心这一个' }));

  const first = runCli(dir, ['read', rel]);
  assert.equal(first.code, 0, first.stderr);

  for (let i = 0; i < 40; i += 1) {
    writeProjectFile(dir, TASKS + '/history-' + i + '.md', taskDoc({
      title: '历史任务 ' + i,
      status: i % 2 === 0 ? 'done' : 'cancelled',
      summary: 'HISTORY-SENTINEL-' + i,
      body: ['## 当前', '', '历史正文 HISTORY-SENTINEL-' + i].join('\n'),
    }));
  }

  const second = runCli(dir, ['read', rel]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.stdout, first.stdout, 'read 输出与其它任务数量无关');
  assert.ok(!second.stdout.includes('HISTORY-SENTINEL'), '不读取其它任务');

  const listed = runCli(dir, ['list', '--all', '--json']);
  assert.equal(JSON.parse(listed.stdout).length, 41);
});

test('BOM 与 CRLF 文件照常解析', (t) => {
  const dir = makeProject(t);
  const rel = TASKS + '/crlf.md';
  const contents = '\uFEFF' + taskDoc({ title: '换行与 BOM', status: 'active', summary: 'CRLF 摘要' }).replace(/\n/g, '\r\n');
  writeProjectFile(dir, rel, contents);

  const listed = runCli(dir, ['list', '--json']);
  assert.equal(listed.code, 0, listed.stderr);
  const rows = JSON.parse(listed.stdout);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, '换行与 BOM');
  assert.equal(rows[0].summary, 'CRLF 摘要');
  assert.equal(rows[0].path, rel);

  const res = runCli(dir, ['read', rel]);
  assert.equal(res.code, 0, res.stderr);
  assert.ok(res.stdout.includes('继续做这件事。'), res.stdout);
});

test('代码围栏内的二级标题不算边界', (t) => {
  const dir = makeProject(t);
  const rel = TASKS + '/fence.md';
  const body = [
    '## 当前',
    '',
    '当前摘要。',
    '',
    '```markdown',
    '## 围栏里的假标题',
    '',
    'FENCE-MARKER-8c2',
    '```',
    '',
    '## 真详情',
    '',
    '真详情正文。',
  ].join('\n');
  writeProjectFile(dir, rel, taskDoc({ title: '围栏', status: 'active', summary: '围栏摘要', body }));

  const res = runCli(dir, ['read', rel]);
  assert.equal(res.code, 0, res.stderr);
  assert.ok(res.stdout.includes('当前摘要。'), res.stdout);
  assert.ok(res.stdout.includes('FENCE-MARKER-8c2'), '围栏内容属于当前节');
  assert.ok(res.stdout.includes('真详情'), res.stdout);
  assert.ok(!res.stdout.includes('真详情正文。'), '围栏后的真标题仍是省略内容');
});

test('坏 frontmatter 让 list/read 明确失败而不是静默漏列', (t) => {
  const dir = makeProject(t);
  writeProjectFile(dir, ...task('good-one', 'active', '正常任务'));
  const cases = [
    ['missing-field.md', '---\ntitle: bad\nstatus: active\n---\n\n## 当前\n\n缺 summary。\n'],
    ['unknown-status.md', '---\ntitle: bad\nstatus: whatever\nsummary: 未知状态\n---\n\n## 当前\n\n内容。\n'],
  ];
  for (const [name, contents] of cases) {
    writeProjectFile(dir, TASKS + '/' + name, contents);
  }

  const listed = runCli(dir, ['list']);
  assert.equal(listed.code, 2, '坏格式必须失败:\n' + listed.stdout + listed.stderr);
  assert.ok(listed.stderr.includes('missing-field.md'), listed.stderr);

  const read = runCli(dir, ['read', TASKS + '/unknown-status.md']);
  assert.equal(read.code, 2);
  assert.ok(read.stderr.includes('unknown-status.md'), read.stderr);
});

test('缺 ## 当前、空 ## 当前、重复 ## 当前都明确失败', (t) => {
  const cases = [
    ['no-current.md', taskDoc({ title: 'no current', status: 'active', summary: '无当前', body: '## 详情\n\n只有详情。' })],
    ['empty-current.md', taskDoc({ title: 'empty current', status: 'active', summary: '空当前', body: '## 当前\n\n## 详情\n\n细节。' })],
    ['two-current.md', taskDoc({ title: 'two current', status: 'active', summary: '两个当前', body: '## 当前\n\n一。\n\n## 当前\n\n二。' })],
  ];
  for (const [name, contents] of cases) {
    const dir = makeProject(t);
    const rel = TASKS + '/' + name;
    writeProjectFile(dir, rel, contents);

    const read = runCli(dir, ['read', rel]);
    assert.equal(read.code, 2, name + ' 应失败:\n' + read.stdout + read.stderr);
    assert.ok(read.stderr.includes(name), read.stderr);

    const full = runCli(dir, ['read', rel, '--full']);
    assert.equal(full.code, 2, name + ' 用 --full 也不能绕过:\n' + full.stdout + full.stderr);
    assert.ok(full.stderr.includes(name), full.stderr);

    const listed = runCli(dir, ['list']);
    assert.equal(listed.code, 2, name + ' 出现在列表里也必须报错');
    assert.ok(listed.stderr.includes(name), listed.stderr);
  }
});

test('引号空值、未知短标志失败,## 当前 ### 是当前节而非省略详情', (t) => {
  const blanks = [
    ['title-blank.md', 'title: ""\nstatus: active\nsummary: ok'],
    ['summary-blank.md', 'title: ok\nstatus: active\nsummary: "   "'],
  ];
  for (const [name, head] of blanks) {
    const dir = makeProject(t);
    const rel = TASKS + '/' + name;
    writeProjectFile(dir, rel, '---\n' + head + '\n---\n\n## 当前\n\n正文。\n');

    const read = runCli(dir, ['read', rel]);
    assert.equal(read.code, 2, name + ' 的引号空值应失败:\n' + read.stdout + read.stderr);
    assert.ok(read.stderr.includes(name), read.stderr);

    const listed = runCli(dir, ['list']);
    assert.equal(listed.code, 2, name + ' 出现在列表里也必须报错');
  }

  const flagDir = makeProject(t);
  writeProjectFile(flagDir, ...task('flag-ok', 'active', '正常任务'));
  const flagBefore = snapshotTree(flagDir);
  for (const args of [['list', '-x'], ['list', '-z']]) {
    const res = runCli(flagDir, args);
    assert.equal(res.code, 2, '未知短标志应失败: ' + args.join(' ') + '\n' + res.stdout + res.stderr);
    assert.ok(res.stderr.trim().length > 0, res.stderr);
  }
  assert.deepEqual(snapshotTree(flagDir), flagBefore, '失败路径不得写文件');

  const hashDir = makeProject(t);
  const hashRel = TASKS + '/closing-hash.md';
  const contents = taskDoc({
    title: '闭合井号',
    status: 'active',
    summary: '标题带闭合井号',
    body: '## 当前 ###\n\n闭合井号的当前节。\n\n## 详情\n\n按需细节。',
  });
  writeProjectFile(hashDir, hashRel, contents);

  const read = runCli(hashDir, ['read', hashRel]);
  assert.equal(read.code, 0, read.stderr);
  assert.ok(read.stdout.includes('闭合井号的当前节。'), '## 当前 ### 应作为当前节展开:\n' + read.stdout);
  assert.ok(!read.stdout.includes('按需细节。'), '详情正文默认不展开:\n' + read.stdout);

  const lines = contents.split('\n');
  const detailLine = lines.indexOf('## 详情') + 1;
  const currentLine = lines.indexOf('## 当前 ###') + 1;
  assert.ok(lines[currentLine - 1] === '## 当前 ###' && detailLine > currentLine);
  assert.ok(read.stdout.includes(String(detailLine)), '省略的详情标题要带行号 ' + detailLine + ':\n' + read.stdout);
  assert.ok(!read.stdout.includes('line ' + currentLine), '当前节不该进省略列表:\n' + read.stdout);
});

test('路径含空格与 Unicode 时 list/read 正常', (t) => {
  const dir = makeProject(t);
  const rel = TASKS + '/发布 检查 v2.md';
  writeProjectFile(dir, rel, taskDoc({ title: '发布检查 v2', status: 'active', summary: '带空格与中文的路径' }));

  const listed = runCli(dir, ['list', '--json']);
  assert.equal(listed.code, 0, listed.stderr);
  const rows = JSON.parse(listed.stdout);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, rel);

  const res = runCli(dir, ['read', rel]);
  assert.equal(res.code, 0, res.stderr);
  assert.ok(res.stdout.includes('带空格与中文的路径'), res.stdout);
});

test('越界、项目外、非 .md、目录与符号链接逃逸都被拒绝', (t) => {
  const dir = makeProject(t);
  writeProjectFile(dir, 'README.md', '# 项目说明\n');
  writeProjectFile(dir, ...task('inside', 'active', '正常任务'));
  writeProjectFile(dir, TASKS + '/notes.txt', 'not markdown\n');

  const outside = makeProject(t, 'worklog-kit-outside-');
  const outsideFile = writeProjectFile(outside, 'outside.md', taskDoc({ title: 'outside', status: 'active', summary: '外部文件' }));

  const bad = [
    '../escape.md',
    'docs/../README.md',
    'README.md',
    TASKS + '/notes.txt',
    TASKS,
    TASKS + '/missing.md',
    outsideFile,
  ];
  for (const target of bad) {
    const res = runCli(dir, ['read', target]);
    assert.equal(res.code, 2, '应拒绝: ' + target + '\n' + res.stdout + res.stderr);
    assert.ok(res.stderr.trim().length > 0, '拒绝时要有明确报错: ' + target);
  }

  try {
    symlinkSync(outsideFile, join(dir, TASKS, 'link.md'));
  } catch (err) {
    t.diagnostic('跳过符号链接用例: ' + err.message);
    return;
  }
  const linked = runCli(dir, ['read', TASKS + '/link.md']);
  assert.equal(linked.code, 2, '符号链接逃逸必须被拒绝:\n' + linked.stdout + linked.stderr);
});

test('help 零写入,未知命令/未知参数/缺值/互斥参数都失败', (t) => {
  const dir = makeProject(t);
  writeProjectFile(dir, ...task('keep', 'active', '正常任务'));
  const before = snapshotTree(dir);

  const help = runCli(dir, ['--help']);
  assert.equal(help.code, 0, help.stderr);
  assert.ok(help.stdout.trim().length > 0, 'help 要有输出');

  const helpList = runCli(dir, ['list', '--help']);
  assert.equal(helpList.code, 0, helpList.stderr);
  const helpRead = runCli(dir, ['read', '--help']);
  assert.equal(helpRead.code, 0, helpRead.stderr);
  assert.deepEqual(snapshotTree(dir), before, 'help 不得写任何文件');

  const failures = [
    ['frobnicate'],
    ['list', '--nope'],
    ['list', '--status'],
    ['read'],
    ['read', '--full'],
    ['list', '--status', 'done', '--all'],
  ];
  for (const args of failures) {
    const res = runCli(dir, args);
    assert.equal(res.code, 2, '应失败: ' + args.join(' ') + '\n' + res.stdout + res.stderr);
    assert.ok(res.stderr.trim().length > 0, '失败要有明确报错: ' + args.join(' '));
  }

  assert.deepEqual(snapshotTree(dir), before, '失败路径不得写任何文件');
});
