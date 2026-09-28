// 测试夹具:在临时目录里搭出任务文档与消费项目,不触碰工作区真实文件。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function makeTempRoot(prefix = 'worklog-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

export function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

const UNIT_FIELDS = {
  目标与验收: '完成后行为可验证。',
  方案与范围: 'src/a.mjs。',
  依赖与必读: '必读：[共同约束](details.md#共同约束)',
  当前结果: '尚未开始；未验证。',
};

/** 生成一个完整的施工单元;overrides 里给 null 表示省略该小标题。 */
export function unitBlock(id, title, overrides = {}) {
  const fields = { ...UNIT_FIELDS, ...overrides };
  const lines = ['## ' + id + ' ' + title];
  for (const [name, body] of Object.entries(fields)) {
    if (body === null) continue;
    lines.push('### ' + name, body, '');
  }
  return lines.join('\n');
}

export function stateDoc({ title = '示例任务', stage = '施工', progress = '| T1 单元 | 已自检 | details.md 的 T1 |', extra = '' } = {}) {
  return [
    '# ' + title,
    '',
    '## 当前',
    '目标：示例目标。',
    '阶段：' + stage,
    '执行边界：示例边界。',
    '当前：T1。',
    '方案版本：r1',
    '阻塞：无。',
    extra,
    '',
    '## 进度',
    '| 单元 | 状态 | 说明与结果 |',
    '|---|---|---|',
    progress,
    '',
    '## 下一步与阅读',
    '继续 T1。',
    '',
  ].join('\n');
}

export function detailsDoc({ units = '', design = '方案版本：r1\n按方案实现。', extraSections = '' } = {}) {
  return [
    '# 示例任务详情',
    '',
    '## 目标与验收',
    '需求与验收条件。',
    '',
    '## 探索结果',
    '入口与证据。',
    '',
    '## 共同约束',
    '零依赖,Node >= 20。',
    '',
    '## 当前设计',
    design,
    '',
    units,
    extraSections,
  ].join('\n');
}

/** 一个可施工的最小任务。 */
export function simpleTask({ name = 'demo', stage = '施工', units = unitBlock('T1', '示例单元'), progress } = {}) {
  return {
    ['docs/tasks/' + name + '/state.md']: stateDoc({
      stage,
      progress: progress ?? '| T1 示例单元 | 已自检 | details.md 的 T1 |',
    }),
    ['docs/tasks/' + name + '/details.md']: detailsDoc({ units }),
  };
}
