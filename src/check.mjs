// check:检查本地 Markdown 链接与片段、任务核心格式与状态引用。只读,默认不自动修复。
// 默认范围 docs,跳过 docs/history;显式指定 docs/history 时按历史材料检查。
// 只判定可明确判定的结构问题,不声称语义正确。
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { anchorMap, makeFenceTracker, scanLinks, scanRefDefinitions, splitLines } from './lib/md.mjs';
import { buildOutline, findChild, findSections, sectionBody, sectionText } from './lib/outline.mjs';
import { isDir, isFile, readText, relToRoot, resolveInRoot } from './lib/paths.mjs';
import { utf8Bytes } from './lib/volume.mjs';
import {
  DETAILS_REQUIRED_BY_STAGE,
  STAGES,
  STATE_SECTIONS,
  checkUnitFields,
  collectLegacyIssues,
  h2,
  isPlaceholder,
  listTaskDirs,
  loadTask,
  missingStateFields,
  parseProgressRows,
  requireSections,
} from './lib/taskdoc.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const EXTERNAL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HISTORY_REL = 'docs/history';
/** 需要可执行施工单元的阶段;探索与设计允许尚无单元。 */
const UNIT_STAGES = new Set(['施工', '待验收', '完成']);

/**
 * 体积提示阈值(UTF-8 字节)。只用于提醒整理,不是合法性限制,不改变退出码。
 */
const VOLUME_LIMITS = { state: 4096, field: 1024, details: 8192, unit: 16384 };
/** “当前”节按字段观察正文长度;方案版本与阻塞属说明字段,只提示不判错。 */
const STATE_FIELD_NAMES = ['目标', '阶段', '执行边界', '当前', '阻塞', '方案版本'];
/**
 * 字段行只认第 0 列起写的已知字段名:含冒号的正文(如 URL、续行)不会被吞成字段名,
 * 缩进行也不算字段开头。
 */
const FIELD_LINE_RE = new RegExp(`^(${STATE_FIELD_NAMES.join('|')})[：:]`);
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
  const ownAnchors = anchorMap(buildOutline(text).items);
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
      if (!anchorCache.has(abs)) anchorCache.set(abs, anchorMap(buildOutline(readText(abs)).items));
      if (!anchorCache.get(abs).has(anchor)) {
        issues.push({ ...at, reason: `链接目标 ${relToRoot(root, abs)} 没有片段 ${anchor}` });
      }
    }
  });
}

/** 单个任务的格式与引用检查。 */
function checkTask(root, absDir, issues, warnings) {
  const relDir = relToRoot(root, absDir);
  const missing = ['state.md', 'details.md'].filter((f) => !isFile(join(absDir, f)));
  if (missing.length > 0) {
    issues.push({ file: relDir, reason: `任务缺少核心文件：${missing.join('、')}` });
    return;
  }
  const task = loadTask(root, absDir, relDir);
  collectVolumeWarnings(task, warnings);
  // 检查项字段缺失直接报字段;阶段行存在但不合法才报枚举,避免同一缺失报两条
  const missingFields = missingStateFields(task.state, h2(task.state.outline, '当前'));
  for (const name of missingFields) {
    issues.push({ file: task.state.relPath, reason: `“当前”章节缺少检查项字段“${name}：”` });
  }
  if (task.stage === null && !missingFields.includes('阶段')) {
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
    // 现行材料阶段出现旧八项或全局“执行结果”时给迁移提示,并入同一问题列表
    collectLegacyIssues(task.details, [...task.units.values()].filter((h) => h.length === 1).map((h) => h[0]), issues);
    for (const [id, hits] of task.units) {
      if (hits.length > 1) continue; // 重复已在上文报告
      checkUnitFields(task.details, hits[0], issues, { label: id });
    }
  }

  const design = h2(task.details.outline, '当前设计');
  if (design && task.stage && UNIT_STAGES.has(task.stage)
    && isPlaceholder(sectionBody(task.details.outline, design))) {
    issues.push({ file: task.details.relPath, reason: '“当前设计”在施工或验收阶段仍为待定' });
  }
}

/**
 * 逐行切出“当前”章节的字段与正文:含冒号后的值与其后续续行,不按行数估算。
 * 字段只从第 0 列的已知字段名开始;围栏内不新开字段,但行仍计入所在字段的长度。
 */
function stateFieldValues(body) {
  const fields = [];
  const inFence = makeFenceTracker();
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const fenced = inFence(line);
    const m = fenced ? null : FIELD_LINE_RE.exec(line);
    if (m) {
      current = { name: m[1], lines: [line.slice(m[0].length)] };
      fields.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return fields.map((field) => {
    const lines = field.lines.slice();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return [field.name, lines.join('\n').replace(/^\s+/, '')];
  });
}

/**
 * 体积提示:正文过长的整理信号,单独成列,不影响 issues 与退出码。
 * 阈值判断只针对 tasksUnder 已选中的任务与既有章节,不扩大检查范围。
 */
function collectVolumeWarnings(task, warnings) {
  const stateBytes = utf8Bytes(task.state.text);
  if (stateBytes > VOLUME_LIMITS.state) {
    warnings.push({
      file: task.state.relPath,
      reason: `整体正文 ${stateBytes}B 超过 ${VOLUME_LIMITS.state}B,建议把细节移出 state,只留当前限制与索引`,
    });
  }
  const current = h2(task.state.outline, '当前');
  if (current) {
    for (const [name, value] of stateFieldValues(sectionBody(task.state.outline, current))) {
      const bytes = utf8Bytes(value);
      if (bytes > VOLUME_LIMITS.field) {
        warnings.push({
          file: task.state.relPath,
          reason: `“当前”字段“${name}：”正文 ${bytes}B 超过 ${VOLUME_LIMITS.field}B,建议压成一句结论或移到 details.md`,
        });
      }
    }
  }
  for (const title of ['共同约束', '当前设计']) {
    const hits = findSections(task.details.outline, 2, title);
    if (hits.length !== 1) continue;
    const bytes = utf8Bytes(sectionBody(task.details.outline, hits[0]));
    if (bytes > VOLUME_LIMITS.details) {
      warnings.push({
        file: task.details.relPath,
        reason: `“${title}”正文 ${bytes}B 超过 ${VOLUME_LIMITS.details}B,建议只留共同结论;单元专属实现移到对应 T 单元,避免形成第二套设计正文`,
      });
    }
  }
  // 体积提示按现行单元观察:共享章节、每个单元与其“当前结果”分开计
  for (const [id, hits] of task.units) {
    if (hits.length !== 1) continue;
    const unitBytes = utf8Bytes(sectionText(task.details.outline, hits[0]));
    if (unitBytes > VOLUME_LIMITS.unit) {
      warnings.push({
        file: task.details.relPath,
        reason: `单元 ${id} 正文 ${unitBytes}B 超过 ${VOLUME_LIMITS.unit}B,建议把过程证据移到 references,单元内只留结论与指针`,
      });
    }
    const resultSec = findChild(task.details.outline, hits[0], 3, '当前结果');
    if (resultSec.length === 1) {
      const bytes = utf8Bytes(sectionBody(task.details.outline, resultSec[0]));
      if (bytes > VOLUME_LIMITS.field) {
        warnings.push({
          file: task.details.relPath,
          reason: `单元 ${id} 的“当前结果”正文 ${bytes}B 超过 ${VOLUME_LIMITS.field}B,建议只留结论、适用版本与环境,详细证据落到 references`,
        });
      }
    }
  }
}

/** 体积提示渲染成一个独立段落:与结构、引用问题并列显示。 */
function volumeHintLines(warnings) {
  if (warnings.length === 0) return [];
  return [
    '',
    `体积提示 ${warnings.length} 处(UTF-8 字节,非 token;阈值是整理提醒,不是合法性限制)：`,
    ...warnings.map((w) => `- ${w.file}  ${w.reason}`),
  ];
}

/** 范围内可直接检查的任务目录:范围内出现 docs/tasks 布局即检查,不按范围字面量挑入口。 */
function tasksUnder(root, scopeAbs) {
  const tasksRoot = join(root, 'docs', 'tasks');
  if (relCovers(relToRoot(root, scopeAbs), 'docs/tasks')) {
    return listTaskDirs(tasksRoot).map((n) => join(tasksRoot, n));
  }
  // 范围不含 docs/tasks 时,检查范围自身或其直接子目录里的任务目录
  if (isFile(join(scopeAbs, 'state.md')) || isFile(join(scopeAbs, 'details.md'))) return [scopeAbs];
  const out = [];
  if (isDir(scopeAbs)) {
    for (const name of listTaskDirs(scopeAbs)) {
      if (isFile(join(scopeAbs, name, 'state.md')) || isFile(join(scopeAbs, name, 'details.md'))) {
        out.push(join(scopeAbs, name));
      }
    }
  }
  return out;
}

/** 范围路径是否覆盖给定目录(Windows 下大小写不敏感,分隔符归一为 /)。 */
function relCovers(scopeRel, dirRel) {
  const norm = (p) => p.split(/[\\/]+/).filter(Boolean).join('/').toLowerCase();
  const a = norm(scopeRel);
  const b = norm(dirRel);
  return a === b || a === '.' || b.startsWith(a + '/');
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
  const warnings = [];
  for (const dir of tasksUnder(root, scopeAbs)) checkTask(root, dir, issues, warnings);

  const lines = [];
  if (issues.length === 0) {
    lines.push(`通过：${scopeRel} 范围内 ${files.length} 个 Markdown 文件的本地引用与任务结构未发现问题(不判定语义正确)`);
  } else {
    lines.push(`发现问题 ${issues.length} 处(范围：${scopeRel})：`, '');
    for (const issue of issues) {
      const at = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      lines.push(`- ${at}  ${issue.reason}`);
    }
  }
  lines.push(...volumeHintLines(warnings));
  return { code: issues.length === 0 ? 0 : 1, text: lines.join('\n'), issues, warnings };
}
