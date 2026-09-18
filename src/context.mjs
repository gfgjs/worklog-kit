// context:按任务与角色提取接续材料。只读,不写任何持久状态。
// 输出中文直出消息,不引入配置层或语言包契约。
import { dirname, join } from 'node:path';
import { anchorMap, makeFenceTracker, scanLinks } from './lib/md.mjs';
import { buildOutline, findChild, findSections, sectionBody, sectionText } from './lib/outline.mjs';
import { isDir, isFile, readText, relToRoot, resolveInRoot } from './lib/paths.mjs';
import {
  ROLES,
  STATE_SECTIONS,
  UNIT_SECTIONS,
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
  accept: { required: ['目标与验收', '当前设计', '执行结果'], optional: [] },
};

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
  const selected = new Set(sources.map((s) => `${s.absPath}#${s.title}`));
  const seen = new Set();
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
      if (!/\.md$/i.test(pathPart)) {
        issues.push({ file: src.relPath, reason: `必读只支持本地 Markdown 片段,源码等材料请用普通指针：${raw}` });
        return;
      }
      const absPath = resolveInRoot(root, base, decode(pathPart));
      if (absPath === null || !isFile(absPath)) {
        issues.push({ file: src.relPath, reason: `必读引用无法解析：${raw}` });
        return;
      }
      const rel = relToRoot(root, absPath);
      let resolved;
      if (anchor === null) {
        resolved = { body: readText(absPath).replace(/\s+$/, ''), title: null };
      } else {
        const outline = buildOutline(readText(absPath));
        const hits = anchorMap(outline.items).get(anchor) ?? [];
        if (hits.length === 0) {
          issues.push({ file: src.relPath, reason: `必读片段不存在：${rel}#${anchor}` });
          return;
        }
        if (hits.length > 1) {
          issues.push({ file: src.relPath, reason: `必读片段定位不唯一：${rel}#${anchor} 命中 ${hits.length} 处` });
          return;
        }
        resolved = { body: sectionText(outline, hits[0]), title: hits[0].title };
      }
      // 已在所选章节中完整出现的章节不再重复注入
      if (resolved.title !== null && selected.has(`${absPath}#${resolved.title}`)) return;
      // 同名标题的不同编号锚点是不同片段,去重按锚点而不是标题
      const key = `${absPath}#${anchor ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ source: src.relPath, target: raw, rel, body: resolved.body });
    });
  }
  return { items, issues };
}

export function runContext({ root, cwd, target, role, unit }) {
  if (role !== null && !ROLES.includes(role)) {
    return { code: 2, messages: [`未知角色：${role}。可用角色：${ROLES.join('|')}`] };
  }
  if (unit !== null && role !== 'implement') {
    return {
      code: 2,
      messages: [role === null ? '--unit 需要与 --role implement 一起使用' : `--unit 只用于 implement 角色,当前角色为 ${role}`],
    };
  }
  if (unit !== null && !UNIT_ID_RE.test(unit)) {
    return { code: 2, messages: [`单元编号格式应为 T1、T2 这类形式：${unit}`] };
  }
  if (role === 'implement' && unit === null) {
    return { code: 2, messages: ['implement 角色必须指定 --unit'] };
  }
  if (target === null) {
    return { code: 0, text: listTasks(root).text };
  }

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
  const stateSections = requireSections(task.state.outline, task.state.relPath, STATE_SECTIONS, 'state.md ', issues);
  const roleSpec = ROLE_DETAILS[role] ?? { required: [], optional: [] };
  const detailsSections = requireSections(task.details.outline, task.details.relPath, roleSpec.required, 'details.md ', issues);

  let unitItem = null;
  if (role === 'implement') {
    const hits = task.units.get(unit) ?? [];
    if (hits.length === 0) {
      issues.push({ file: task.details.relPath, reason: `details.md 缺少施工单元 ${unit}` });
    } else if (hits.length > 1) {
      issues.push({ file: task.details.relPath, reason: `施工单元 ${unit} 重复出现 ${hits.length} 次,定位不唯一` });
    } else {
      unitItem = hits[0];
      for (const title of UNIT_SECTIONS) {
        const found = findChild(task.details.outline, unitItem, 3, title);
        if (found.length === 0) {
          issues.push({ file: task.details.relPath, reason: `${unit} 缺少小标题“${title}”` });
        } else if (found.length > 1) {
          issues.push({ file: task.details.relPath, reason: `${unit} 的小标题“${title}”重复 ${found.length} 次` });
        } else if (isPlaceholder(sectionBody(task.details.outline, found[0]))) {
          issues.push({ file: task.details.relPath, reason: `${unit} 的“${title}”仍为待定或占位,不能作为施工材料` });
        }
      }
    }
    const design = h2(task.details.outline, '当前设计');
    if (design && isPlaceholder(sectionBody(task.details.outline, design))) {
      issues.push({ file: task.details.relPath, reason: '“当前设计”仍为待定或尚未形成,不能交付施工材料' });
    }
  }
  if (issues.length > 0) {
    return {
      code: 1,
      issues,
      messages: [`任务 ${relDir} 的材料不完整,未输出执行材料：`, ...issues.map((i) => `- ${i.file}  ${i.reason}`)],
    };
  }

  const sources = STATE_SECTIONS.map((title) => source('state', title, task.state, stateSections.get(title)));
  for (const title of roleSpec.required) {
    const item = detailsSections.get(title);
    if (item) sources.push(source('details', title, task.details, item));
  }
  for (const title of roleSpec.optional) {
    const hits = findSections(task.details.outline, 2, title);
    if (hits.length > 1) {
      return {
        code: 1,
        messages: [`details.md 章节“${title}”重复出现 ${hits.length} 次,定位不唯一,未输出执行材料。`],
      };
    }
    if (hits.length === 1) sources.push(source('details', title, task.details, hits[0]));
  }
  if (unitItem) sources.push(source('unit', unitItem.title, task.details, unitItem));

  // 无角色时只给 state.md 与阅读路径,不展开必读引用
  const reading = role === null ? { items: [], issues: [] } : collectReading(root, sources);
  if (reading.issues.length > 0) {
    return {
      code: 1,
      issues: reading.issues,
      messages: [`任务 ${relDir} 的必读引用有问题,未输出执行材料：`, ...reading.issues.map((i) => `- ${i.file}  ${i.reason}`)],
    };
  }

  const lines = ['# 接续材料', ''];
  lines.push(`任务：${task.name}`);
  lines.push(`来源目录：${task.relDir}`);
  lines.push(`角色：${role ?? 'state(仅状态)'}`);
  lines.push(`阶段：${task.stage ?? '未识别'}`);
  lines.push(`方案版本：${task.version ?? '无'}`);
  for (const src of sources) {
    lines.push('');
    lines.push('---');
    lines.push(`来源：${src.relPath} 的“${src.title}”`);
    lines.push('');
    lines.push(src.body);
  }
  if (reading.items.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('必读片段(仅一层,不递归展开):');
    for (const item of reading.items) {
      lines.push('');
      lines.push(`来源：${item.source} → ${item.target}`);
      lines.push('');
      lines.push(item.body);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('以上为文件原文摘录,用于定位与接续;结构完整不代表已获准执行。');
  return { code: 0, text: lines.join('\n'), sources, readings: reading.items };
}

function source(kind, title, doc, item) {
  return { kind, title, relPath: doc.relPath, absPath: doc.path, body: sectionText(doc.outline, item) };
}
