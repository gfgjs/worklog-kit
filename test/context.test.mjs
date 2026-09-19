// context 的角色切片、缺项报错、必读片段与去重。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runContext } from '../src/context.mjs';
import { cleanup, detailsDoc, makeTempRoot, simpleTask, stateDoc, unitBlock, writeFiles } from './helpers.mjs';

function run(root, args) {
  return runContext({ root, cwd: root, target: 'demo', role: null, unit: null, ...args });
}

function titles(result) {
  return result.sources.map((s) => s.title);
}

test('无参完整输出 todo 原文且不展开链接，--list 独立枚举任务', () => {
  const root = makeTempRoot();
  try {
    const body = '# 工作索引\r\n\r\n## 当前重点\r\n必读：[候选](topics/topic.md#候选)\r\n\r\n' + '保留原文。\n'.repeat(200);
    writeFiles(root, { ...simpleTask(), ...simpleTask({ name: 'done', stage: '完成' }),
      ...simpleTask({ name: 'cancelled', stage: '已取消' }),
      'docs/todo.md': body, 'docs/README.md': '不应加载导航',
      'docs/topics/topic.md': '# 主题\n## 候选\n不应展开的主题正文\n',
      'docs/tasks/broken/details.md': '# 缺状态\n',
    });
    const index = run(root, { target: null });
    assert.equal(index.code, 0);
    assert.equal(index.text, `来源：docs/todo.md\n\n${body}\n用 context --list 查看全部未完成任务。`);
    const list = run(root, { target: null, list: true });
    assert.equal(list.code, 0);
    assert.match(list.text, /demo/);
    assert.match(list.text, /broken.*缺少 state/);
    assert.doesNotMatch(list.text, /done|cancelled|保留原文|不应展开/);
    assert.doesNotMatch(run(root, {}).text, /保留原文|不应加载导航|不应展开/);
  } finally { cleanup(root); }
});

test('todo 缺失回退，空白报 1，非文件和访问失败报 2，list 不依赖 todo', () => {
  for (const body of [null, '', ' \r\n\t', 'directory', 'bad-parent']) {
    const root = makeTempRoot();
    try {
      if (body === 'directory') mkdirSync(join(root, 'docs', 'todo.md'), { recursive: true });
      else if (body === 'bad-parent') writeFiles(root, { docs: '父路径不是目录' });
      else if (body !== null) writeFiles(root, { 'docs/todo.md': body });
      const result = run(root, { target: null });
      assert.equal(result.code, body === null ? 0 : ['directory', 'bad-parent'].includes(body) ? 2 : 1);
      if (body === null) assert.match(result.text, /当前没有未完成任务/);
      else {
        assert.equal(result.text, undefined);
        assert.match(result.messages.join('\n'), /docs\/todo.md/);
      }
      assert.equal(run(root, { target: null, list: true }).code, 0);
    } finally { cleanup(root); }
  }
});

test('list 与任务和角色参数互斥，无任务的角色和单元报错', () => {
  const root = makeTempRoot();
  try {
    for (const args of [
      { list: true }, { target: null, list: true, role: 'explore' },
      { target: null, list: true, unit: 'T1' }, { target: null, role: 'explore' },
      { target: null, unit: 'T1' }, { target: null, role: 'implement', unit: 'T1' },
    ]) assert.equal(run(root, args).code, 2, JSON.stringify(args));
  } finally { cleanup(root); }
});

test('无角色只给 state.md,不展开必读', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '示例单元'),
      progress: '| T1 示例单元 | 已自检 | details.md 的 T1 |',
    }));
    // state 的“下一步与阅读”里放一条必读,无角色时不应被展开
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ progress: '| T1 示例单元 | 已自检 | details.md 的 T1 |' })
        .replace('继续 T1。', '继续 T1。\n必读：[目标与验收](details.md#目标与验收)') + '\n## 额外章节\n不应输出的额外正文\n必读：[缺失](missing.md)\n',
    });
    const result = run(root, {});
    assert.equal(result.code, 0);
    assert.deepEqual(titles(result), ['当前', '进度', '下一步与阅读']);
    assert.equal(result.readings.length, 0);
    assert.ok(!result.text.includes('## 目标与验收'));
    assert.ok(!result.text.includes('不应输出的额外正文'));
  } finally {
    cleanup(root);
  }
});

test('各角色读集符合约定', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask());
    const explore = run(root, { role: 'explore' });
    assert.equal(explore.code, 0);
    assert.deepEqual(titles(explore), ['当前', '进度', '下一步与阅读', '目标与验收', '探索结果', '共同约束']);
    const design = run(root, { role: 'design' });
    assert.deepEqual(titles(design), ['当前', '进度', '下一步与阅读', '目标与验收', '探索结果', '共同约束', '当前设计']);
    const implement = run(root, { role: 'implement', unit: 'T1' });
    assert.deepEqual(titles(implement), ['当前', '进度', '下一步与阅读', '共同约束', '当前设计', 'T1 示例单元']);
    const accept = run(root, { role: 'accept' });
    assert.deepEqual(titles(accept), ['当前', '进度', '下一步与阅读', '目标与验收', '当前设计', '执行结果']);
  } finally {
    cleanup(root);
  }
});

test('探索角色允许尚未设计', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ stage: '探索', progress: '' }),
      'docs/tasks/demo/details.md': ['# 详情', '', '## 目标与验收', '需求。', ''].join('\n'),
    });
    const result = run(root, { role: 'explore' });
    assert.equal(result.code, 0);
    assert.deepEqual(titles(result), ['当前', '进度', '下一步与阅读', '目标与验收']);
  } finally {
    cleanup(root);
  }
});

test('设计角色缺少当前设计时报缺项', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ stage: '设计', progress: '' }),
      'docs/tasks/demo/details.md': ['# 详情', '', '## 目标与验收', '需求。', '', '## 探索结果', '入口。', ''].join('\n'),
    });
    const result = run(root, { role: 'design' });
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('当前设计'));
  } finally {
    cleanup(root);
  }
});

test('施工角色缺小标题、重复与占位都报错', () => {
  const cases = [
    { name: '缺小标题', units: unitBlock('T1', '单元', { 最低验证: null }), expect: '最低验证' },
    { name: '占位', units: unitBlock('T1', '单元', { 实现路径: '待定' }), expect: '待定' },
    { name: '尖括号占位', units: unitBlock('T1', '单元', { 实现路径: '<待补>' }), expect: '待定或占位' },
    { name: '重复小标题', units: unitBlock('T1', '单元') + '\n### 目标与验收\n重复一份。\n', expect: '重复' },
  ];
  for (const item of cases) {
    const root = makeTempRoot();
    try {
      writeFiles(root, simpleTask({ units: item.units }));
      const result = run(root, { role: 'implement', unit: 'T1' });
      assert.equal(result.code, 1, item.name);
      assert.ok(result.messages.join('\n').includes(item.expect), item.name + ' 应包含 ' + item.expect);
    } finally {
      cleanup(root);
    }
  }
});

test('“待决定：无”与回交条件里的“待定”字样不拦施工', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '单元', { 回交条件: '若设计前提待定,停止并回传;其余自行处理。' }),
    }));
    writeFiles(root, {
      'docs/tasks/demo/details.md': detailsDoc({
        design: '方案版本：r1\n按方案实现。\n待决定：无。',
        units: unitBlock('T1', '单元', { 回交条件: '若设计前提待定,停止并回传。' }),
      }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
  } finally {
    cleanup(root);
  }
});

test('“无”作为空项写法不被判为占位', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '单元', { 依赖与前提: '无', 必读材料: '无', 回交条件: '无' }),
    }));
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
  } finally {
    cleanup(root);
  }
});

test('当前设计本身待定时不交付施工材料', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc(),
      'docs/tasks/demo/details.md': detailsDoc({ design: '待定', units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('当前设计'));
  } finally {
    cleanup(root);
  }
});

test('章节或单元定位不唯一时报错', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc(),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') + '\n## T1 另一个同名单元\n### 目标与验收\n重复。\n' }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('定位不唯一'));
  } finally {
    cleanup(root);
  }
});

test('必读片段一层提取、去重且不重复已选章节', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/guide.md': '# 指南\n\n## 输入处理\n\n输入事件的约定。\n\n## 其他\n\n无关内容。\n',
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '必读：[指南片段](../../guide.md#输入处理)',
        '必读：[指南片段](../../guide.md#输入处理)',
        '必读：[当前设计](details.md#当前设计)',
        '必读：[共同约束](details.md#共同约束)',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 1);
    assert.ok(result.readings[0].body.includes('输入事件的约定'));
    assert.ok(!result.text.includes('无关内容'));
    // 已选中的“当前设计”“共同约束”各只出现一次,不因必读重复整段
    assert.equal(result.text.split('## 当前设计').length - 1, 1);
    assert.equal(result.text.split('## 共同约束').length - 1, 1);
  } finally {
    cleanup(root);
  }
});

test('同名标题的编号锚点与 check 用同一套规则解析', () => {
  const root = makeTempRoot();
  try {
    // guide.md 两处“输入处理”:#输入处理 取第一处,#输入处理-1 取第二处
    writeFiles(root, {
      'docs/guide.md': '# 指南\n\n## 输入处理\n\n第一处。\n\n## 输入处理\n\n第二处。\n',
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '必读：[输入处理](../../guide.md#输入处理)',
        '必读：[输入处理二](../../guide.md#输入处理-1)',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 2);
    assert.ok(result.readings[0].body.includes('第一处'));
    assert.ok(result.readings[1].body.includes('第二处'));
  } finally {
    cleanup(root);
  }
});

test('必读指向所选章节内的同名片段不被标题去重误伤', () => {
  const root = makeTempRoot();
  try {
    // details.md 顶层“目标与验收”与 T1 单元内“目标与验收”同名;
    // 必读指向单元内那处(编号锚点),不得被顶层同名章节吞掉
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '必读：[单元验收](details.md#目标与验收-1)',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元', { 目标与验收: '单元验收正文。' }) }),
    });
    const result = run(root, { role: 'accept' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    const unitReading = result.readings.find((r) => r.body.includes('单元验收正文'));
    assert.ok(unitReading, '单元内的“目标与验收”片段应作为必读注入');
  } finally {
    cleanup(root);
  }
});

test('必读指向已注入单元内的小节不重复注入', () => {
  const root = makeTempRoot();
  try {
    // implement 角色已注入 T1 单元全文,其中含“### 修改范围”;
    // 必读指向该小节时,其标题行落在所选单元的行区间内,应跳过
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '必读：[修改范围](details.md#修改范围)',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元', { 修改范围: '单元修改范围正文。' }) }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 0, '单元内片段已完整出现,不应再注入');
    assert.equal(result.text.split('### 修改范围').length - 1, 1);
  } finally {
    cleanup(root);
  }
});

test('围栏内的示例阶段行不参与阶段读取', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': [
        '# 任务',
        '',
        '## 当前',
        '骨架示例：',
        '',
        '```',
        '阶段：完成',
        '```',
        '',
        '目标：示例目标。',
        '阶段：施工',
        '执行边界：示例边界。',
        '当前：T1。',
        '',
        '## 进度',
        '| 单元 | 状态 | 说明 |',
        '|---|---|---|',
        '| T1 单元 | 已自检 | |',
        '',
        '## 下一步与阅读',
        '继续。',
        '',
      ].join('\n'),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const explicit = run(root, {});
    assert.equal(explicit.code, 0);
    assert.ok(explicit.text.includes('阶段：施工'), '阶段应取围栏外的真实行');
    // 无参列表里该任务应以其真实阶段出现
    const list = run(root, { target: null });
    assert.ok(list.text.includes('demo [施工]'), '未完成任务列表应含本任务');
  } finally {
    cleanup(root);
  }
});

test('围栏与行内代码中的必读不展开', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/guide.md': '# 指南\n\n正文。\n',
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '```',
        '必读：[指南](../../guide.md)',
        '```',
        '写法示例：`必读：[指南](../../guide.md)`',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 0);
  } finally {
    cleanup(root);
  }
});

test('必读引用的问题一律报错且不输出材料', () => {
  const cases = [
    { line: '必读：[源码](../src/a.mjs)', expect: '源码等材料请用普通指针' },
    { line: '必读：[缺失](../../nope.md)', expect: '无法解析' },
    { line: '必读：[指南](../../guide.md#没有这个片段)', expect: '不存在' },
    { line: '必读：[指南](../../guide.md#重复标题-1)', expect: '定位不唯一' },
    { line: '必读：没有链接', expect: '缺少链接' },
    { line: '必读：[一](../../guide.md) 与 [二](../../guide.md#其他)', expect: '一行只能有一条链接' },
  ];
  for (const item of cases) {
    const root = makeTempRoot();
    try {
      // 第二处“重复标题”的编号锚点与字面量“重复标题-1”撞车,命中 2 处
      writeFiles(root, {
        'docs/guide.md': '# 指南\n\n## 重复标题\n\n甲。\n\n## 重复标题\n\n乙。\n\n## 重复标题-1\n\n丙。\n',
        'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', '继续 T1。\n' + item.line),
        'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
      });
      const result = run(root, { role: 'implement', unit: 'T1' });
      assert.equal(result.code, 1, item.line);
      assert.equal(result.text, undefined, item.line);
      assert.ok(result.messages.join('\n').includes(item.expect), item.line + ' 应说明 ' + item.expect);
    } finally {
      cleanup(root);
    }
  }
});

test('百分号编码的中文片段可以解析', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/指南 文档.md': '# 指南\n\n## 输入 处理\n\n编码片段。\n',
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', '继续 T1。\n必读：[片段](../../%E6%8C%87%E5%8D%97%20%E6%96%87%E6%A1%A3.md#%E8%BE%93%E5%85%A5-%E5%A4%84%E7%90%86)'),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.ok(result.readings[0].body.includes('编码片段'));
  } finally {
    cleanup(root);
  }
});

test('必读不越出仓根', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', '继续 T1。\n必读：[外部](../../../../outside.md)'),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('无法解析'));
  } finally {
    cleanup(root);
  }
});

test('无锚点的必读取整份文件,有锚点只取该片段', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/guide.md': '# 指南\n\n导言段。\n\n## 要点\n\n要点内容。\n\n## 无关\n\n无关内容。\n',
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '必读：[整份材料](../../guide.md)',
        '必读：[指南片段](../../guide.md#要点)',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 2);
    assert.ok(result.readings[0].body.includes('导言段'));
    assert.ok(result.readings[0].body.includes('无关内容'), '无锚点应取全文');
    assert.ok(result.readings[1].body.includes('要点内容'));
    assert.ok(!result.readings[1].body.includes('无关内容'), '有锚点只取该片段');
  } finally {
    cleanup(root);
  }
});

test('共同约束与当前设计显式待定时不交付施工材料', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc(),
      'docs/tasks/demo/details.md': detailsDoc({ design: '待定', units: unitBlock('T1', '单元') }),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 1);
    assert.equal(result.text, undefined);
  } finally {
    cleanup(root);
  }
});

test('只输出所选任务的材料', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({ name: 'demo' }));
    writeFiles(root, simpleTask({ name: 'other' }));
    writeFiles(root, {
      'docs/tasks/other/details.md': detailsDoc({ units: unitBlock('T1', '别的单元') }).replace('需求与验收条件。', '别的任务的需求。'),
    });
    const result = run(root, {});
    assert.equal(result.code, 0);
    assert.ok(!result.text.includes('别的任务的需求'));
    assert.ok(!result.text.includes('other'));
  } finally {
    cleanup(root);
  }
});

test('任务列表过滤完成与已取消,显式指定仍可读', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({ name: 'done', stage: '完成' }));
    writeFiles(root, simpleTask({ name: 'cancelled', stage: '已取消' }));
    writeFiles(root, simpleTask({ name: 'active', stage: '施工' }));
    const list = run(root, { target: null });
    assert.equal(list.code, 0);
    assert.ok(list.text.includes('active'));
    assert.ok(!list.text.includes('done'));
    assert.ok(!list.text.includes('cancelled'));
    const explicit = run(root, { target: 'done' });
    assert.equal(explicit.code, 0);
    assert.ok(explicit.text.includes('阶段：完成'));
  } finally {
    cleanup(root);
  }
});

test('缺 details.md 的任务不影响列表与其它任务', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/broken/state.md': stateDoc({ title: '半成品' }),
      'docs/tasks/ok/state.md': stateDoc({ title: '正常' }),
      'docs/tasks/ok/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const list = run(root, { target: null });
    assert.equal(list.code, 0);
    assert.ok(list.text.includes('broken'));
    assert.ok(list.text.includes('ok'));
  } finally {
    cleanup(root);
  }
});

test('输入错误返回 2', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask());
    assert.equal(run(root, { role: 'nope' }).code, 2);
    assert.equal(run(root, { unit: 'T1' }).code, 2);
    assert.equal(run(root, { role: 'explore', unit: 'T1' }).code, 2);
    assert.equal(run(root, { role: 'implement' }).code, 2);
    assert.equal(run(root, { role: 'implement', unit: 'X1' }).code, 2);
    assert.equal(run(root, { target: 'nope' }).code, 2);
    assert.equal(run(root, { target: '../../etc' }).code, 2);
  } finally {
    cleanup(root);
  }
});

test('缺少核心文件返回 1', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, { 'docs/tasks/demo/state.md': stateDoc() });
    const result = run(root, {});
    assert.equal(result.code, 1);
    assert.ok(result.messages.join('\n').includes('details.md'));
    // 显式给出的目录存在但缺核心文件:报缺项,而不是当作找不到
    const byPath = run(root, { target: 'docs/tasks/demo' });
    assert.equal(byPath.code, 1);
  } finally {
    cleanup(root);
  }
});
