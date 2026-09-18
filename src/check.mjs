// check:检查本地 Markdown 链接与片段、任务核心格式与状态引用。只读,默认不自动修复。
// 默认范围 docs,跳过 docs/history;显式指定 docs/history 时按历史材料检查。
// 只判定可明确判定的结构问题,不声称语义正确。
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { anchorSet, makeFenceTracker, scanLinks, scanRefDefinitions, splitLines } from './lib/md.mjs';
import { buildOutline, findChild, sectionBody, sectionText } from './lib/outline.mjs';
import { isDir, isFile, readText, relToRoot, resolveInRoot } from './lib/paths.mjs';
import {
  DETAILS_REQUIRED_BY_STAGE,
  STAGES,
  STATE_SECTIONS,
  UNIT_SECTIONS,
  h2,
  isPlaceholder,
  listTaskDirs,
  loadTask,
  parseProgressRows,
  requireSections,
} from './lib/taskdoc.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const EXTERNAL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HISTORY_REL = 'docs/history';
/** 需要可执行施工单元的阶段;探索与设计允许尚无单元。 */
const UNIT_STAGES = new Set(['施工', '待验收', '完成']);
/** 单元内这些字段必须写实,不能停在占位。 */
const UNIT_KEY_FIELDS = new Set(['目标与验收', '实现路径', '最低验证']);

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 收集范围内的 Markdown 文件;默认跳过 docs/history。 */
function collectMarkdown(root, scopeAbs, includeHistory) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relToRoot(root, abs);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (!includeHistory && (rel === HISTORY_REL || rel.startsWith(HISTORY_REL + '/'))) continue;
        walk(abs);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        out.push(abs);
      }
    }
  };
  if (isDir(scopeAbs)) walk(scopeAbs);
  else if (isFile(scopeAbs)) out.push(scopeAbs);
  return out.sort();
}

/** 单份 Markdown 的本地链接与片段检查。 */
function checkFile(root, absFile, issues) {
  const rel = relToRoot(root, absFile);
  const text = readText(absFile);
  const ownAnchors = anchorSet(buildOutline(text).items);
  const refDefs = scanRefDefinitions(text);
  const anchorCache = new Map();
  const inFence = makeFenceTracker();
  splitLines(text).forEach((line, i) => {
    if (inFence(line)) return;
    for (const link of scanLinks(line)) {
      const at = { file: rel, line: i + 1 };
      // 模板骨架里的 <...> 占位不是真实链接
      if (link.placeholder) continue;
      let target = link.target;
      if (link.kind === 'ref') {
        const defined = refDefs.get(link.label);
        if (defined === undefined) {
          issues.push({ ...at, reason: `引用式链接缺少定义：[${link.label}]` });
          continue;
        }
        target = defined;
      }
      target = target.trim();
      if (target === '') {
        issues.push({ ...at, reason: '链接目标为空' });
        continue;
      }
      if (EXTERNAL_RE.test(target) || target.startsWith('//')) continue;
      const hashAt = target.indexOf('#');
      const pathPart = decode(hashAt === -1 ? target : target.slice(0, hashAt));
      const anchor = hashAt === -1 ? null : decode(target.slice(hashAt + 1)).toLowerCase();
      if (pathPart === '') {
        if (anchor && !ownAnchors.has(anchor)) issues.push({ ...at, reason: `本文没有片段 ${anchor}` });
        continue;
      }
      const abs = resolveInRoot(root, dirname(absFile), pathPart);
      if (abs === null) {
        issues.push({ ...at, reason: `链接目标越出仓根：${target}` });
        continue;
      }
      if (!existsSync(abs)) {
        issues.push({ ...at, reason: `链接目标不存在：${target}` });
        continue;
      }
      if (!anchor || !isFile(abs) || !/\.md$/i.test(abs)) continue;
      if (!anchorCache.has(abs)) anchorCache.set(abs, anchorSet(buildOutline(readText(abs)).items));
      if (!anchorCache.get(abs).has(anchor)) {
        issues.push({ ...at, reason: `链接目标 ${relToRoot(root, abs)} 没有片段 ${anchor}` });
      }
    }
  });
}

/** 单个任务的格式与引用检查。 */
function checkTask(root, absDir, issues) {
  const relDir = relToRoot(root, absDir);
  const missing = ['state.md', 'details.md'].filter((f) => !isFile(join(absDir, f)));
  if (missing.length > 0) {
    issues.push({ file: relDir, reason: `任务缺少核心文件：${missing.join('、')}` });
    return;
  }
  const task = loadTask(root, absDir, relDir);
  if (task.stage === null) {
    issues.push({ file: task.state.relPath, reason: `“当前”章节缺少合法阶段,可用：${STAGES.join('|')}` });
  }
  const stateSections = requireSections(task.state.outline, task.state.relPath, STATE_SECTIONS, 'state.md ', issues);
  requireSections(task.details.outline, task.details.relPath, DETAILS_REQUIRED_BY_STAGE[task.stage] ?? [], 'details.md ', issues);

  // state.md 进度表列出的单元必须能在 details.md 定位,不能只看某个链接存在
  const progress = stateSections.has('进度')
    ? parseProgressRows(sectionText(task.state.outline, stateSections.get('进度')))
    : [];
  const needsUnits = task.stage !== null && UNIT_STAGES.has(task.stage);
  if (needsUnits && progress.length === 0) {
    issues.push({ file: task.state.relPath, reason: '“进度”表没有列出任何施工单元' });
  }
  for (const row of progress) {
    const hits = task.units.get(row.id) ?? [];
    if (hits.length === 0) {
      issues.push({ file: task.state.relPath, reason: `进度表的 ${row.id} 在 details.md 找不到对应单元` });
    } else if (hits.length > 1) {
      issues.push({ file: task.details.relPath, reason: `施工单元 ${row.id} 重复出现 ${hits.length} 次,定位不唯一` });
    }
  }

  // 只有在需要可执行单元的阶段才要求单元结构完整
  if (needsUnits) {
    for (const [id, hits] of task.units) {
      if (hits.length > 1) continue; // 重复已在上文报告
      for (const title of UNIT_SECTIONS) {
        const found = findChild(task.details.outline, hits[0], 3, title);
        if (found.length === 0) {
          issues.push({ file: task.details.relPath, reason: `${id} 缺少小标题“${title}”` });
        } else if (found.length > 1) {
          issues.push({ file: task.details.relPath, reason: `${id} 的小标题“${title}”重复 ${found.length} 次` });
        } else if (UNIT_KEY_FIELDS.has(title) && isPlaceholder(sectionBody(task.details.outline, found[0]))) {
          issues.push({ file: task.details.relPath, reason: `${id} 的“${title}”仍为待定或占位` });
        }
      }
    }
  }

  const design = h2(task.details.outline, '当前设计');
  if (design && task.stage && UNIT_STAGES.has(task.stage)
    && isPlaceholder(sectionBody(task.details.outline, design))) {
    issues.push({ file: task.details.relPath, reason: '“当前设计”在施工或验收阶段仍为待定' });
  }
}

/** 范围内可直接检查的任务目录。 */
function tasksUnder(root, scopeAbs) {
  const rel = relToRoot(root, scopeAbs);
  const tasksRoot = join(root, 'docs', 'tasks');
  if (rel === 'docs/tasks' || rel === 'docs') {
    return listTaskDirs(tasksRoot).map((n) => join(tasksRoot, n));
  }
  if (isFile(join(scopeAbs, 'state.md'))) return [scopeAbs];
  return [];
}

export function runCheck({ root, cwd, scope }) {
  const scopeAbs = resolveInRoot(root, cwd, scope);
  if (scopeAbs === null || !existsSync(scopeAbs)) {
    return { code: 2, messages: [`检查范围不存在或越出仓根：${scope}`] };
  }
  const scopeRel = relToRoot(root, scopeAbs);
  const includeHistory = scopeRel === HISTORY_REL || scopeRel.startsWith(HISTORY_REL + '/');
  const files = collectMarkdown(root, scopeAbs, includeHistory);
  const issues = [];
  for (const file of files) checkFile(root, file, issues);
  for (const dir of tasksUnder(root, scopeAbs)) checkTask(root, dir, issues);

  if (issues.length === 0) {
    return { code: 0, text: `通过：${scopeRel} 范围内 ${files.length} 个 Markdown 文件的本地引用与任务结构未发现问题(不判定语义正确)`, issues };
  }
  const lines = [`发现问题 ${issues.length} 处(范围：${scopeRel})：`, ''];
  for (const issue of issues) {
    const at = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    lines.push(`- ${at}  ${issue.reason}`);
  }
  return { code: 1, text: lines.join('\n'), issues };
}
