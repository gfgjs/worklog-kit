// context:按任务、角色或章节提取接续材料。只读,不写任何持久状态。
// 输出中文直出消息,不引入配置层或语言包契约。
import { lstatSync, statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { anchorMap, makeFenceTracker, scanLinks } from './lib/md.mjs';
import { buildOutline, findChild, findSections, sectionBody, sectionText } from './lib/outline.mjs';
import { isDir, isFile, readText, relToRoot, resolveInRoot } from './lib/paths.mjs';
import { volumeLine } from './lib/volume.mjs';
import {
  ROLES,
  STATE_SECTIONS,
  checkUnitFields,
  collectLegacyIssues,
  h2,
  isPlaceholder,
  listTaskDirs,
  loadTask,
  loadTaskMeta,
  requireSections,
  resolveTaskDir,
} from './lib/taskdoc.mjs';

/** 各角色在 state.md 之外读取的 details 章节;optional 只在该章节存在时注入。 */
const ROLE_DETAILS = {
  explore: { required: ['目标与验收'], optional: ['探索结果', '共同约束'] },
  design: { required: ['目标与验收', '探索结果', '共同约束', '当前设计'], optional: [] },
  implement: { required: ['共同约束', '当前设计'], optional: [] },
  accept: { required: ['目标与验收', '共同约束', '当前设计'], optional: [] },
};
/** 整体验收(accept 不带 unit)按单元汇集的三个小节;方案与范围属施工材料,不进验收读集。 */
const ACCEPT_UNIT_SECTIONS = ['目标与验收', '依赖与必读', '当前结果'];

const BIDU_RE = /^\s*必读\s*[：:]\s*(\S.*)$/;
const UNIT_ID_RE = /^T\d+$/;
const EXTERNAL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const CLOSED_STAGES = ['完成', '已取消'];

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 按现有锚点规则定位唯一章节;必读与按章补读共用诊断。 */
function resolveSection(outline, relPath, anchor, label) {
  const hits = anchorMap(outline.items).get(anchor) ?? [];
  if (hits.length === 0) {
    return { reason: `${label}片段不存在：${relPath}#${anchor}` };
  }
  if (hits.length > 1) {
    return { reason: `${label}片段定位不唯一：${relPath}#${anchor} 命中 ${hits.length} 处` };
  }
  return { item: hits[0] };
}

/** 同文件只保留最大的完整区间;相等区间保留先出现的一份。 */
function maximalRanges(items) {
  return items.filter((item, index) => !items.some((other, otherIndex) =>
    other.absPath === item.absPath && other.start <= item.start && other.end >= item.end
    && (other.start < item.start || other.end > item.end || otherIndex < index),
  ));
}

/** 列出 docs/tasks 下未完成的任务;完成与已取消需显式指定任务名查看。 */
export function listTasks(root) {
  const tasksDir = join(root, 'docs', 'tasks');
  const rows = [];
  for (const name of listTaskDirs(tasksDir)) {
    const absDir = join(tasksDir, name);
    const relDir = relToRoot(root, absDir);
    const meta = loadTaskMeta(root, absDir, relDir);
    if (meta.stage && CLOSED_STAGES.includes(meta.stage)) continue;
    rows.push(meta);
  }
  const lines = ['任务中枢:docs/tasks 下的任务', ''];
  if (rows.length === 0) {
    lines.push('当前没有未完成任务。');
  } else {
    lines.push('未完成任务:');
    for (const r of rows) {
      lines.push(`- ${r.name} [${r.stage ?? '阶段未识别'}]${r.note ? `(${r.note})` : ''}  ${r.relDir}/state.md`);
    }
  }
  lines.push('');
  lines.push('已完成或已取消的任务不在此列表,需用任务名显式查看。');
  lines.push('用 context <任务名或路径> [--role explore|design|implement|accept] [--unit T1] 提取材料。');
  return { text: lines.join('\n'), rows };
}

/** 从已选章节收集“必读：”标记的一层本地 Markdown 引用。 */
function collectReading(root, sources) {
  const items = [];
  const issues = [];
  for (const src of sources) {
    const base = dirname(src.absPath);
    const inFence = makeFenceTracker();
    src.body.split(/\r?\n/).forEach((line) => {
      if (inFence(line)) return; // 围栏内的示例“必读”不算
      const m = BIDU_RE.exec(line);
      if (!m) return;
      const links = scanLinks(line);
      if (links.length === 0) {
        issues.push({ file: src.relPath, reason: `“${src.title}”中的必读标记缺少链接：${m[1].trim()}` });
        return;
      }
      if (links.length > 1) {
        issues.push({ file: src.relPath, reason: `“${src.title}”中的必读标记一行只能有一条链接` });
        return;
      }
      const raw = links[0].target;
      if (EXTERNAL_RE.test(raw)) {
        issues.push({ file: src.relPath, reason: `必读只支持本地 Markdown 片段,不接受外部地址：${raw}` });
        return;
      }
      const hashAt = raw.indexOf('#');
      const pathPart = hashAt === -1 ? raw : raw.slice(0, hashAt);
      const rawAnchor = hashAt === -1 ? '' : raw.slice(hashAt + 1);
      const anchor = rawAnchor === '' ? null : decode(rawAnchor).toLowerCase();
      // 同文件 # 锚点:目标就是必读标记所在的文件;带文件路径的锚点与无锚点整份文件照旧解析
      let absPath;
      if (pathPart === '') {
        if (anchor === null) {
          issues.push({ file: src.relPath, reason: `必读目标为空,应给出文件路径或 # 锚点：${raw}` });
          return;
        }
        absPath = src.absPath;
      } else {
        if (!/\.md$/i.test(pathPart)) {
          issues.push({ file: src.relPath, reason: `必读只支持本地 Markdown 片段,源码等材料请用普通指针：${raw}` });
          return;
        }
        absPath = resolveInRoot(root, base, decode(pathPart));
        if (absPath === null || !isFile(absPath)) {
          issues.push({ file: src.relPath, reason: `必读引用无法解析：${raw}` });
          return;
        }
      }
      const rel = relToRoot(root, absPath);
      const text = readText(absPath);
      const outline = buildOutline(text);
      let resolved;
      if (anchor === null) {
        resolved = { body: text.replace(/\s+$/, ''), start: 1, end: outline.lines.length };
      } else {
        const { item, reason } = resolveSection(outline, rel, anchor, '必读');
        if (!item) {
          issues.push({ file: src.relPath, reason });
          return;
        }
        resolved = { body: sectionText(outline, item), title: item.title, ...item };
      }
      items.push({ source: src.relPath, target: raw, rel, absPath, start: resolved.start, end: resolved.end, body: resolved.body });
    });
  }
  return { items, issues };
}

/** 无参只读工作索引;只有路径缺失才回退列表。 */
function workIndex(root) {
  const path = join(root, 'docs', 'todo.md');
  try {
    lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Windows 也可能把父路径不是目录报告成 ENOENT。
      try {
        if (!statSync(dirname(path)).isDirectory()) {
          return { code: 2, messages: ['无法访问 docs/todo.md：docs 不是目录'] };
        }
      } catch (parentError) {
        if (parentError.code !== 'ENOENT') {
          return { code: 2, messages: [`无法访问 docs/todo.md：${parentError.message}`] };
        }
      }
      return { code: 0, text: `${listTasks(root).text}\n可按需创建 docs/todo.md 作为工作选择索引。` };
    }
    return { code: 2, messages: [`无法访问 docs/todo.md：${error.message}`] };
  }
  try {
    if (!statSync(path).isFile()) {
      return { code: 2, messages: ['docs/todo.md 不是文件'] };
    }
    const body = readFileSync(path, 'utf8');
    if (!body.trim()) return { code: 1, messages: ['docs/todo.md 为空，请填写工作选择索引'] };
    return { code: 0, text: `来源：docs/todo.md\n\n${body}\n用 context --list 查看全部未完成任务。` };
  } catch (error) {
    return { code: 2, messages: [`无法读取 docs/todo.md：${error.message}`] };
  }
}

export function runContext({ root, cwd, target = null, role = null, unit = null, list = false, sections = [] }) {
  const sectionOnly = sections.length > 0;
  if (sectionOnly && (role !== null || unit !== null || list)) {
    return { code: 2, messages: ['--section 与 --role、--unit、--list 互斥'] };
  }
  if (list) {
    if (target !== null || role !== null || unit !== null) {
      return { code: 2, messages: ['--list 与任务参数、--role、--unit 互斥'] };
    }
    return { code: 0, text: listTasks(root).text };
  }
  if (target === null) {
    if (sectionOnly) return { code: 2, messages: ['--section 需要指定任务'] };
    if (role !== null || unit !== null) {
      return { code: 2, messages: ['--role 或 --unit 需要指定任务'] };
    }
    return workIndex(root);
  }
  if (role !== null && !ROLES.includes(role)) {
    return { code: 2, messages: [`未知角色：${role}。可用角色：${ROLES.join('|')}`] };
  }
  if (unit !== null && role !== null && role !== 'implement' && role !== 'accept') {
    return {
      code: 2,
      messages: [`--unit 可单独补读,或用于 implement 与 accept 角色,当前角色为 ${role}`],
    };
  }
  if (unit !== null && !UNIT_ID_RE.test(unit)) {
    return { code: 2, messages: [`单元编号格式应为 T1、T2 这类形式：${unit}`] };
  }
  if (role === 'implement' && unit === null) {
    return { code: 2, messages: ['implement 角色必须指定 --unit'] };
  }

  const unitOnly = role === null && unit !== null;

  const absDir = resolveTaskDir(root, cwd, target);
  if (absDir === null || !isDir(absDir)) {
    return { code: 2, messages: [`未找到任务目录：${target}(可用任务名或仓根内路径)`] };
  }
  const relDir = relToRoot(root, absDir);
  const missing = ['state.md', 'details.md'].filter((f) => !isFile(join(absDir, f)));
  if (missing.length > 0) {
    return { code: 1, messages: [`任务目录 ${relDir} 缺少核心文件：${missing.join('、')}`] };
  }

  const task = loadTask(root, absDir, relDir);
  const issues = [];
  const sectionItems = [];
  for (const raw of sections) {
    const anchor = decode(raw.replace(/^#/, '')).toLowerCase();
    const { item, reason } = resolveSection(task.details.outline, task.details.relPath, anchor, '所选');
    if (item) sectionItems.push({ item, anchor });
    else issues.push({ file: task.details.relPath, reason });
  }
  const stateSections = sectionOnly ? new Map() : requireSections(task.state.outline, task.state.relPath, STATE_SECTIONS, 'state.md ', issues);
  const roleSpec = ROLE_DETAILS[role] ?? { required: [], optional: [] };
  const detailsSections = requireSections(task.details.outline, task.details.relPath, roleSpec.required, 'details.md ', issues);

  let unitItem = null;
  if (unit !== null) {
    const hits = task.units.get(unit) ?? [];
    if (hits.length === 0) {
      issues.push({ file: task.details.relPath, reason: `details.md 缺少施工单元 ${unit}` });
    } else if (hits.length > 1) {
      issues.push({ file: task.details.relPath, reason: `施工单元 ${unit} 重复出现 ${hits.length} 次,定位不唯一` });
    } else {
      unitItem = hits[0];
      checkUnitFields(task.details, unitItem, issues, { label: unit });
    }
    // 单元级取材只提示本单元旧结构与全局“执行结果”残留;其它单元的旧格式由整体验收与 check 负责
    collectLegacyIssues(task.details, unitItem ? [unitItem] : [], issues);
  }
  if (role === 'accept' && unit === null) {
    // 整体验收汇集全部单元;任一单元结构不完整都指出来,不静默截断读集
    if (task.units.size === 0) {
      issues.push({ file: task.details.relPath, reason: '整体验收需要至少一个施工单元,details.md 没有可验收的 T 单元' });
    }
    collectLegacyIssues(task.details, [...task.units.values()].flat(), issues);
    for (const [id, hits] of task.units) {
      if (hits.length > 1) {
        issues.push({ file: task.details.relPath, reason: `施工单元 ${id} 重复出现 ${hits.length} 次,定位不唯一` });
        continue;
      }
      checkUnitFields(task.details, hits[0], issues, { label: id });
    }
  }

  const design = h2(task.details.outline, '当前设计');
  if (role === 'implement' || role === 'accept') {
    if (design && isPlaceholder(sectionBody(task.details.outline, design))) {
      issues.push({ file: task.details.relPath, reason: '“当前设计”仍为待定或尚未形成,不能作为现行材料' });
    }
  }
  if (issues.length > 0) {
    return {
      code: 1,
      issues,
      messages: [`任务 ${relDir} 的材料不完整,未输出执行材料：`, ...issues.map((i) => `- ${i.file}  ${i.reason}`)],
    };
  }

  const selectedSources = sectionOnly || unitOnly ? [] : STATE_SECTIONS.map((title) => source('state', title, task.state, stateSections.get(title)));
  for (const { item, anchor } of sectionItems) {
    selectedSources.push({ ...source('details', item.title, task.details, item), anchor });
  }
  for (const title of roleSpec.required) {
    const item = detailsSections.get(title);
    if (item) selectedSources.push(source('details', title, task.details, item));
  }
  for (const title of roleSpec.optional) {
    const hits = findSections(task.details.outline, 2, title);
    if (hits.length > 1) {
      return {
        code: 1,
        messages: [`details.md 章节“${title}”重复出现 ${hits.length} 次,定位不唯一,未输出执行材料。`],
      };
    }
    if (hits.length === 1) selectedSources.push(source('details', title, task.details, hits[0]));
  }
  if (unitItem) selectedSources.push(source('unit', unitItem.title, task.details, unitItem));
  const planPointers = [];
  if (role === 'accept' && unit === null) {
    for (const [id, hits] of task.units) {
      if (hits.length !== 1) continue; // 重复与缺项已在 issues 报告
      for (const title of ACCEPT_UNIT_SECTIONS) {
        const found = findChild(task.details.outline, hits[0], 3, title);
        if (found.length === 1) selectedSources.push(source('unit', `${id} ${title}`, task.details, found[0]));
      }
    }
    // 方案与范围不进整体验收读集,给每单元真实锚点指针定位;指针只指向该片段,不代表单元全文
    const anchors = anchorMap(task.details.outline.items);
    for (const [id, hits] of task.units) {
      if (hits.length !== 1) continue;
      const plan = findChild(task.details.outline, hits[0], 3, '方案与范围');
      if (plan.length !== 1) continue;
      const anchor = [...anchors.entries()].find(([, items]) => items.length === 1 && items[0] === plan[0])?.[0];
      if (anchor) planPointers.push({ unit: id, pointer: `${task.details.relPath}#${anchor}` });
    }
  }

  // 只读 state 时保留阅读路径;角色读集、单元和章节补读从所选正文收集一层必读。
  const reading = role === null && unit === null && !sectionOnly ? { items: [], issues: [] } : collectReading(root, selectedSources);
  if (reading.issues.length > 0) {
    return {
      code: 1,
      issues: reading.issues,
      messages: [`任务 ${relDir} 的必读引用有问题,未输出执行材料：`, ...reading.issues.map((i) => `- ${i.file}  ${i.reason}`)],
    };
  }

  // 先校验原选读集的一层必读,再统一去重;显式选择排在前面,相等区间优先保留。
  const fragments = maximalRanges([...selectedSources, ...reading.items]);
  const sources = fragments.filter((item) => item.kind);
  const readings = fragments.filter((item) => !item.kind);
  const lines = ['# 接续材料', ''];
  lines.push(`任务：${task.name}`);
  lines.push(`来源目录：${task.relDir}`);
  lines.push(sectionOnly ? '模式：章节补读' : unitOnly ? `模式：单元补读(${unit})` : `角色：${role ?? 'state(仅状态)'}`);
  lines.push(`阶段：${task.stage ?? '未识别'}`);
  lines.push(`方案版本：${task.version ?? '无'}`);
  lines.push(volumeLine(sources, readings));
  if (unitOnly) {
    lines.push('已有共享材料直接复用；需要完整角色材料时用 --role，仅缺少、变更或冲突部分材料时按章节补读。');
  }
  for (const src of sources) {
    lines.push('');
    lines.push('---');
    lines.push(`来源：${src.relPath} 的“${src.title}”${src.anchor ? ` #${src.anchor}` : ''}`);
    lines.push('');
    lines.push(src.body);
  }
  if (readings.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('必读片段(仅一层,不递归展开):');
    for (const item of readings) {
      lines.push('');
      lines.push(`来源：${item.source} → ${item.target}`);
      lines.push('');
      lines.push(item.body);
    }
  }
  if (role === 'accept' && unit === null && planPointers.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('单元方案定位（按需补读）：');
    for (const p of planPointers) lines.push(`- ${p.unit}: ${p.pointer}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('以上为文件原文摘录,用于定位与接续;结构完整不代表已获准执行。');
  if (role === 'accept') {
    lines.push('验收者须按相关条件补读方案、差异与真实证据;以上摘录与摘要不能单独证明通过。');
  }
  return { code: 0, text: lines.join('\n'), sources, readings };
}

function source(kind, title, doc, item) {
  return { kind, title, relPath: doc.relPath, absPath: doc.path, start: item.start, end: item.end, body: sectionText(doc.outline, item) };
}
