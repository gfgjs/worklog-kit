// Markdown 最小识别的支持范围:围栏、行内代码遮蔽、括号路径、引用式链接、中文锚点。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorMap, makeFenceTracker, normalizeTarget, scanHeadings, scanLinks, scanRefDefinitions, slugify } from '../src/lib/md.mjs';

test('围栏内的标题与链接不算正文', () => {
  const text = ['# 真标题', '```', '## 假标题', '```', '## 真标题二'].join('\n');
  assert.deepEqual(scanHeadings(text).map((h) => h.title), ['真标题', '真标题二']);
});

test('行内代码里的示例链接被忽略', () => {
  const line = '写法是 `必读：[名称](details.md#锚点)`，下一行才生效';
  assert.equal(scanLinks(line).length, 0);
  assert.equal(scanLinks('必读：[名称](details.md#锚点)').length, 1);
});

test('成对括号路径与尖括号目标', () => {
  const [a] = scanLinks('见 [规范](docs/spec%20(v2).md#片段) 与 [目录](<a b/c.md>)');
  assert.equal(a.target, 'docs/spec%20(v2).md#片段');
  const links = scanLinks('[目录](<a b/c.md>)');
  assert.equal(links[0].target, 'a b/c.md');
});

test('链接标题与转义空格归一', () => {
  assert.equal(normalizeTarget('a.md "标题"'), 'a.md');
  assert.equal(normalizeTarget('a\\ b.md'), 'a b.md');
});

test('引用式链接与定义', () => {
  const text = '见 [规范][spec] 与 [简写][]。\n\n[spec]: ../docs/a.md#片段\n[简写]: b.md\n';
  const defs = scanRefDefinitions(text);
  assert.equal(defs.get('spec'), '../docs/a.md#片段');
  const links = scanLinks('见 [规范][spec] 与 [简写][]。');
  assert.deepEqual(links.map((l) => l.kind), ['ref', 'ref']);
  assert.equal(links[1].label, '简写');
});

test('中文标题锚点与重复标题编号', () => {
  assert.equal(slugify('T2 裁剪与空值'), 't2-裁剪与空值');
  const headings = [{ title: '目标与验收' }, { title: '目标与验收' }];
  const map = anchorMap(headings);
  assert.equal(map.get('目标与验收').length, 1);
  assert.equal(map.get('目标与验收-1').length, 1);
});

test('编号锚点与字面量同名标题撞车时报多处命中', () => {
  // 标题字面就叫“目标与验收-1”,与第二处“目标与验收”的编号锚点相同
  const headings = [{ title: '目标与验收' }, { title: '目标与验收' }, { title: '目标与验收-1' }];
  const map = anchorMap(headings);
  assert.equal(map.get('目标与验收-1').length, 2);
});

test('围栏跟踪器区分反引号与波浪线', () => {
  const f = makeFenceTracker();
  assert.equal(f('~~~'), true);
  assert.equal(f('## 还在围栏里'), true);
  assert.equal(f('~~~'), true);
  assert.equal(f('## 出来了'), false);
});
