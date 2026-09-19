// T2 预置验收测试（**待施工**）：查询裁剪与空值处理。
// 运行（在样例项目根 examples/title-search 下）：node --test test/t2-trim-and-blank.spec.mjs
//
// 现在应当失败：T1 的实现按原样匹配查询串，既不裁剪空白，也把 undefined/null 当成字面量。
// T2 完成后本文件必须全绿；执行者不得放宽这里的期望来制造通过。
// 后缀用 .spec.mjs 而非 .selftest.mjs：它不参与仓库既有自检的登记，只由本任务演练显式运行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByTitle } from '../src/search.mjs';

const items = [
  { id: 1, title: '周报模板整理' },
  { id: 2, title: 'README 链接修复' },
  { id: 3, title: '搜索框输入法组合态' },
  { id: 4, title: '导出 CSV' },
  { id: 5, title: 'readme 大小写回归' },
];
const ids = (list) => list.map((item) => item.id);

test('查询前后空白被裁剪后命中', () => {
  assert.deepEqual(ids(filterByTitle(items, '  readme  ')), [2, 5]);
});

test('仅空白的查询等同空查询：返回全部且保持顺序', () => {
  assert.deepEqual(ids(filterByTitle(items, '   ')), [1, 2, 3, 4, 5]);
});

test('undefined 与 null 视为空查询：返回全部', () => {
  assert.deepEqual(ids(filterByTitle(items, undefined)), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(filterByTitle(items, null)), [1, 2, 3, 4, 5]);
});

test('裁剪后仍大小写不敏感，且不改变顺序', () => {
  assert.deepEqual(ids(filterByTitle(items, ' ReadMe ')), [2, 5]);
});
