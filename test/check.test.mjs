// check 的链接、片段、任务结构与范围行为。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCheck } from '../src/check.mjs';
import { cleanup, detailsDoc, makeTempRoot, simpleTask, stateDoc, unitBlock, writeFiles } from './helpers.mjs';

function run(root, scope = 'docs') {
  return runCheck({ root, cwd: root, scope });
}

test('本地链接与片段正常时通过', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/README.md': '# 入口\n\n见 [指南](guide.md#用法) 与 [本文](#入口)。\n',
      'docs/guide.md': '# 指南\n\n## 用法\n\n正文。\n',
    });
    const result = run(root);
    assert.equal(result.code, 0, result.text);
    assert.ok(result.text.includes('不判定语义正确'));
  } finally {
    cleanup(root);
  }
});

test('断链、缺片段、跨文件缺片段、越界链接都报出位置', () => {
  const cases = [
    { doc: '见 [没有](nope.md)。', expect: '链接目标不存在', file: 'docs/README.md' },
    { doc: '见 [片段](guide.md#没有)。', expect: '没有片段', file: 'docs/README.md' },
    { doc: '见 [片段](guide.md#用法)。', expect: null, file: null },
    { doc: '见 [越界](../../outside.md)。', expect: '越出仓根', file: 'docs/README.md' },
    { doc: '见 [本文](#不存在)。', expect: '本文没有片段', file: 'docs/README.md' },
  ];
  for (const item of cases) {
    const root = makeTempRoot();
    try {
      writeFiles(root, {
        'docs/README.md': '# 入口\n\n' + item.doc + '\n',
        'docs/guide.md': '# 指南\n\n## 用法\n\n正文。\n',
      });
      const result = run(root);
      if (item.expect === null) {
        assert.equal(result.code, 0, item.doc);
        continue;
      }
      assert.equal(result.code, 1, item.doc);
      assert.ok(result.text.includes(item.expect), item.doc);
      assert.ok(result.text.includes(item.file), item.doc);
      assert.ok(/\S+:\d+/.test(result.text), item.doc + ' 应带行号');
    } finally {
      cleanup(root);
    }
  }
});

test('围栏与行内代码中的链接不检查', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/README.md': [
        '# 入口',
        '',
        '示例：`[缺](nope.md)` 与',
        '',
        '```',
        '[缺](also-nope.md)',
        '```',
        '',
      ].join('\n'),
    });
    const result = run(root);
    assert.equal(result.code, 0, result.text);
  } finally {
    cleanup(root);
  }
});

test('模板骨架的占位链接不报错', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/template.md': '# 骨架\n\n必读：[<名称>](<相对当前文件的路径>.md#<锚点>)\n',
    });
    const result = run(root);
    assert.equal(result.code, 0, result.text);
  } finally {
    cleanup(root);
  }
});

test('整体尖括号目标是真实链接,断链同样报错', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/a.md': '# A\n\n[普通断链](nope.md) 与 [尖括号断链](<nope2.md>)\n',
      'docs/ok.md': '# B\n\n[正常](<a.md>)\n',
    });
    const result = run(root);
    assert.equal(result.code, 1);
    assert.ok(result.text.includes('nope.md'));
    assert.ok(result.text.includes('nope2.md'));
  } finally {
    cleanup(root);
  }
});

test('任务结构检查不随范围入口改变', () => {
  const broken = {
    'docs/tasks/demo/state.md': stateDoc({ progress: '| T9 缺失 | 未开始 | 无 |' }),
    'docs/tasks/demo/details.md': detailsDoc({ units: '' }),
    'docs/tasks/onlydetails/details.md': '# 详情\n\n## 目标与验收\n正文。\n',
  };
  const root = makeTempRoot();
  try {
    writeFiles(root, broken);
    // 覆盖 docs/tasks 的任何入口都要报 T9 缺单元;含 onlydetails 的入口还要报缺核心文件
    // 不含大小写变体:Linux 文件系统大小写敏感,DOCS 解析不到目录属平台行为,不是工具承诺
    for (const scope of ['docs', '.', 'docs/tasks']) {
      const result = run(root, scope);
      assert.equal(result.code, 1, scope);
      assert.ok(result.text.includes('T9'), scope);
      assert.ok(result.text.includes('找不到对应单元'), scope);
      assert.ok(result.text.includes('任务缺少核心文件'), scope);
    }
    // 单个任务目录作为范围:范围自身的问题同样受检
    const demo = run(root, 'docs/tasks/demo');
    assert.equal(demo.code, 1);
    assert.ok(demo.text.includes('找不到对应单元'), 'demo 入口应报 T9');
    const single = run(root, 'docs/tasks/onlydetails');
    assert.equal(single.code, 1);
    assert.ok(single.text.includes('任务缺少核心文件'), 'onlydetails 应报缺 state.md');
  } finally {
    cleanup(root);
  }
});

test('「当前」节缺检查项字段报错,字段在围栏内不算数', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': [
        '# 任务',
        '',
        '## 当前',
        '```',
        '目标：围栏示例',
        '阶段：完成',
        '```',
        '阶段：探索',
        '',
        '## 进度',
        '| 单元 | 状态 | 说明 |',
        '|---|---|---|',
        '',
        '## 下一步与阅读',
        '无。',
        '',
      ].join('\n'),
      'docs/tasks/demo/details.md': ['# 详情', '', '## 目标与验收', '需求。', ''].join('\n'),
    });
    const result = run(root);
    assert.equal(result.code, 1, result.text);
    // 围栏里的“目标：”不算,真实“阶段：探索”也不算缺失
    assert.ok(result.text.includes('缺少检查项字段“目标：”'));
    assert.ok(!result.text.includes('缺少检查项字段“阶段：”'));
    assert.ok(result.text.includes('缺少检查项字段“执行边界：”'));
    assert.ok(result.text.includes('缺少检查项字段“当前：”'));
    assert.ok(!result.text.includes('缺少合法阶段'), '阶段行存在且合法,不应再报枚举');
  } finally {
    cleanup(root);
  }
});

test('引用式链接按定义检查', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/README.md': '# 入口\n\n见 [规范][spec]。\n\n[spec]: guide.md#用法\n',
      'docs/guide.md': '# 指南\n\n## 用法\n\n正文。\n',
    });
    assert.equal(run(root).code, 0);
    writeFiles(root, { 'docs/README.md': '# 入口\n\n见 [规范][missing]。\n' });
    const result = run(root);
    assert.equal(result.code, 1);
    assert.ok(result.text.includes('引用式链接缺少定义'));
  } finally {
    cleanup(root);
  }
});

test('中文与含空格路径可用', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/README.md': '# 入口\n\n见 [规范](主题 目录/设计 说明.md#背景)。\n',
      'docs/主题 目录/设计 说明.md': '# 设计\n\n## 背景\n\n正文。\n',
    });
    assert.equal(run(root).code, 0);
  } finally {
    cleanup(root);
  }
});

test('默认跳过 docs/history,显式指定时检查', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/README.md': '# 入口\n\n正文。\n',
      'docs/history/old.md': '# 旧文档\n\n见 [断链](../gone.md)。\n',
    });
    assert.equal(run(root).code, 0);
    const history = run(root, 'docs/history');
    assert.equal(history.code, 1);
    assert.ok(history.text.includes('docs/history/old.md'));
  } finally {
    cleanup(root);
  }
});

test('状态表列出的单元必须在 details.md 存在', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ progress: '| T2 尚未定义 | 未开始 | [T2](details.md#t2) |' }),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root);
    assert.equal(result.code, 1);
    assert.ok(result.text.includes('T2'));
    assert.ok(result.text.includes('找不到对应单元'));
  } finally {
    cleanup(root);
  }
});

test('施工阶段要求单元结构完整,探索阶段不要求', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ progress: '| T1 单元 | 未开始 | details.md 的 T1 |' }),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元', { 方案与范围: null }) }),
    });
    assert.equal(run(root).code, 1);
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ stage: '探索', progress: '' }),
      'docs/tasks/demo/details.md': ['# 详情', '', '## 目标与验收', '需求。', ''].join('\n'),
    });
    assert.equal(run(root).code, 0);
  } finally {
    cleanup(root);
  }
});

test('四组小节占位在施工阶段报错,“无”是事实表述不报', () => {
  const root = makeTempRoot();
  try {
    for (const [title, body] of [
      ['目标与验收', '待定'], ['方案与范围', '待补'], ['依赖与必读', 'TBD'], ['当前结果', '<待补>'],
    ]) {
      writeFiles(root, {
        'docs/tasks/demo/state.md': stateDoc({ progress: '| T1 单元 | 未开始 | details.md 的 T1 |' }),
        'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元', { [title]: body }) }),
      });
      const result = run(root);
      assert.equal(result.code, 1, title + ' 占位应报错');
      assert.ok(result.text.includes(title) && result.text.includes('占位'), title + ' 应指明问题小节');
    }
    writeFiles(root, {
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元', { 方案与范围: '无', 依赖与必读: '无' }) }),
    });
    assert.equal(run(root).code, 0, '“无”是事实表述,不是占位');
  } finally {
    cleanup(root);
  }
});

test('章节重复、缺节与非法阶段都报错', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('## 进度', '## 进度\n重复占位。\n\n## 进度'),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const dup = run(root);
    assert.equal(dup.code, 1);
    assert.ok(dup.text.includes('重复'));

    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('## 下一步与阅读', '## 别的'),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const missing = run(root);
    assert.equal(missing.code, 1);
    assert.ok(missing.text.includes('下一步与阅读'));

    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({ stage: '进行中' }),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const stage = run(root);
    assert.equal(stage.code, 1);
    assert.ok(stage.text.includes('阶段'));
  } finally {
    cleanup(root);
  }
});

test('检查范围不存在返回 2', () => {
  const root = makeTempRoot();
  try {
    assert.equal(run(root, 'docs').code, 2);
    assert.equal(run(root, '../../').code, 2);
  } finally {
    cleanup(root);
  }
});

test('完整任务通过且只检查范围内的任务', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({ name: 'ok' }));
    writeFiles(root, {
      'docs/tasks/broken/state.md': stateDoc({ progress: '| T9 缺失 | 未开始 | 无 |' }),
      'docs/tasks/broken/details.md': detailsDoc({ units: '' }),
    });
    assert.equal(run(root, 'docs/tasks/ok').code, 0);
    assert.equal(run(root).code, 1);
  } finally {
    cleanup(root);
  }
});

test('体积提示单独成列且不影响退出码,结构问题与提示可同时显示', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc({
        progress: '| T9 缺失 | 未开始 | 无 |',
        extra: '目标：' + '长'.repeat(700) + '\n  续行继续' + '续'.repeat(400),
      }),
      'docs/tasks/demo/details.md': detailsDoc({ units: '', design: '方案版本：r1' + '\n' + '设'.repeat(3000) }),
    });
    const result = run(root);
    assert.equal(result.code, 1, '结构错误仍是 1');
    assert.ok(result.text.includes('找不到对应单元'), '结构问题照常显示');
    assert.ok(result.warnings.length >= 2, '应有体积提示');
    assert.ok(result.text.includes('体积提示'), '提示单独成段');
    assert.ok(result.text.includes('非 token'));
    assert.equal(result.issues.some((i) => i.reason.includes('超过')), false, '提示不进入 issues');
  } finally {
    cleanup(root);
  }
});

test('体积提示不失败、不改文件', () => {
  const root = makeTempRoot();
  try {
    writeFiles(root, simpleTask({ units: unitBlock('T1', '单元') }));
    const before = run(root);
    assert.equal(before.code, 0);
    assert.equal(before.warnings.length, 0, '常规任务无提示');
    const detailsPath = join(root, 'docs', 'tasks', 'demo', 'details.md');
    const bloated = detailsDoc({ units: unitBlock('T1', '单元', { 当前结果: '结'.repeat(6000) }) });
    writeFiles(root, { 'docs/tasks/demo/details.md': bloated });
    const after = run(root);
    assert.equal(after.code, 0, '提示不改变退出码');
    assert.equal(after.issues.length, 0);
    assert.equal(after.warnings.length, 2, '“当前结果”与单元整体各一条提示');
    assert.ok(after.warnings.some((w) => w.reason.includes('当前结果') && w.reason.includes('1024B')));
    assert.ok(after.warnings.some((w) => w.reason.includes('单元 T1 正文') && w.reason.includes('16384B')));
    assert.equal(readFileSync(detailsPath, 'utf8'), bloated, '不写文件');
  } finally {
    cleanup(root);
  }
});

test('当前节字段按已知字段名切分,值里含冒号与缩进续行都算正文', () => {
  const root = makeTempRoot();
  try {
    const longValue = '目标：' + '甲'.repeat(300) + '\n' + '  说明：见 http://example.com/' + 'x'.repeat(300);
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('目标：示例目标。', longValue),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root);
    assert.equal(result.code, 0, result.text);
    assert.equal(result.warnings.length, 1, '只有目标字段超限');
    assert.ok(result.warnings[0].reason.includes('“目标：”'));
    const expected = '甲'.repeat(300) + '\n' + '  说明：见 http://example.com/' + 'x'.repeat(300);
    assert.ok(result.warnings[0].reason.includes(String(Buffer.byteLength(expected, 'utf8')) + 'B'), '只统计冒号后的值加续行');
  } finally {
    cleanup(root);
  }
});

test('围栏内字段样例不新开字段但计入正文长度,缩进行不伪装成字段', () => {
  const root = makeTempRoot();
  try {
    const fenced = '当前：短。' + '\n' + '```' + '\n' + '方案版本：' + 'w'.repeat(1500) + '\n' + '```';
    writeFiles(root, {
      'docs/tasks/demo/state.md': stateDoc().replace('当前：T1。', fenced),
      'docs/tasks/demo/details.md': detailsDoc({ units: unitBlock('T1', '单元') }),
    });
    const result = run(root);
    assert.equal(result.code, 0, result.text);
    assert.equal(result.warnings.length, 1, '围栏里的方案版本不单独成字段');
    assert.ok(result.warnings[0].reason.includes('“当前：”'), '长度算在所在字段');

    const indented = '当前：短。' + '\n' + '  目标：' + 'q'.repeat(1500);
    writeFiles(root, { 'docs/tasks/demo/state.md': stateDoc().replace('当前：T1。', indented) });
    const second = run(root);
    assert.equal(second.code, 0, second.text);
    assert.equal(second.warnings.length, 1, '缩进行不开新字段');
    assert.ok(second.warnings[0].reason.includes('“当前：”'));
  } finally {
    cleanup(root);
  }
});
