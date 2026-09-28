// context 的角色切片、缺项报错、必读片段与去重。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runContext } from '../src/context.mjs';
import { runCheck } from '../src/check.mjs';
import { cleanup, detailsDoc, makeTempRoot, simpleTask, stateDoc, unitBlock, writeFiles } from './helpers.mjs';
import { volumeLine } from '../src/lib/volume.mjs';

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
    // accept 带 unit:共享目标与验收 + 共同约束与当前设计 + 完整单元
    const acceptUnit = run(root, { role: 'accept', unit: 'T1' });
    assert.deepEqual(titles(acceptUnit), ['当前', '进度', '下一步与阅读', '目标与验收', '共同约束', '当前设计', 'T1 示例单元']);
    // 整体验收:共享读集 + 每单元三个小节;方案与范围只给真实锚点指针,不注入方案正文
    const accept = run(root, { role: 'accept' });
    assert.deepEqual(titles(accept), ['当前', '进度', '下一步与阅读', '目标与验收', '共同约束', '当前设计', 'T1 目标与验收', 'T1 依赖与必读', 'T1 当前结果']);
    assert.ok(accept.text.includes('T1: docs/tasks/demo/details.md#方案与范围'), '方案与范围给真实锚点指针');
    assert.ok(!accept.text.includes('### 方案与范围'), '方案正文不注入整体验收');
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

test('施工角色缺小标题、旧结构残留、重复与占位都报错', () => {
  const cases = [
    { name: '缺小标题', units: unitBlock('T1', '单元', { 方案与范围: null }), expect: '方案与范围' },
    { name: '占位', units: unitBlock('T1', '单元', { 当前结果: '待定' }), expect: '待定' },
    { name: '尖括号占位', units: unitBlock('T1', '单元', { 目标与验收: '<待补>' }), expect: '待定或占位' },
    { name: '旧八项残留', units: unitBlock('T1', '单元') + '\n### 最低验证\n旧验证正文。\n', expect: '旧八项结构' },
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

test('正文后部的“待定”字样与“待决定：无”不拦施工', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '单元', { 方案与范围: '若设计前提待定,停止并回传;其余自行处理。' }),
    }));
    writeFiles(root, {
      'docs/tasks/demo/details.md': detailsDoc({
        design: '方案版本：r1\n按方案实现。\n待决定：无。',
        units: unitBlock('T1', '单元', { 方案与范围: '若设计前提待定,停止并回传。' }),
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
      units: unitBlock('T1', '单元', { 方案与范围: '无', 依赖与必读: '无' }),
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

test('必读指向未覆盖的共享片段仍注入,已覆盖的单元内片段不重复', () => {
  const root = makeTempRoot();
  try {
    // details.md 顶层“目标与验收”与 T1 单元内“目标与验收”同名;
    // 必读指向顶层(#目标与验收)未被 implement 选入,应注入;
    // 指向单元内那处(#目标与验收-1)已随完整单元注入,应去重
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '单元', {
        目标与验收: '单元验收正文。',
        依赖与必读: [
          '必读：[总目标](details.md#目标与验收)',
          '必读：[单元验收](details.md#目标与验收-1)',
        ].join('\n'),
      }),
    }));
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 1, '顶层共享片段注入,单元内已覆盖片段去重');
    assert.ok(result.readings[0].body.includes('需求与验收条件'), '注入的是顶层共享片段');
    assert.equal((result.text.match(/^### 目标与验收$/gm) ?? []).length, 1, '单元内片段不重复出现');
  } finally {
    cleanup(root);
  }
});

test('必读指向已注入单元内的小节不重复注入', () => {
  const root = makeTempRoot();
  try {
    // implement 已注入 T1 单元全文,其中含“### 方案与范围”;
    // 必读用同文件锚点指向该小节时,其区间已被完整覆盖,应去重
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '单元', {
        依赖与必读: '必读：[方案](#方案与范围)',
      }),
    }));
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 0, '单元内片段已完整出现,不应再注入');
    assert.equal((result.text.match(/^### 方案与范围$/gm) ?? []).length, 1);
  } finally {
    cleanup(root);
  }
});

test('无关单元与历史材料增长不改变指定单元读集', () => {
  const root = makeTempRoot();
  try {
    const evidenceBody = '# 证据\n\n## 记录\n\nT1 的过程证据正文。\n';
    const resultLine = '实现完成;证据见 [证据](references/evidence.md#记录)。';
    writeFiles(root, {
      ...simpleTask({ units: unitBlock('T1', '示例单元', { 当前结果: resultLine })
        + '\n' + unitBlock('T2', '无关单元') }),
      'docs/tasks/demo/references/evidence.md': evidenceBody,
    });
    const beforeImpl = run(root, { role: 'implement', unit: 'T1' });
    const beforeAcc = run(root, { role: 'accept', unit: 'T1' });
    assert.equal(beforeImpl.code, 0, beforeImpl.messages?.join('\n'));
    assert.equal(beforeAcc.code, 0, beforeAcc.messages?.join('\n'));
    writeFiles(root, {
      'docs/tasks/demo/details.md': detailsDoc({
        units: unitBlock('T1', '示例单元', { 当前结果: resultLine }) + '\n'
          + unitBlock('T2', '无关单元', { 当前结果: 'T2 已自检。' + '增'.repeat(2000) }),
      }),
      'docs/history/note.md': '# 历史笔记\n\n## 旧结论\n\n历史结论正文。\n',
      'docs/tasks/demo/references/evidence.md': evidenceBody + '新增过程证据。'.repeat(2000),
    });
    const afterImpl = run(root, { role: 'implement', unit: 'T1' });
    const afterAcc = run(root, { role: 'accept', unit: 'T1' });
    assert.equal(afterImpl.code, 0, afterImpl.messages?.join('\n'));
    assert.equal(afterAcc.code, 0, afterAcc.messages?.join('\n'));
    assert.equal(afterImpl.text, beforeImpl.text, 'implement T1 输出应与增长前逐字一致');
    assert.equal(afterAcc.text, beforeAcc.text, 'accept T1 输出应与增长前逐字一致');
    assert.ok(!afterImpl.text.includes('T2 已自检'));
    assert.ok(!afterImpl.text.includes('历史结论正文'));
    const check = runCheck({ root, cwd: root, scope: 'docs/tasks/demo' });
    assert.equal(check.code, 0, check.text);
  } finally {
    cleanup(root);
  }
});

test('设计修订后旧证据仍可达,不误标新通过', () => {
  const root = makeTempRoot();
  try {
    const evidenceLink = '证据见 [证据](references/evidence.md#记录)。';
    const evidencePath = join(root, 'docs', 'tasks', 'demo', 'references', 'evidence.md');
    const evidenceDoc = '# 证据\n\n## 记录\n\nr1 阶段的失败与通过证据正文。\n';
    writeFiles(root, {
      ...simpleTask({ stage: '待验收', units: unitBlock('T1', '示例单元', {
        当前结果: '适用 r1;' + evidenceLink + '旧失败/通过证据仅证明 r1 阶段事实。',
      }) }),
      'docs/tasks/demo/references/evidence.md': evidenceDoc,
    });
    // 设计修订:方案版本升为 r2,单元结果显式限定适用范围,证据文件原样保留
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({
        stage: '施工',
        progress: '| T1 示例单元 | 待处理 | details.md 的 T1 |',
      }).replace('方案版本：r1', '方案版本：r2'),
      'docs/tasks/demo/details.md': detailsDoc({
        design: '方案版本：r2\n修订后的设计。',
        units: unitBlock('T1', '示例单元', {
          当前结果: 'r2 尚未验证;r1 结果只适用 r1;' + evidenceLink,
        }),
      }),
    });
    const acceptUnit = run(root, { role: 'accept', unit: 'T1' });
    assert.equal(acceptUnit.code, 0, acceptUnit.messages?.join('\n'));
    assert.ok(acceptUnit.text.includes('r2 尚未验证'), '输出保留 r2 未验证事实');
    assert.ok(acceptUnit.text.includes('r1 结果只适用 r1'), '输出保留 r1 适用限定');
    assert.equal(acceptUnit.readings.length, 0, '普通证据链接不注入旧证据正文');
    assert.ok(acceptUnit.text.includes('结构完整不代表已获准执行'), '修订不改变摘录性质');
    const acceptAll = run(root, { role: 'accept' });
    assert.equal(acceptAll.code, 0, acceptAll.messages?.join('\n'));
    const resultSrc = acceptAll.sources.find((s) => s.title === 'T1 当前结果');
    assert.ok(resultSrc?.body.includes('r2 尚未验证') && resultSrc.body.includes('r1 结果只适用 r1'), '单元“当前结果”保留两条限定');
    assert.ok(acceptAll.text.includes('T1: docs/tasks/demo/details.md#方案与范围'), '方案指针在修订后仍可达');
    const check = runCheck({ root, cwd: root, scope: 'docs/tasks/demo' });
    assert.equal(check.code, 0, check.text);
    assert.equal(readFileSync(evidencePath, 'utf8'), evidenceDoc, '旧证据正文未被改写');
  } finally {
    cleanup(root);
  }
});

test('单元外全局执行结果残留:四类入口均报迁移提示,无角色仍可读', () => {
  const root = makeTempRoot();
  try {
    const units = () => unitBlock('T1', '示例单元', { 当前结果: 'T1 已自检。' });
    writeFiles(root, simpleTask({ stage: '待验收', units: units() }));
    const seeds = [
      '## 执行结果\n\nr1 全局结果正文。\n',
      '## 执行结果\n',
      '## 执行结果\n\n旧结果甲。\n\n## 执行结果\n\n旧结果乙。\n',
    ];
    for (const [i, legacy] of seeds.entries()) {
      writeFiles(root, {
        'docs/tasks/demo/details.md': detailsDoc({ units: units(), extraSections: legacy }),
      });
      const impl = run(root, { role: 'implement', unit: 'T1' });
      assert.equal(impl.code, 1, 'implement T1 应拒绝旧全局执行结果(用例 ' + i + ')');
      assert.ok(impl.messages.join('\n').includes('执行结果'), 'implement 应给迁移提示(用例 ' + i + ')');
      const accUnit = run(root, { role: 'accept', unit: 'T1' });
      assert.equal(accUnit.code, 1);
      assert.ok(accUnit.messages.join('\n').includes('执行结果'));
      const accAll = run(root, { role: 'accept' });
      assert.equal(accAll.code, 1);
      assert.ok(accAll.messages.join('\n').includes('执行结果'));
      const check = runCheck({ root, cwd: root, scope: 'docs/tasks/demo' });
      assert.equal(check.code, 1);
      assert.ok(check.text.includes('执行结果'));
      const plain = run(root, {});
      assert.equal(plain.code, 0, '无角色读 state 不受旧残留影响');
      assert.ok(plain.text.includes('## 当前'));
    }
    // 同一测试顺带覆盖:accept 空单元与设计待定均拒绝
    writeFiles(root, { 'docs/tasks/demo/details.md': detailsDoc({ units: '' }) });
    const empty = run(root, { role: 'accept' });
    assert.equal(empty.code, 1);
    assert.ok(empty.messages.join('\n').includes('至少一个施工单元'));
    writeFiles(root, { 'docs/tasks/demo/details.md': detailsDoc({ design: '待定', units: units() }) });
    const pending = run(root, { role: 'accept', unit: 'T1' });
    assert.equal(pending.code, 1);
    assert.ok(pending.messages.join('\n').includes('当前设计'));
  } finally {
    cleanup(root);
  }
});

test('共享片段里的必读仍注入,指向同一片段时去重', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/guide.md': '# 指南\n\n## 输入处理\n\n输入事件的约定。\n',
      ...simpleTask(),
    });
    writeFiles(root, {
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') })
        .replace('零依赖,Node >= 20。', '零依赖,Node >= 20。\n必读：[约束必读](../../guide.md#输入处理)')
        .replace('按方案实现。', '按方案实现。\n必读：[设计必读](../../guide.md#输入处理)'),
    });
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    assert.equal(result.readings.length, 1, '两处共享片段的必读指向同一片段,只注入一次');
    assert.ok(result.readings[0].body.includes('输入事件的约定'));
  } finally {
    cleanup(root);
  }
});

test('整体accept同文件锚点:父单元完整展开,已含子段不重复', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '示例单元', {
        依赖与必读: '必读：[本单元](#t1-示例单元)\n必读：[本单元结果](#当前结果)',
      }),
    }));
    const result = run(root, { role: 'accept' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    const whole = result.readings.find((r) => r.target === '#t1-示例单元');
    assert.ok(whole, '整体验收只选三小节,指向父单元的必读应完整展开');
    assert.ok(whole.body.includes('### 方案与范围'), '父单元展开应含方案小节');
    assert.equal(result.readings.length, 1, '已选子段“当前结果”去重,只注入父单元一份');
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

test('指定任务的输出带一行正文体积摘要,按节列字节且不含输出包装', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({
      units: unitBlock('T1', '单元'),
      progress: '| T1 示例单元 | 已自检 | details.md 的 T1 |',
    }));
    const result = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(result.code, 0, result.messages?.join('\n'));
    const line = result.text.split('\n').find((l) => l.startsWith('正文体积('));
    assert.ok(line, '应有一行体积摘要');
    assert.match(line, /UTF-8 字节/);
    assert.match(line, /非 token/);
    for (const src of result.sources) {
      const bytes = Buffer.byteLength(src.body, 'utf8');
      assert.ok(line.includes(src.title + ' ' + bytes + 'B'), src.title + ' 的字节应按正文统计');
    }
    for (const src of result.sources) assert.ok(result.text.includes(src.body), src.title + ' 正文应完整保留');
    assert.ok(result.text.includes('结构完整不代表已获准执行'));
    assert.ok(!line.includes('来源：'));
  } finally {
    cleanup(root);
  }
});

test('一层必读总量计入摘要,且无参 todo 与 --list 不加摘要', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/guide.md': '# 指南\n\n## 输入处理\n\n输入事件的约定。\n',
      'docs/tasks/demo/state.md': stateDoc().replace('继续 T1。', [
        '继续 T1。',
        '必读：[指南片段](../../guide.md#输入处理)',
      ].join('\n')),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
      'docs/todo.md': '# 工作索引',
    });
    const withReading = run(root, { role: 'implement', unit: 'T1' });
    assert.equal(withReading.code, 0, withReading.messages?.join('\n'));
    assert.equal(withReading.readings.length, 1);
    const readBytes = Buffer.byteLength(withReading.readings[0].body, 'utf8');
    assert.ok(withReading.text.includes('一层必读 1 段 ' + readBytes + 'B'), '摘要应含一层必读总量');
    assert.ok(!run(root, { target: null }).text.includes('正文体积('), '无参 todo 不加摘要');
    assert.ok(!run(root, { target: null, list: true }).text.includes('正文体积('), '--list 不加摘要');
  } finally {
    cleanup(root);
  }
});

test('重名标题在摘要里用来源文件辨识', () => {
  const sources = [
    { title: '当前设计', relPath: 'docs/tasks/a/details.md', body: '甲' },
    { title: '当前设计', relPath: 'docs/tasks/b/details.md', body: '乙乙' },
  ];
  const line = volumeLine(sources, []);
  assert.ok(line.includes('当前设计(docs/tasks/a/details.md) 3B'), line);
  assert.ok(line.includes('当前设计(docs/tasks/b/details.md) 6B'), line);
  assert.equal(line.split('当前设计(').length - 1, 2, '重名时两处都带来源');
});
