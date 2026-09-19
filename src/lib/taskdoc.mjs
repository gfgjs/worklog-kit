// 任务文件解析:state.md / details.md 的必需章节、阶段与施工单元定位。
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildOutline, findSections, sectionBody, sectionText } from './outline.mjs';
import { makeFenceTracker, splitLines } from './md.mjs';
import { isDir, isFile, readText, resolveInRoot } from './paths.mjs';

export const STAGES = ['探索', '设计', '施工', '待验收', '完成', '已取消'];
export const STATE_SECTIONS = ['当前', '进度', '下一步与阅读'];
/** “当前”节的检查项字段;缺失判错。方案版本与阻塞属说明字段,缺失不判错。 */
export const STATE_FIELDS = ['目标', '阶段', '执行边界', '当前'];
export const UNIT_SECTIONS = [
  '目标与验收',
  '依赖与前提',
  '必读材料',
  '修改范围',
  '实现路径',
  '最低验证',
  '回交条件',
  '回传要求',
];
export const ROLES = ['explore', 'design', 'implement', 'accept'];

/**
 * 阶段 → 该阶段 details.md 必需的二级章节。
 * 按实际所需内容要求:“发现与经验”只在确有内容时维护,不强制空节。
 */
export const DETAILS_REQUIRED_BY_STAGE = {
  探索: ['目标与验收'],
  设计: ['目标与验收', '探索结果', '共同约束', '当前设计'],
  施工: ['目标与验收', '当前设计', '执行结果'],
  待验收: ['目标与验收', '当前设计', '执行结果'],
  完成: ['目标与验收', '当前设计', '执行结果'],
  已取消: ['目标与验收'],
};

const UNIT_RE = /^T(\d+)(?:\s|$)/;
const STAGE_RE = /^阶段[：:]\s*(\S+)\s*$/m;
const VERSION_RE = /方案版本[：:]\s*(\S+)/;
/**
 * 占位判定:只看该项正文首行是否以占位词或尖括号占位开头。
 * “待决定：无”不是待定;正文后面出现的“待定”字样也不影响判定。
 */
const PLACEHOLDER_RE = /^(待定|待补|待补全|待填写|待明确|TBD|TODO|占位|未定|尚未形成|尚未确定|尚未设计|……|\.\.\.|<[^>\n]*>)\s*[：:。．，,、]?\s*$/i;

export function isPlaceholder(body) {
  const first = body.trim().split(/\r?\n/)[0]?.trim() ?? '';
  if (first === '') return true;
  return PLACEHOLDER_RE.test(first);
}

/** 读取单份核心文件并建立章节索引。 */
function readCore(absPath, relPath) {
  const text = readText(absPath);
  const outline = buildOutline(text);
  const h1 = outline.items.find((h) => h.level === 1);
  return { path: absPath, relPath, text, outline, title: h1 ? h1.title : null };
}

/** 二级章节索引:标题 → 命中项数组(用于重复定位判定)。 */
function h2Map(outline) {
  const map = new Map();
  for (const item of outline.items) {
    if (item.level !== 2) continue;
    if (!map.has(item.title)) map.set(item.title, []);
    map.get(item.title).push(item);
  }
  return map;
}

export function h2(outline, title) {
  const hits = findSections(outline, 2, title);
  return hits.length === 1 ? hits[0] : null;
}

/** 必需章节检查:缺失与重复都记为问题,并返回可用的唯一章节。 */
export function requireSections(outline, relPath, titles, label, issues) {
  const map = h2Map(outline);
  const found = new Map();
  for (const title of titles) {
    const hits = map.get(title) ?? [];
    if (hits.length === 0) {
      issues.push({ file: relPath, reason: `${label}缺少必需章节“${title}”` });
    } else if (hits.length > 1) {
      issues.push({
        file: relPath,
        reason: `${label}章节“${title}”重复出现 ${hits.length} 次,定位不唯一`,
      });
    } else {
      found.set(title, hits[0]);
    }
  }
  return found;
}

/** 剥除围栏内的行,围栏里的示例字段行不参与读取。 */
export function stripFences(body) {
  const inFence = makeFenceTracker();
  return splitLines(body).filter((line) => !inFence(line)).join('\n');
}

/** 从 state.md 的“当前”章节正文读阶段(围栏内与其它章节的假“阶段：”不参与)。 */
export function readStage(state, currentSection) {
  if (!currentSection) return null;
  const m = STAGE_RE.exec(stripFences(sectionBody(state.outline, currentSection)));
  if (!m) return null;
  const stage = m[1].replace(/[。.]$/, '');
  return STAGES.includes(stage) ? stage : null;
}

/** “当前”节缺失的检查项字段列表。 */
export function missingStateFields(state, currentSection) {
  if (!currentSection) return [];
  const body = stripFences(sectionBody(state.outline, currentSection));
  return STATE_FIELDS.filter((name) => !new RegExp(`^${name}[：:]\\s*\\S`, 'm').test(body));
}

export function readDesignVersion(details, designSection) {
  const m = VERSION_RE.exec(stripFences(sectionText(details.outline, designSection)));
  return m ? m[1] : null;
}

/** 解析 state.md 的进度表,取出 T 编号行(表头与分隔行自然落空)。 */
export function parseProgressRows(body) {
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((s) => s.trim());
    const m = UNIT_RE.exec(cells[0] ?? '');
    if (!m) continue;
    rows.push({ id: `T${m[1]}`, title: (cells[0] ?? '').trim(), status: cells[1] ?? '', note: cells[2] ?? '' });
  }
  return rows;
}

/** details.md 中的施工单元:二级标题且以 T 编号开头。 */
export function parseUnits(details) {
  const units = new Map();
  for (const item of details.outline.items) {
    if (item.level !== 2) continue;
    const m = UNIT_RE.exec(item.title);
    if (!m) continue;
    const id = `T${m[1]}`;
    if (!units.has(id)) units.set(id, []);
    units.get(id).push(item);
  }
  return units;
}

/**
 * 读取任务的两份核心文件。只做解析与阶段读取,章节是否齐备由调用方按角色或阶段判定。
 */
export function loadTask(root, absDir, relDir) {
  const state = readCore(join(absDir, 'state.md'), `${relDir}/state.md`);
  const details = readCore(join(absDir, 'details.md'), `${relDir}/details.md`);
  const stage = readStage(state, h2(state.outline, '当前'));
  const designSection = h2(details.outline, '当前设计');
  return {
    root,
    absDir,
    relDir,
    name: relDir.split('/').pop(),
    state,
    details,
    stage,
    designSection,
    version: designSection ? readDesignVersion(details, designSection) : null,
    units: parseUnits(details),
  };
}

/** 只读 state.md 的轻量读取:任务列表用,details.md 缺失不影响其它任务的列举。 */
export function loadTaskMeta(root, absDir, relDir) {
  const statePath = join(absDir, 'state.md');
  if (!isFile(statePath)) return { name: relDir.split('/').pop(), relDir, stage: null, note: '缺少 state.md' };
  const state = readCore(statePath, `${relDir}/state.md`);
  const stage = readStage(state, h2(state.outline, '当前'));
  return {
    name: relDir.split('/').pop(),
    relDir,
    stage,
    note: stage === null ? '阶段未识别' : null,
  };
}

/**
 * 定位任务目录:先按显式路径(仓根内),再按 docs/tasks 下的任务名。
 * 显式路径只要存在即接受,缺核心文件由调用方报缺项;任务名必须命中 docs/tasks 下带 state.md 的目录。
 * @param {string} root 仓根
 * @param {string} base 相对路径的解析起点(通常是 cwd)
 * @param {string} target 任务目录或任务名
 */
export function resolveTaskDir(root, base, target) {
  const direct = resolveInRoot(root, base, target);
  if (direct && isDir(direct)) return direct;
  if (!target.includes('/') && !target.includes('\\')) {
    const named = resolveInRoot(root, join(root, 'docs', 'tasks'), target);
    if (named && isDir(named) && isFile(join(named, 'state.md'))) return named;
  }
  return null;
}

/** 列出 docs/tasks 下的任务目录(按名称排序)。 */
export function listTaskDirs(tasksDir) {
  if (!isDir(tasksDir)) return [];
  return readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
