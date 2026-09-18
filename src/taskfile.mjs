// docs/tasks 任务文档：路径限定、frontmatter 解析、正文节扫描与文档加载。
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** 任务状态枚举。 */
export const STATUSES = ['planned', 'active', 'done', 'cancelled'];
/** 任务文档目录（相对项目根，posix 写法）。 */
export const TASKS_DIR = 'docs/tasks';
/** frontmatter 必填字段。 */
export const REQUIRED_KEYS = ['title', 'status', 'summary'];

/** 路径、格式或 IO 错误：调用方打印信息并退出 2。 */
export class TaskError extends Error {}

const DELIM_RE = /^---[ \t]*$/;
const KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;
const CURRENT_TITLE = '当前';

export const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
export const toPosix = (p) => p.split(sep).join('/');
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function realRoot(root) {
  try {
    return realpathSync(root);
  } catch (e) {
    throw new TaskError(`无法定位项目根目录 ${root}：${e.message}`);
  }
}

/** docs/tasks 的真实目录；docs 或 tasks 不存在时返回 null（空项目不是错误）。 */
export function resolveTasksDir(root = process.cwd()) {
  const rootReal = realRoot(root);
  let dir = rootReal;
  for (const part of TASKS_DIR.split('/')) {
    dir = join(dir, part);
    const rel = toPosix(relative(rootReal, dir));
    let st;
    try {
      st = lstatSync(dir);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw new TaskError(`无法访问 ${rel}：${e.message}`);
    }
    if (st.isSymbolicLink()) throw new TaskError(`${rel} 是符号链接，拒绝跟随`);
    if (!st.isDirectory()) throw new TaskError(`${rel} 不是目录`);
  }
  return dir;
}

/** 扫描 docs/tasks 下的 .md 常规文件（只平铺，不递归）；按 path 排序。 */
export function scanTaskFiles(root = process.cwd()) {
  const rootReal = realRoot(root);
  const dir = resolveTasksDir(rootReal);
  if (dir === null) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new TaskError(`无法读取目录 ${toPosix(relative(rootReal, dir))}：${e.message}`);
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith('.md')) continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new TaskError(`拒绝符号链接任务文件：${toPosix(relative(rootReal, full))}`);
    if (entry.isFile()) found.push(full);
  }
  return found.map((file) => ({ path: toPosix(relative(rootReal, file)), file })).sort(byPath);
}

/** 解码后的标量校验：非空且不含换行/制表符（保证索引仍是单行）。 */
function checkScalar(decoded, where, key) {
  if (decoded.trim() === '') throw new TaskError(`${where}：frontmatter 的 ${key} 不能为空`);
  if (/[\r\n\t]/.test(decoded)) throw new TaskError(`${where}：frontmatter 的 ${key} 不能含换行或制表符`);
  return decoded;
}

/** 单引号字符串：'' 表示一个单引号。 */
function decodeSingleQuoted(value, where, key) {
  let out = '';
  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "'") { out += ch; continue; }
    if (value[i + 1] === "'") { out += "'"; i++; continue; }
    if (i === value.length - 1) return out;
    throw new TaskError(`${where}：frontmatter 的 ${key} 引号后有多余内容`);
  }
  throw new TaskError(`${where}：frontmatter 的 ${key} 单引号未闭合`);
}

/** frontmatter 标量：普通标量或单/双引号字符串。 */
function parseScalar(raw, where, key) {
  const value = raw.trim();
  if (value === '') throw new TaskError(`${where}：frontmatter 的 ${key} 不能为空`);
  const first = value[0];
  if (first === '"') {
    let decoded;
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new TaskError(`${where}：frontmatter 的 ${key} 双引号未闭合或转义无效`);
    }
    if (typeof decoded !== 'string') throw new TaskError(`${where}：frontmatter 的 ${key} 需是字符串`);
    return checkScalar(decoded, where, key);
  }
  if (first === "'") return checkScalar(decodeSingleQuoted(value, where, key), where, key);
  if ('|>&*![]{}'.includes(first)) {
    throw new TaskError(`${where}：frontmatter 的 ${key} 只支持普通标量或引号字符串`);
  }
  if (value.includes('\t')) throw new TaskError(`${where}：frontmatter 的 ${key} 不能含制表符`);
  return value;
}

/** 扫描正文标题（围栏内的标题不算边界，H1/H2 都作为节边界）；行号为原文件 1-based 行号。 */
function scanHeadings(lines, from) {
  const headings = [];
  let open = null;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const ch = fence[1][1 - 1];
      const len = fence[1].length;
      if (open === null) open = { ch, len };
      else if (ch === open.ch && len >= open.len && fence[2].trim() === '') open = null;
      continue;
    }
    if (open !== null) continue;
    const h = HEADING_RE.exec(line);
    if (!h) continue;
    headings.push({ index: i, line: i + 1, level: h[1].length, text: h[2].replace(/[ \t]+#+[ \t]*$/, '').trim() });
  }
  return headings;
}

/**
 * 解析任务文档全文。where 用于报错定位（一般是相对路径）。
 * 返回 { title, status, summary, current, details }；## 当前 缺失或为空时报错。
 */
export function parseTaskText(text, where = '<text>') {
  const lines = stripBom(text).split(/\r?\n/);
  if (!DELIM_RE.test(lines[0] ?? '')) throw new TaskError(`${where}：缺少 frontmatter（首行应为 ---）`);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (DELIM_RE.test(lines[i])) { end = i; break; }
  }
  if (end === -1) throw new TaskError(`${where}：frontmatter 未闭合`);

  const data = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^[ \t]*#/.test(line)) continue;
    const m = KEY_RE.exec(line);
    if (!m) throw new TaskError(`${where}：frontmatter 第 ${i + 1} 行不是 key: value`);
    const key = m[1];
    if (key in data) throw new TaskError(`${where}：frontmatter 的 ${key} 重复出现`);
    data[key] = parseScalar(m[2] ?? '', `${where}（第 ${i + 1} 行）`, key);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) throw new TaskError(`${where}：frontmatter 缺必填字段 ${key}`);
  }
  if (!STATUSES.includes(data.status)) {
    throw new TaskError(`${where}：status 必须是 ${STATUSES.join('|')} 之一，当前为 ${data.status}`);
  }

  const headings = scanHeadings(lines, end + 1);
  const currents = headings.filter((h) => h.level === 2 && h.text === CURRENT_TITLE);
  if (currents.length > 1) {
    throw new TaskError(`${where}：正文有 ${currents.length} 个 ## 当前 节，应只有 1 个`);
  }
  const active = currents[0];
  if (!active) throw new TaskError(`${where}：缺 ## 当前 节`);
  const stop = headings.find((h) => h.index > active.index && h.level <= 2);
  const current = lines.slice(active.index + 1, stop ? stop.index : lines.length);
  while (current.length && current[0].trim() === '') current.shift();
  while (current.length && current[current.length - 1].trim() === '') current.pop();
  if (current.length === 0) throw new TaskError(`${where}：## 当前 节为空`);
  const details = headings.filter((h) => h.index < active.index || (stop !== undefined && h.index >= stop.index));
  return { title: data.title, status: data.status, summary: data.summary, current, details };
}

/** 加载一份任务文档（list 与 read 共用）。 */
export function loadTaskFile(file, path) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new TaskError(`无法读取 ${path}：${e.message}`);
  }
  return { path, raw: stripBom(raw), ...parseTaskText(raw, path) };
}

/** 加载全部任务文档；格式错误直接抛错，不静默跳过。 */
export function loadAllTasks(root = process.cwd()) {
  return scanTaskFiles(root).map((entry) => loadTaskFile(entry.file, entry.path));
}

/**
 * read 命令的路径解析：只接受本项目 docs/tasks 平铺集合内的 .md 常规文件；
 * 拒绝越界路径与路径链上的符号链接。
 */
export function resolveTaskArg(root, arg) {
  if (typeof arg !== 'string' || arg.trim() === '') throw new TaskError('缺少任务文件路径');
  const rootReal = realRoot(root);
  const target = isAbsolute(arg) ? resolve(arg) : resolve(rootReal, arg);
  const rel = toPosix(relative(rootReal, target));
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const relFold = fold(rel);
  if (relFold !== fold(TASKS_DIR) && !relFold.startsWith(`${fold(TASKS_DIR)}/`)) {
    throw new TaskError(`路径必须位于 ${TASKS_DIR} 内：${arg}`);
  }
  if (rel.split('/').length !== TASKS_DIR.split('/').length + 1) {
    throw new TaskError(`只接受 ${TASKS_DIR} 下的任务文件：${arg}`);
  }
  if (!rel.toLowerCase().endsWith('.md')) throw new TaskError(`只支持 .md 文件：${arg}`);
  for (let dir = target; ; dir = dirname(dir)) {
    let st = null;
    try {
      st = lstatSync(dir);
    } catch {
      st = null;
    }
    if (st && st.isSymbolicLink()) throw new TaskError(`拒绝符号链接路径：${arg}`);
    if (dir === rootReal || dirname(dir) === dir) break;
  }
  let st;
  try {
    st = statSync(target);
  } catch (e) {
    throw new TaskError(`无法读取 ${arg}：${e.message}`);
  }
  if (!st.isFile()) throw new TaskError(`不是普通文件：${arg}`);
  let real;
  try {
    real = realpathSync(target);
  } catch (e) {
    throw new TaskError(`无法读取 ${arg}：${e.message}`);
  }
  return { path: toPosix(relative(rootReal, real)), file: real };
}
