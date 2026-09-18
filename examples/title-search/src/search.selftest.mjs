// T1 自检：纯过滤函数的现状行为（当前应全绿）。
// 运行（在样例项目根 examples/title-search 下）：node src/search.selftest.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByTitle, formatMatches } from './search.mjs';

const items = [
  { id: 1, title: '周报模板整理' },
  { id: 2, title: 'README 链接修复' },
  { id: 3, title: '搜索框输入法组合态' },
  { id: 4, title: '导出 CSV' },
  { id: 5, title: 'readme 大小写回归' },
];
const ids = (list) => list.map((item) => item.id);

test('子串命中，且大小写不敏感', () => {
  assert.deepEqual(ids(filterByTitle(items, 'readme')), [2, 5]);
});

test('中文子串命中', () => {
  assert.deepEqual(ids(filterByTitle(items, '导出')), [4]);
});

test('命中多项时保持原顺序', () => {
  const got = ids(filterByTitle(items, 'e'));
  assert.deepEqual(got, [2, 5]);
  assert.deepEqual(got, [...got].sort((a, b) => a - b));
});

test('未命中返回空数组', () => {
  assert.deepEqual(filterByTitle(items, 'zzz'), []);
});

test('空查询返回全部（现状，T2 沿用）', () => {
  assert.deepEqual(ids(filterByTitle(items, '')), [1, 2, 3, 4, 5]);
});

test('formatMatches 未命中给短提示，命中逐行列出', () => {
  assert.equal(formatMatches([]), '无匹配');
  assert.equal(formatMatches([items[0]]), '- 周报模板整理');
});

test('items 非数组时抛类型错误', () => {
  assert.throws(() => filterByTitle(null, 'a'), TypeError);
});
