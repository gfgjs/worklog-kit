// upgrade:按 schemaVersion 逐级迁移消费仓的配置与数据布局。
//
// 为什么它必须与 schema bump **同批**交付(R5-C3):升版是一道门,迁移命令是梯子。
// 只上门不给梯子,存量仓就会看见一个自己够不着的新契约——F-001 已经踩过一次
//(线引用门先于迁移命令),此处不得重演。
//
// 设计要点:
// - **registry 逐级走**,不做 v1→v3 的跳跃迁移:每一级只需知道相邻两版的差,
//   n 个版本要写 n-1 个迁移而不是 n²/2 个。
// - 迁移**产出变更集**(FileChange[])而非直接写盘:同一份变更集既可 --dry-run 打印,
//   也可 apply 落盘——预览与执行走同一条代码路径,不会「预览说的是一套、真跑是另一套」。
// - apply **先备份、原子写、写后复验**;复验不过则整体回滚。
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, rmSync, rmdirSync, mkdtempSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CONFIG_NAME, LATEST_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS,
  BUILTIN_AUTHORITATIVE, DEFAULTS, parseJsonc, loadConfig, indexHeadings,
} from './lib/config.mjs';
import { parseFrontmatter, parseTables, escapeRe as escRe, makeFenceSkipper } from './lib/frontmatter.mjs';
import { deriveId, isValidId, insertIdLine, LINES_DIR, collectGraphDocs, collectIds } from './lib/docmeta.mjs';
import { slugify, letterTail } from './lib/slug.mjs';
import { applyEdits } from './lib/jsoncedit.mjs';
import { classifyTemplates, buildManifest, readManifest, hashContent, MANIFEST_REL } from './lib/templates.mjs';
import { todayLocal } from './lib/dates.mjs';

/** @typedef {{path: string, content: string, desc: string, lossy?: boolean}} FileChange */
/** @typedef {{from: number, to: number, title: string, plan: (ctx: {root: string, raw: object, text?: string}) => {changes: FileChange[], notes: string[], raw: object, text?: string}}} Migration */

/**
 * 配置变更的双通道产出(F-005):外科编辑(jsoncedit)保注释;产物必须与语义计算出的
 * `next` **解析全等**,不过(或没有原文可编辑)即回落 JSON.stringify——丢注释但恒正确,
 * 并标记 `lossy`,丢注释警告只在真丢时打(见 main)。等价断言用 JSON.stringify 比对:
 * 迁移只做原位改值与尾插,键序不动,故序列化文本可比;罕见形态(如重复键,JSON 后者
 * 胜出而文本手术改的是前者)会在此处失配,安全落入兜底。
 */
function configChange(text, next, edits, desc) {
  if (typeof text === 'string') {
    try {
      const candidate = applyEdits(text, edits);
      if (JSON.stringify(parseJsonc(candidate)) === JSON.stringify(next)) {
        return { path: CONFIG_NAME, content: candidate, desc, lossy: false };
      }
    } catch { /* 落入兜底 */ }
  }
  return { path: CONFIG_NAME, content: `${JSON.stringify(next, null, 2)}\n`, desc: `${desc}(注释未能保全,已整体重写)`, lossy: true };
}

/** v1 → v2:types 由字符串数组改为对象数组(带 canBeAuthoritative 槽位) */
function migrateV1toV2({ root, raw, text }) {
  const notes = [];
  const next = { ...raw, schemaVersion: 2 };
  if (Array.isArray(raw.types)) {
    const unknown = [];
    next.types = raw.types.map((x) => {
      if (typeof x !== 'string') return x; // 已是 v2 形态,原样带过
      const known = BUILTIN_AUTHORITATIVE[x];
      if (known === undefined) unknown.push(x);
      return { name: x, canBeAuthoritative: known ?? false };
    });
    if (unknown.length) {
      // 不认识的 type 一律 false,并**明说**:保守方向是可修的(改配置),
      // 反过来(默认给权威资格)是个安静的错误,用户不会知道要去改。
      notes.push(`以下 type 不在内置表中,canBeAuthoritative 保守置为 false,请按你的项目实情复核:${unknown.join(', ')}`);
    }
  }
  // $schema 指到新版,否则编辑器会拿 v1 的尺子量 v2 的配置。
  // 也认无版本号的历史名 `worklogrc.schema.json`(v1 时期的文件名,现已改名为 v1)——
  // 不认的话,老仓升完 v2 会留下一个指向**已不存在文件**的 $schema。
  if (typeof next.$schema === 'string') {
    next.$schema = next.$schema.replace(/worklogrc(\.v\d+)?\.schema\.json$/, 'worklogrc.v2.schema.json');
  }
  const edits = [{ path: ['schemaVersion'], value: 2 }];
  if (Array.isArray(raw.types)) {
    raw.types.forEach((x, i) => { if (typeof x === 'string') edits.push({ path: ['types', i], value: next.types[i] }); });
  }
  if (typeof next.$schema === 'string') edits.push({ path: ['$schema'], value: next.$schema });
  const change = configChange(text, next, edits, 'schemaVersion 1 → 2;types 转为 {name, canBeAuthoritative} 对象数组');
  return { changes: [change], notes, raw: next, text: change.content };
}

/**
 * v2 → v3:`id` 转必填。**配置形状不变**,变的是文档 frontmatter 的数据布局。
 * 本函数只管配置升版;文档播种交给**对账步骤**(RECONCILERS[3]),理由见 planUpgrade。
 */
function migrateV2toV3({ raw, text }) {
  const next = { ...raw, schemaVersion: 3 };
  if (typeof next.$schema === 'string') {
    next.$schema = next.$schema.replace(/worklogrc(\.v\d+)?\.schema\.json$/, 'worklogrc.v3.schema.json');
  }
  const edits = [{ path: ['schemaVersion'], value: 3 }];
  if (typeof next.$schema === 'string') edits.push({ path: ['$schema'], value: next.$schema });
  const change = configChange(text, next, edits, 'schemaVersion 2 → 3(配置形状不变;门槛变在文档 frontmatter)');
  return {
    changes: [change],
    notes: ['v3 起文档 frontmatter 的 `id` 必填;缺 id 的文档由下面的对账步骤自动播种'],
    raw: next,
    text: change.content,
  };
}

/**
 * v3 → v4:`line` 由自由文本收紧为 `lines/<slug>.md` 实体引用。配置形状仍不变;
 * 实体播种与 README 职责表补行交给对账步骤(RECONCILERS[4])。
 * 实例层顺手补 type `line` 与 dirs `lines`(D-003:加实例条目本身不触发升版,但
 * 引用门要用它们——实体文档的 type、索引门三方一致的 config 腿,缺了门自己造红)。
 */
function migrateV3toV4({ raw, text }) {
  const notes = [];
  const next = { ...raw, schemaVersion: 4 };
  const edits = [{ path: ['schemaVersion'], value: 4 }];
  if (typeof next.$schema === 'string') {
    next.$schema = next.$schema.replace(/worklogrc(\.v\d+)?\.schema\.json$/, 'worklogrc.v4.schema.json');
    edits.push({ path: ['$schema'], value: next.$schema });
  }
  if (Array.isArray(next.types) && !next.types.some((x) => (typeof x === 'string' ? x : x?.name) === 'line')) {
    next.types = [...next.types, { name: 'line', canBeAuthoritative: false }];
    edits.push({ op: 'append', path: ['types'], value: { name: 'line', canBeAuthoritative: false } });
    notes.push('types 已补 `line`(线实体的 type;线不是自己的权威文档,canBeAuthoritative=false)');
  }
  if (Array.isArray(next.dirs) && !next.dirs.includes(LINES_DIR)) {
    next.dirs = [...next.dirs, LINES_DIR];
    edits.push({ op: 'append', path: ['dirs'], value: LINES_DIR });
    notes.push(`dirs 已补 \`${LINES_DIR}\`(索引门三方一致的 config 腿;README 职责表行由对账步骤补)`);
  }
  const change = configChange(text, next, edits, 'schemaVersion 3 → 4(v4 起 line 须引用 lines/<slug>.md 实体;实体由对账播种)');
  return { changes: [change], notes, raw: next, text: change.content };
}

/**
 * v4 → v5:`index` 对象新增 `mode`(索引形态档)/`outDir`(生成物目录)两个可选键。
 * 缺省 mode=invariant,**存量仓行为一个字节不变**——本迁移只推版本号与 $schema 指向;
 * 两个新键留给用户显式声明(改档是数据布局迁移,由对账步骤按 mode 兑现,R3-3)。
 */
function migrateV4toV5({ raw, text }) {
  const next = { ...raw, schemaVersion: 5 };
  const edits = [{ path: ['schemaVersion'], value: 5 }];
  if (typeof next.$schema === 'string') {
    next.$schema = next.$schema.replace(/worklogrc(\.v\d+)?\.schema\.json$/, 'worklogrc.v5.schema.json');
    edits.push({ path: ['$schema'], value: next.$schema });
  }
  const change = configChange(text, next, edits, 'schemaVersion 4 → 5(index 新增可选 mode/outDir;缺省 invariant,行为不变)');
  return {
    changes: [change],
    notes: ['v5 起可声明 `index.mode: "generated"` 启用生成式索引(改档后重跑 upgrade 完成数据布局迁移)'],
    raw: next,
    text: change.content,
  };
}

/**
 * 数据布局对账之一(v3 起):为缺 `id` 的受检文档播种。**幂等**——已有 id 的一律不碰。
 *
 * 为什么它不写在 migrateV2toV3 里面(施工时实测踩出来的洞):存量仓跑 `worklog-kit init`
 * 会直接 stamp 出**最新版**配置 + 一堆没有 id 的既存文档。此时它的 schemaVersion 已经是
 * 最新,`upgrade` 若只做「推进版本号」就会答「已是最新版」直接退出——**播种代码永远不会
 * 执行,那些文档永远拿不到梯子**,正是 F-001 的原罪「只上门不给梯子」。
 * 故 upgrade 的语义须是「让**数据布局**与所声明的 schemaVersion 相符」,不是「改那个数字」。
 * 版本号对了不代表数据到位;把对账独立出来,它便天然幂等、可反复重跑。
 */
function seedDocIds({ root }, graph) {
  const notes = [];
  const changes = [];
  // F-014(阶段 3 兑现):占号集合的唯一来源 = 共享图扫描。此前「归档件 if-id 占号」
  // 在这里手写第二遍(D-020 缝隙的补丁)——与 check 的唯一性门是同一语义的两份实现,
  // 正是阶段 1 Review 认定的缺陷母题。现在两边读同一个函数,世界观不可能再分家。
  const taken = new Set(collectIds(graph).keys());
  const pending = [];
  const unseedable = [];
  for (const g of graph) {
    if (g.graph !== true) continue; // 归档件只占号,不播种(§7.2 source universe)
    if (g.data.id) continue; // 已有 id:冻结,绝不重算
    // `id` 归 upgrade 这把梯子,前提是**机器派生得出来**——而派生依赖 created。
    // 缺 created 就意味着这一篇的 id 恰恰不可派生,按两把梯子的判据它已不属 upgrade 的射程。
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.data.created ?? '')) { unseedable.push(g.rel); continue; }
    pending.push({ rel: g.rel, created: g.data.created, raw: readFileSync(g.abs, 'utf8') });
  }
  if (unseedable.length) {
    // **整体拒绝、零写入**,不做「能播的播、播不了的留着」——半播种的仓里,
    // 一部分文档有号、一部分没有,而没有人知道该给剩下的发什么号。
    return {
      changes: [], notes, taken,
      error: `以下文档缺 created,id 无从派生(共 ${unseedable.length} 篇):${unseedable.join(';')}\n  两条出路,择一后重跑:①补上 created;②直接手填 id(对账只负责机器推得出的部分,推不出的须由你供给)`,
    };
  }
  const failed = [];
  for (const d of pending) {
    const r = deriveId({ rel: d.rel, created: d.created }, (id) => taken.has(id));
    if (!r.ok) { failed.push(`${d.rel}(拟用 ${r.id})`); continue; }
    taken.add(r.id);
    const content = insertIdLine(d.raw, r.id);
    if (content === null) { failed.push(`${d.rel}(frontmatter 形态异常,插入失败)`); continue; }
    changes.push({ path: d.rel, content, desc: `补 id: ${r.id}${r.note ? `(${r.note})` : ''}` });
  }
  if (failed.length) {
    return { changes: [], notes, taken, error: `以下文档的 id 撞号后仍无法消歧,请先手工改名或手填 id:${failed.join(';')}` };
  }
  if (changes.length) notes.push(`已为 ${changes.length} 篇文档播种 id;**播种只此一次**,之后该值冻结在文件里,改名也不再变`);
  // taken 交给同批的线实体播种共用:实体也要发 id,两处各建占号集合就会互相撞号
  //(阶段 1 的 D-020 缝隙正是「两处各自维护世界观」——不再重演)。
  return { changes, notes, taken };
}

/** 内容从 docsDir 根(README.md/todo.md)搬进其子目录下一文件(lines/<slug>.md、
 *  status/<slug>.md)时,原按根解析的相对链接统一补 `../` 抵消深一级(带 ../ 的同理
 *  成立,各深一级)。scheme(https:/repo: 等)、绝对路径、纯锚点不参与相对解析,原样保留。
 *  两处搬迁复用同一变换:登记表「权威文档」格 → lines/;todo 分节正文 → status/。 */
const rebaseOneLevelDeeper = (text) => {
  // 逐行 + 跳围栏(F-001):围栏内的 `](...)` 是示例链接,rebase 会给它凭空加 `../`,
  // 迁档后示例就指错。B8 makeFenceSkipper 此前只收节界扫描,此正文变换仍 fence-blind。
  // split 保留行尾,join('') 逐字节还原;单格 authDoc(无换行)行为与旧实现一致。
  const skip = makeFenceSkipper();
  return text.split(/(?<=\n)/).map((line) => (skip(line)
    ? line
    : line.replace(/\]\(([^)]+)\)/g, (m, target) =>
      (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(target) ? m : `](../${target})`)))).join('');
};

/** 线实体占位内容(§4.1 item2 ①:语义已在 slug 里,人工只复核、补一句话使命)。
 *  extras = 自字母登记表归并来的人工判断行(立项/权威文档,§4.1 item2 ④ ②类) */
const lineEntityContent = (slug, id, created, extras = []) => `---
id: ${id}
status: active
type: line
line: ${slug}
created: ${created}
---

# ${slug}

(占位实体,由 \`worklog-kit upgrade\` 从存量 \`line\` 值播种。请复核并补一句话使命,可选 owner。)
${extras.length ? `\n${extras.join('\n')}\n` : ''}`;

/**
 * v4 数据布局对账之二:为存量 `line` 值播种 `lines/<slug>.md` 占位实体。**幂等**。
 *
 * 与 id 播种同批(F-001:引用门与迁移命令不得拆):引用门上线之日,存量仓的全部
 * line 值同日变违规,且 `lineUnresolved` 按两把梯子的判据走 upgrade(实体可机械派生)、
 * 不入 baseline 允许清单——不给这把梯子,存量仓就没有任何出路。
 *
 * 派生不出 slug 的值(全非法字符)**跳过并注记**而非整体拒绝:与缺 created 不同,
 * 一个坏值不影响其他实体的命名空间,而该文档的 `lineBadSlug` 本就是 baseline 可立账的
 * 人判债——拒绝整场只会把「能自动修的」也扣成人质。
 */
function seedLineEntities({ root, raw }, graph, taken, registry, today) {
  const notes = [];
  const config = { ...DEFAULTS, ...raw };
  const linesAbs = join(root, config.docsDir, LINES_DIR);
  const existing = new Set(
    existsSync(linesAbs)
      ? readdirSync(linesAbs).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3).normalize('NFC'))
      : [],
  );
  // refs = 失配报告(③)的原料:引用到的 slug 全集、slug 是否带过字母尾、字母 → 原值。
  // 域 = graph 里的活区文档(F-014 共享扫描):归档件的 line 是历史事实,不触发播种。
  const refs = { slugs: new Set(), slugHadTail: new Map(), tails: new Map() };
  const wanted = new Set();
  const badSlug = [];
  for (const g of graph) {
    if (g.graph !== true || !g.data.line) continue;
    const slug = slugify(g.data.line);
    if (!slug) { badSlug.push(`${g.rel}(line: ${g.data.line})`); continue; }
    const tail = letterTail(g.data.line);
    refs.slugs.add(slug);
    refs.slugHadTail.set(slug, (refs.slugHadTail.get(slug) || false) || !!tail);
    if (tail) { const s = refs.tails.get(tail) ?? new Set(); s.add(g.data.line); refs.tails.set(tail, s); }
    if (!existing.has(slug)) wanted.add(slug);
  }
  if (badSlug.length) {
    notes.push(`以下文档的 line 值派生不出合法 slug,未播种实体(check 将报 docs.lineBadSlug,须人工改值或 baseline 立账):${badSlug.join(';')}`);
  }
  // ② 登记表归并:按工作线名(slug 化后)匹配;立项日成为实体 created(id 随之带真实日期),
  // 立项/权威文档两列的人工判断写进实体正文——字段集属元模型(D-003),不为迁移私加字段。
  const regBySlug = new Map((registry?.rows ?? []).map((r) => [slugify(r.name), r]));
  const changes = [];
  const failed = [];
  for (const slug of [...wanted].sort()) {
    const reg = regBySlug.get(slug);
    const created = /^\d{4}-\d{2}-\d{2}$/.test(reg?.started ?? '') ? reg.started : today;
    const extras = [];
    if (reg) {
      extras.push(`- 立项:${reg.started || '—'}(自字母登记表 ${reg.letter} 行归并)`);
      if (reg.authDoc && reg.authDoc !== '—') extras.push(`- 权威文档:${rebaseOneLevelDeeper(reg.authDoc)}`);
    }
    const rel = `${config.docsDir}/${LINES_DIR}/${slug}.md`;
    const r = deriveId({ rel, created }, (id) => taken.has(id));
    if (!r.ok) { failed.push(`${rel}(拟用 ${r.id})`); continue; }
    taken.add(r.id);
    changes.push({ path: rel, content: lineEntityContent(slug, r.id, created, extras), desc: `新建线实体(${r.id}${reg ? `;归并登记表 ${reg.letter} 行` : ''})` });
  }
  if (failed.length) {
    return { changes: [], notes, refs, error: `以下线实体的 id 撞号后仍无法消歧:${failed.join(';')}` };
  }
  // 登记表行对应的实体已在盘上 ⇒ 不改既有文件(迁移不重写用户手建的实体),注记请人工核对
  const mergeSkipped = (registry?.rows ?? []).filter((r) => existing.has(slugify(r.name))).map((r) => `${r.letter}(${r.name})`);
  if (mergeSkipped.length) notes.push(`登记表以下行对应实体已存在,未自动归并立项/权威文档,请人工核对:${mergeSkipped.join(';')}`);
  if (changes.length) notes.push(`已为 ${changes.length} 条工作线播种 ${LINES_DIR}/ 占位实体;一句话使命请人工复核补全`);
  return { changes, notes, refs };
}

/**
 * 对账之三:docs/README 目录职责表补一行。索引门要求 config.dirs ↔ README 表
 * ↔ 实际目录**三方一致**(R5-M4),迁移补了 config 腿、播种造了目录腿,README 这一腿
 * 不补的话,升完版的仓当场红 `index.dirTableUnlisted`——且 `index.*` 按 D-013 不可 baseline。
 * 逐行外科插入(不整篇重排):EOL 随被插位置的行走,用户的表列风格一个字节不动。
 * 输入输出都是**字符串**:README 同批可能还有别的变更(id 播种/登记表退役),调用方负责叠加。
 * @returns {string|null} 插行后的全文;无需插行(已登记/无表/未声明目录)返回 null
 */
function insertDirRow(readmeStr, config, dirName, rowDesc) {
  if (!(config.dirs || []).includes(dirName)) return null; // 用户没声明该目录:尊重
  const heading = indexHeadings(config).dirTableHeading; // 逐键兜底:index 对象是浅合并
  const headingRe = new RegExp(`^##\\s*${escRe(heading)}(?=\\s|$)`); // 词尾锚:与 check-index 同契约
  const lines = readmeStr.split(/(?<=\n)/); // 各行保留自身行尾:混合行尾也不被归一
  const inCode = makeFenceSkipper(); // 围栏内的标题/表格行是示例:插错进去就是改示例(B8)
  let inSec = false;
  let lastRow = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (inCode(l)) continue;
    if (headingRe.test(l)) { inSec = true; continue; }
    if (!inSec) continue;
    if (/^##\s/.test(l)) break;
    if (/^\s*\|/.test(l)) {
      if (l.includes(`\`${dirName}/\``)) return null; // 已登记:幂等
      lastRow = i;
    }
  }
  if (lastRow === -1) return null; // 没有职责表:索引门自会报,机器不替人发明一张表
  const hasEol = /\n$/.test(lines[lastRow]);
  const eol = lines[lastRow].endsWith('\r\n') ? '\r\n' : '\n';
  const row = `| \`${dirName}/\` | ${rowDesc} |`;
  lines[lastRow] = hasEol ? `${lines[lastRow]}${row}${eol}` : `${lines[lastRow]}${eol}${row}`;
  return lines.join('');
}

const LINES_ROW_DESC = '工作线实体,`<slug>.md` 一句话使命;文档 frontmatter `line` 引用其文件名(开线 = 新建实体)';
const STATUS_ROW_DESC = '工作线滚动状态分片,`<slug>.md` 每线一文件(D-016);closeout 的 todo 处置按任务 line 落此(D-014)';

/**
 * 解析 README 里的字母登记表(legacy 中心分配形态;§4.1 item2 ④)。
 * 表头契约按 §8 合成形态清单①:`| 字母 | 工作线 | 立项 | 权威文档 |`——列按**名**匹配
 * (字母/工作线两列必须在,立项/权威可缺),不按位置:这张表是用户的存量数据,
 * 不是本工具的 schema,列换序不该让归并静默错位(closeout 固定列是**我们的**契约,才按位置)。
 * @returns {{rows: {letter,name,started,authDoc}[], section: {start, end}}|null}
 */
function parseLetterRegistry(readmeRaw) {
  const lines = readmeRaw.split(/(?<=\n)/);
  const inCode = makeFenceSkipper(); // 围栏里的「字母登记表」标题是示例,不是节界(B8)
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (inCode(lines[i])) continue;
    if (start === -1 && /^#{2,3}\s.*字母登记表/.test(lines[i])) { start = i; continue; }
    if (start !== -1 && /^#{2,6}\s/.test(lines[i])) { end = i; break; }
  }
  if (start === -1) return null;
  const table = parseTables(lines.slice(start + 1, end).join(''))
    .find((tb) => tb.header.some((h) => /字母/.test(h)) && tb.header.some((h) => /工作线/.test(h)));
  if (!table) return null;
  const col = (re) => table.header.findIndex((h) => re.test(h));
  const cL = col(/字母/), cN = col(/工作线/), cS = col(/立项/), cA = col(/权威/);
  const rows = [];
  for (const r of table.rows) {
    const letter = (r[cL] ?? '').trim().toUpperCase();
    const name = (r[cN] ?? '').trim();
    if (!/^[A-Z]$/.test(letter) || !name) continue; // 形不似登记行的(空行/装饰行)跳过
    rows.push({ letter, name, started: cS >= 0 ? (r[cS] ?? '').trim() : '', authDoc: cA >= 0 ? (r[cA] ?? '').trim() : '' });
  }
  return rows.length ? { rows, section: { start, end } } : null;
}

/**
 * 登记表退役:节内容(取号说明 + 表格)整体替换为退役横幅,**保留标题**(仓内锚点不断)。
 * 幂等性由此而来:退役后 parseLetterRegistry 找不到表,后续对账全程 no-op。
 */
function retireLetterRegistry(readmeRaw, registry, today) {
  const lines = readmeRaw.split(/(?<=\n)/);
  const { start, end } = registry.section;
  const eol = lines[start].endsWith('\r\n') ? '\r\n' : '\n';
  const banner = `${eol}> 📦 本表已退役(${today}):v4 起工作线 = \`lines/<slug>.md\` 实体,开线即建文件,无须取号。` +
    `历史行已由 \`worklog-kit upgrade\` 归并进对应线实体;失配项(死号/野号/表外线)见当次 upgrade 输出。${eol}${eol}`;
  return [...lines.slice(0, start + 1), banner, ...lines.slice(end)].join('');
}

/**
 * ④ 滚动状态源分节号改写:`## A. xxx` → `## xxx`。字母同时是分节号,退役字母 =
 * 改滚动状态源的结构,不只删一张表(§4.1 item2 ④ 原文)。只改**登记表里真有**的字母——
 * 别的 `X.` 前缀可能是普通编号,机器不猜。
 * @param {Map<string, FileChange>} pending 本批已排队的变更(todo 可能刚被播过 id,须叠加不覆盖)
 */
function todoSectionRewrite(root, config, letters, pending) {
  if (!letters.size) return null;
  const d = (config.dispositions || []).find((x) => x.name === 'todo' && x.targetKind === 'fixed' && typeof x.target === 'string');
  if (!d) return null;
  const prior = pending.get(d.target);
  const abs = join(root, ...d.target.split('/'));
  const raw = prior ? prior.content : (existsSync(abs) ? readFileSync(abs, 'utf8') : null);
  if (raw === null) return null;
  const inCode = makeFenceSkipper(); // 围栏内的 `## A. x` 是示例,分节号退役不碰它(B8)
  const next = raw.split(/(?<=\n)/).map((l) => {
    if (inCode(l)) return l;
    const body = l.replace(/\r?\n$/, '');
    const m = /^(#{2,3})\s+([A-Za-z])\.\s+(.*)$/.exec(body);
    if (!m || !letters.has(m[2].toUpperCase())) return l;
    return `${m[1]} ${m[3]}${l.slice(body.length)}`;
  }).join('');
  if (next === raw) return null;
  return {
    path: d.target,
    content: next,
    desc: `${prior ? `${prior.desc};` : ''}滚动状态源分节号退役(## X. → ##,随登记表一并退役)`,
  };
}

/** v4 对账总装:id 播种 → 线实体播种(共用占号集合)→ README(退役+补行)→ todo 分节改写 */
function reconcileV4(ctx) {
  const config = { ...DEFAULTS, ...ctx.raw };
  const today = todayLocal(); // 日期戳本地日(B12)
  // 图扫描一次、两个播种共用:plan 阶段零写盘,盘上世界在两步之间不会变
  const graph = collectGraphDocs(ctx.root, config);

  const a = seedDocIds(ctx, graph);
  if (a.error) return a;
  // 变更集按 path 去重、后者覆盖前者(见 planUpgrade):对同一文件的第二笔变更必须
  // 在第一笔的**内容之上**叠加,否则会把刚播的 id 行静默冲掉、写后复验回滚整场。
  const byPath = new Map(a.changes.map((c) => [c.path, c]));

  const readmePath = `${config.docsDir}/README.md`;
  const readmeAbs = join(ctx.root, config.docsDir, 'README.md');
  const readmeBase = byPath.get(readmePath)?.content
    ?? (existsSync(readmeAbs) ? readFileSync(readmeAbs, 'utf8') : null);
  const registry = readmeBase !== null ? parseLetterRegistry(readmeBase) : null;

  const b = seedLineEntities(ctx, graph, a.taken, registry, today);
  const notes = [...a.notes, ...b.notes];
  if (b.error) return { changes: [], notes, error: b.error };
  const changes = [...a.changes, ...b.changes];

  // ③ 三类失配报告(机器判不了,必须人看)
  if (registry) {
    const regLetters = new Set(registry.rows.map((r) => r.letter));
    const regSlugs = new Set(registry.rows.map((r) => slugify(r.name)));
    const dead = registry.rows
      .filter((r) => !b.refs.slugs.has(slugify(r.name)) && !b.refs.tails.has(r.letter))
      .map((r) => `${r.letter}(${r.name})`);
    const wild = [...b.refs.tails.entries()]
      .filter(([L]) => !regLetters.has(L))
      .map(([L, vals]) => `${L}(${[...vals].sort().join('、')})`);
    const offTable = [...b.refs.slugs].filter((s) => !regSlugs.has(s) && !b.refs.slugHadTail.get(s)).sort();
    if (dead.length) notes.push(`失配·死号(登记表有字母、无任何 line 引用,共 ${dead.length}):${dead.join(';')}——线已死或名已改,请人工裁决`);
    if (wild.length) notes.push(`失配·野号(line 值带字母、字母不在登记表,共 ${wild.length}):${wild.join(';')}——号从未登记,实体已按剥尾名播种`);
    if (offTable.length) notes.push(`失配·表外线(无字母无登记,共 ${offTable.length}):${offTable.join('、')}——中心表被静默弃用的存量形态,实体已正常播种`);
  }

  // ② README:登记表退役 + 目录职责表补行,叠加成对该文件的**一笔**变更
  if (readmeBase !== null) {
    let next = readmeBase;
    if (registry) next = retireLetterRegistry(next, registry, today);
    next = insertDirRow(next, config, LINES_DIR, LINES_ROW_DESC) ?? next;
    if (next !== readmeBase || byPath.has(readmePath)) {
      const descs = [
        ...(byPath.has(readmePath) ? [byPath.get(readmePath).desc] : []),
        ...(registry ? ['字母登记表退役(节改横幅,行已归并)'] : []),
        ...(next.includes(`\`${LINES_DIR}/\``) && !readmeBase.includes(`\`${LINES_DIR}/\``) ? [`目录职责表补 \`${LINES_DIR}/\` 行`] : []),
      ];
      if (next !== readmeBase) changes.push({ path: readmePath, content: next, desc: descs.join(';') });
    }
  }

  // ④ todo 分节号改写(叠加在同批 id 播种之上)
  const todoChange = todoSectionRewrite(ctx.root, config, new Set((registry?.rows ?? []).map((r) => r.letter)), byPath);
  if (todoChange) changes.push(todoChange);

  // ⑤ generated 档数据布局(阶段 4 下半)。mode 开关由用户显式改配置,布局由对账兑现
  //(R3-3:档间切换是数据布局迁移不是配置开关)——invariant 档零动作。
  if ((ctx.raw.index?.mode) === 'generated') {
    // pending 组合视图:同批对同一文件的后续变更必须叠在此前内容之上(阶段 2 教训)
    const pending = new Map();
    for (const c of changes) pending.set(c.path, c); // 后者覆盖前者,与 planUpgrade 同规
    const g = reconcileGenerated(ctx, config, graph, a.taken, pending, today);
    if (g.error) return { changes: [], notes, error: g.error };
    notes.push(...g.notes);
    return { changes: [...pending.values()], notes };
  }

  return { changes, notes };
}

/** status 分片占位内容(§4.1 item3:每线恰好一文件,D-016;type 恒 rolling-status) */
const statusShardContent = (slug, id, created, migrated) => `---
id: ${id}
status: active
type: rolling-status
line: ${slug}
created: ${created}
---

# ${slug} · 滚动状态

${migrated ? `${migrated.trimEnd()}\n` : '(分片由 `worklog-kit upgrade` 生成;收口时 disposition=todo 的候选落此,请随施工滚动更新。)\n'}`;

/**
 * generated 档对账(阶段 4 下半):todo 单文件 → `status/<slug>.md` 分片的一次性迁入,
 * 门(line-status 靶点验存)与梯子同批(F-001:「不得先上新 closeout 门后留阶段 5 补梯子」,
 * 任务卡原文)。六步全部幂等:
 *   ① 配置腿:dirs 补 `status`、types 补 `rolling-status`、todo 处置 fixed → line-status(D-014);
 *   ② closeout 台账改写:旧 `repo:<todo 靶点>` 行改指 `repo:<statusDir>/<slug(任务 line)>.md`
 *     ——处置表是**本工具的契约**(D-023),契约迁移时旧台账由工具机械改写,不留满仓硬红;
 *   ③ 分片:每条非归档线实体一片;closeout 改写所需的线即便已归档也补片(验存所需);
 *   ④ todo 迁入:`## <线名>` 分节正文迁入对应分片、原节留指路一行,未匹配分节注记人工;
 *   ⑤ README 职责表补 `status/` 行;⑥ .gitignore 补生成物目录(C-3)。
 */
function reconcileGenerated(ctx, config, graph, taken, pending, today) {
  const notes = [];
  const D = config.docsDir;
  const get = (path) => pending.get(path)?.content
    ?? (existsSync(join(ctx.root, ...path.split('/'))) ? readFileSync(join(ctx.root, ...path.split('/')), 'utf8') : null);
  const queue = (path, content, desc, lossy) => {
    const prior = pending.get(path);
    pending.set(path, { path, content, desc: prior ? `${prior.desc};${desc}` : desc, lossy: prior?.lossy || lossy || false });
  };

  // ① 配置腿。已 flip 过(重跑)则全程 no-op——幂等来源与登记表退役同构:改完就认不出「待改」。
  const next = { ...ctx.raw };
  const cfgDesc = [];
  const cfgEdits = []; // 与 next 同步累积的外科编辑(F-005;基底 = ctx.text,即迁移链产物)
  if (Array.isArray(next.dirs) && !next.dirs.includes('status')) {
    next.dirs = [...next.dirs, 'status'];
    cfgEdits.push({ op: 'append', path: ['dirs'], value: 'status' });
    cfgDesc.push('dirs 补 `status`');
  }
  if (Array.isArray(next.types) && !next.types.some((x) => (typeof x === 'string' ? x : x?.name) === 'rolling-status')) {
    next.types = [...next.types, { name: 'rolling-status', canBeAuthoritative: false }];
    cfgEdits.push({ op: 'append', path: ['types'], value: { name: 'rolling-status', canBeAuthoritative: false } });
    cfgDesc.push('types 补 `rolling-status`(时点记录,恒非权威)');
  }
  let statusDir = (next.dispositions || []).find((d) => d?.targetKind === 'line-status')?.statusDir ?? null;
  let oldTodoTarget = null; // 非 null = 本次正在 flip(首跑);重跑时恒 null,②④ 随之 no-op
  if (!statusDir) {
    statusDir = `${D}/status`;
    const i = (next.dispositions || []).findIndex((d) => d?.name === 'todo' && d.targetKind === 'fixed');
    if (i >= 0) {
      oldTodoTarget = next.dispositions[i].target;
      next.dispositions = next.dispositions.map((d, k) => (k === i ? { name: 'todo', targetKind: 'line-status', statusDir } : d));
      cfgEdits.push({ path: ['dispositions', i], value: { name: 'todo', targetKind: 'line-status', statusDir } });
      cfgDesc.push('todo 处置 fixed → line-status(D-014:靶点按任务 line 求解)');
    }
  }
  if (cfgDesc.length) {
    // 基底须用 ctx.text(迁移链的配置产物),不得经 get() 读盘:盘上还是迁移前的旧文
    const c = configChange(ctx.text, next, cfgEdits, `generated 档配置腿:${cfgDesc.join(';')}`);
    queue(c.path, c.content, c.desc, c.lossy);
  }

  // ② closeout 台账改写(先于分片:改写所需的线要进分片集合)
  const lineEntityRe = new RegExp(`^${escRe(D)}\\/${LINES_DIR}\\/([^/]+)\\.md$`);
  const needShard = new Set();
  if (oldTodoTarget) {
    for (const gd of graph) {
      if (!gd.rel.startsWith(`${D}/worklogs/`) || !gd.rel.endsWith('/closeout.md')) continue;
      const raw2 = get(gd.rel);
      if (raw2 === null) continue;
      const slug = slugify(gd.data.line ?? '');
      if (!slug) { notes.push(`${gd.rel}:缺 line 或派生不出 slug,其 todo 处置行未改写,请人工迁移靶点`); continue; }
      let hit = false;
      const rewritten = raw2.split(/(?<=\n)/).map((l) => {
        const cells = l.split('|');
        if (cells.length < 5) return l;
        if (cells[2]?.trim() !== 'todo' || cells[3]?.trim() !== `repo:${oldTodoTarget}`) return l;
        hit = true;
        cells[3] = ` repo:${statusDir}/${slug}.md `;
        return cells.join('|');
      }).join('');
      if (hit) {
        needShard.add(slug);
        queue(gd.rel, rewritten, `todo 处置靶点改指 ${statusDir}/${slug}.md(D-023:台账是本工具契约,契约迁移随迁台账)`);
      }
    }
  }

  // ③ 分片集合 = 非归档线实体 ∪ closeout 改写所需(后者即便线已归档也要有片:验存所需)
  for (const gd of graph) {
    const m = lineEntityRe.exec(gd.rel);
    if (m && gd.data.status !== 'archived' && gd.data.status !== 'superseded') needShard.add(m[1].normalize('NFC'));
  }
  // R6-04:**同批待播**的线实体只在 pending、不在盘上 graph——不并入即「播了实体、缺分片」:
  // 写后复验(verifyGenerated)必败 → 整体回滚 → 重跑得到完全相同的失败,死锁。
  // 触发路径正是「brownfield 直接声明 generated 再首跑 upgrade」这条被宣传的采纳路。
  for (const c of pending.values()) {
    const m = lineEntityRe.exec(c.path);
    if (!m) continue;
    const { data } = parseFrontmatter(c.content);
    if (data.status !== 'archived' && data.status !== 'superseded') needShard.add(m[1].normalize('NFC'));
  }

  // ④ todo 分节迁入原料(仅首跑:oldTodoTarget 已知才知道旧靶点在哪)
  const migrated = new Map(); // slug → 分节正文
  if (oldTodoTarget) {
    const todoRaw = get(oldTodoTarget);
    if (todoRaw !== null) {
      const lines = todoRaw.split(/(?<=\n)/);
      // 围栏内的 `## x` 是示例:fence-blind 会把示例当真分节切走——示例内容被迁进
      // 别的线的分片、其所在真分节被提前截断(B8)
      const skipF = makeFenceSkipper();
      const inCode = lines.map((l) => skipF(l));
      const secs = []; // {slug|null, heading, start, end}
      for (let i = 0; i < lines.length; i++) {
        if (inCode[i]) continue;
        const m = /^##\s+(.+?)\s*$/.exec(lines[i].replace(/\r?\n$/, ''));
        if (!m) continue;
        if (secs.length) secs[secs.length - 1].end = i;
        secs.push({ heading: m[1], slug: slugify(m[1]), start: i, end: lines.length });
      }
      const unmatched = [];
      let nextTodo = null;
      for (const s of secs) {
        if (!needShard.has(s.slug)) { unmatched.push(s.heading); continue; }
        const body = rebaseOneLevelDeeper(lines.slice(s.start + 1, s.end).join('').trim());
        if (body) migrated.set(s.slug, body);
        const eol = lines[s.start].endsWith('\r\n') ? '\r\n' : '\n';
        nextTodo = nextTodo ?? [...lines];
        for (let i = s.start + 1; i < s.end; i++) nextTodo[i] = '';
        nextTodo[s.start] = `${lines[s.start]}${eol}(本节已迁入 \`${statusDir}/${s.slug}.md\`,generated 档分片,D-016)${eol}${eol}`;
      }
      // 退役横幅在 flip 当次**无条件**插(挂 H1 之后):文件不再是滚动状态源这件事
      // 与「有没有分节被自动迁走」无关——全孤儿分节的仓(实测本仓即是)不横幅的话,
      // 读者面对一份看起来仍现役的旧状态源,而契约已经换了地方。
      const base = (nextTodo ?? [...lines]).join('');
      const h1 = /^#\s.*$/m.exec(base);
      const banner = `\n\n> 📦 滚动状态已分片(generated 档,${today}):各工作线现役状态见 \`${statusDir}/\`;本文件退役,未迁移分节请人工归并。`;
      const final = h1 ? base.slice(0, h1.index + h1[0].length) + banner + base.slice(h1.index + h1[0].length) : banner + base;
      queue(oldTodoTarget, final, `滚动状态源退役留横幅${nextTodo ? `(分节迁入 ${statusDir}/)` : ''}`);
      if (unmatched.length) notes.push(`todo 以下分节不对应任何工作线,未自动迁移,请人工归并或删除:${unmatched.join('、')}`);
    }
  }

  // 分片落盘(占位或携迁入正文);已存在的分片不重写(迁移的写入权止于自己造的东西,D-023)
  const failed = [];
  for (const slug of [...needShard].sort()) {
    const rel = `${statusDir}/${slug}.md`;
    if (get(rel) !== null) {
      if (migrated.has(slug)) notes.push(`${rel} 已存在,todo 分节内容未自动并入,请人工归并`);
      continue;
    }
    const r = deriveId({ rel, created: today }, (id) => taken.has(id));
    if (!r.ok) { failed.push(`${rel}(拟用 ${r.id})`); continue; }
    taken.add(r.id);
    queue(rel, statusShardContent(slug, r.id, today, migrated.get(slug)), `新建滚动状态分片(${r.id}${migrated.has(slug) ? ';携 todo 迁入内容' : ''})`);
  }
  if (failed.length) return { error: `以下状态分片的 id 撞号后仍无法消歧:${failed.join(';')}`, notes };

  // ⑤ README 职责表补 status/ 行(dirs 腿已在①补,故用 next 判目录声明)
  const readmePath = `${D}/README.md`;
  const readmeNow = get(readmePath);
  if (readmeNow !== null) {
    const withRow = insertDirRow(readmeNow, { ...config, dirs: next.dirs ?? config.dirs }, 'status', STATUS_ROW_DESC);
    if (withRow !== null) queue(readmePath, withRow, '目录职责表补 `status/` 行');
  }

  // ⑥ .gitignore:生成物不入库(C-3)。追加一行,已有则 no-op
  const outRel = ctx.raw.index?.outDir || DEFAULTS.index.outDir;
  const gi = get('.gitignore');
  if (gi === null) {
    queue('.gitignore', `# worklog-kit 生成物不入库(C-3)\n${outRel}/\n`, '新建 .gitignore(生成物目录)');
  } else if (!gi.split(/\r?\n/).some((l) => l.trim() === `${outRel}/` || l.trim() === outRel)) {
    const eol = gi.includes('\r\n') ? '\r\n' : '\n';
    queue('.gitignore', `${gi}${gi.endsWith('\n') ? '' : eol}# worklog-kit 生成物不入库(C-3)${eol}${outRel}/${eol}`, '.gitignore 补生成物目录');
  }

  return { notes };
}

/** v3 写后复验:受检文档须**全部**有合法且唯一的 id——迁移自己得对自己的产物负责。
 *  唯一性图与门同域(D-020/F-014:同一个 collectGraphDocs),否则「播出的 id 与归档件
 *  撞号」这一类正是复验本该抓、却抓不到的产物缺陷。 */
function verifyIdsSeeded(root) {
  const { config } = loadConfig(root);
  const errors = [];
  const graph = collectGraphDocs(root, config);
  collectIds(graph, (id, g, prev) => errors.push(`id 撞号:${g.rel} 与 ${prev.rel} 同为 ${id}`));
  for (const g of graph) {
    if (g.graph !== true) continue; // 归档件不必有 id;声明了就已进上面的唯一性图
    if (!g.data.id) { errors.push(`${g.rel} 迁移后仍无 id`); continue; }
    if (!isValidId(g.data.id)) errors.push(`${g.rel} 的 id 非法:${g.data.id}`);
  }
  return errors;
}

/** v4 写后复验之二:每个带 `line` 值的受检文档,其 slug 必须解析到已存在的线实体 */
function verifyLinesResolved(root) {
  const { config } = loadConfig(root);
  const errors = [];
  const linesAbs = join(root, config.docsDir, LINES_DIR);
  const entities = new Set(
    existsSync(linesAbs)
      ? readdirSync(linesAbs).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3).normalize('NFC'))
      : [],
  );
  for (const g of collectGraphDocs(root, config)) {
    if (g.graph !== true || !g.data.line) continue;
    const slug = slugify(g.data.line);
    if (!slug) continue; // 播种时已注记跳过,属人判债(lineBadSlug 可 baseline),非本次产物缺陷
    if (!entities.has(slug)) errors.push(`${g.rel} 的 line「${g.data.line}」仍无实体(${config.docsDir}/${LINES_DIR}/${slug}.md)`);
  }
  return errors;
}

/** generated 档复验:每条非归档线实体须有滚动状态分片(line-status 靶点验存的前提) */
function verifyGenerated(root) {
  const { config } = loadConfig(root);
  if ((config.index?.mode) !== 'generated') return [];
  const errors = [];
  const statusDir = (config.dispositions || []).find((d) => d.targetKind === 'line-status')?.statusDir
    ?? `${config.docsDir}/status`;
  const lineEntityRe = new RegExp(`^${escRe(config.docsDir)}\\/${LINES_DIR}\\/([^/]+)\\.md$`);
  for (const g of collectGraphDocs(root, config)) {
    const m = lineEntityRe.exec(g.rel);
    if (!m || g.data.status === 'archived' || g.data.status === 'superseded') continue;
    const shard = join(root, ...`${statusDir}/${m[1]}.md`.split('/'));
    if (!existsSync(shard)) errors.push(`线「${m[1]}」缺滚动状态分片(${statusDir}/${m[1]}.md);出路:手建该分片(type: rolling-status、line 指自身文件名)后重跑 worklog-kit upgrade`);
  }
  return errors;
}

/** 复验总装:id 齐且唯一 + line 全部可解析 + generated 档分片到位 */
const verifyV4 = (root) => [...verifyIdsSeeded(root), ...verifyLinesResolved(root), ...verifyGenerated(root)];

/** 迁移登记表(逐级;新增一版即在此追加一条,并同批加 fixture) */
export const MIGRATIONS = [
  { from: 1, to: 2, title: 'types 元模型化(加 canBeAuthoritative 槽位)+ targetKind 增补 line-status', plan: migrateV1toV2 },
  { from: 2, to: 3, title: '文档 frontmatter `id` 转必填(按 <created>-<文件名 slug> 自动播种)', plan: migrateV2toV3 },
  { from: 3, to: 4, title: '`line` 收紧为 lines/<slug>.md 实体引用(实体由对账播种,D-007 slug)', plan: migrateV3toV4 },
  { from: 4, to: 5, title: 'index 新增索引形态档 mode(invariant|generated)与生成物目录 outDir(缺省不变)', plan: migrateV4toV5 },
];

/**
 * 各版本的**数据布局对账器**(幂等)。与 MIGRATIONS 的分工:
 *   - MIGRATIONS[n] 回答「从 n 版**变到** n+1 版要改什么」——只跑一次,跨过就不再跑;
 *   - RECONCILERS[n] 回答「声称是 n 版的仓,数据布局**现在**该是什么样」——每次 upgrade 都跑。
 * 存量仓 init 出来就是最新版配置 + 一堆没有 id 的旧文档:它一次迁移都不需要,却**极其需要**
 * 对账。只有 MIGRATIONS 的话,这类仓拿不到任何梯子(见 seedDocIds 的注释)。
 * 只保留**最新版**的条目:planUpgrade 恒先推到最新版再对账,旧版条目永远不会被读——
 * 留着即死配置(§7.4 判据)。v4 对账**包含** v3 的 id 播种,不是替换它。
 */
export const RECONCILERS = {
  5: { title: '文档 id 播种 + lines/ 线实体播种(含字母登记表归并/退役、失配报告)+ README 补行 + todo 分节退役 + generated 档 status 分片迁入(幂等)', plan: reconcileV4, verify: verifyV4 },
};

/**
 * 求从 fromVersion 到最新版的迁移计划。
 * @returns {{steps: Migration[], changes: FileChange[], notes: string[], target: object}|{error: string}}
 */
export function planUpgrade(root, raw, fromVersion, rawText) {
  const steps = [];
  let cur = fromVersion;
  let curRaw = raw;
  let curText = rawText; // 配置原文逐级随迁(F-005):每级外科编辑在上一级产物之上叠加
  const changes = new Map(); // path → FileChange(后一级覆盖前一级对同一文件的写)
  const notes = [];
  const verifiers = [];
  // lossy 具传染性(F-005):链上任何一级整体重写过,注释在那一刻已经没了——即便后续
  // 各级外科编辑全部成功,最终对配置的那笔变更也必须如实标注,否则告警被后级覆盖吞掉。
  let configLossy = false;
  while (cur < LATEST_SCHEMA_VERSION) {
    const m = MIGRATIONS.find((x) => x.from === cur);
    if (!m) return { error: `缺 v${cur} → v${cur + 1} 的迁移条目(registry 断链);这是本工具的 bug,请报告` };
    const r = m.plan({ root, raw: curRaw, text: curText });
    // 某一级判定自己做不下去(如 id 撞号无法消歧)⇒ 整条计划作废,零写入。
    // 让它「跳过这一级继续走」会产出一个声明版本与实际布局不符的仓——比不迁移更难收拾。
    if (r.error) return { error: r.error, notes: [...notes, ...(r.notes || [])] };
    for (const c of r.changes) changes.set(c.path, c);
    configLossy = configLossy || r.changes.some((c) => c.path === CONFIG_NAME && c.lossy);
    notes.push(...r.notes);
    if (r.verify) verifiers.push(r.verify);
    steps.push(m);
    curRaw = r.raw;
    if (typeof r.text === 'string') curText = r.text;
    cur = m.to;
  }
  // 版本号推到位之后,再跑一次当前版的**数据布局对账**——版本号对了不代表数据到位。
  // 这一步对「一次迁移都不需要、却满仓缺 id」的存量仓是唯一的梯子(见 RECONCILERS 注释)。
  const rec = RECONCILERS[LATEST_SCHEMA_VERSION];
  if (rec) {
    const r = rec.plan({ root, raw: curRaw, text: curText });
    if (r.error) return { error: r.error, notes: [...notes, ...(r.notes || [])] };
    for (const c of r.changes) changes.set(c.path, c);
    configLossy = configLossy || r.changes.some((c) => c.path === CONFIG_NAME && c.lossy);
    notes.push(...r.notes);
    if (rec.verify && r.changes.length) verifiers.push(rec.verify);
  }
  // 分发面对账(F-004):模板/skill 副本按 manifest 基线三态判定——stale(基线证明
  // 未定制、包前进了)带走,missing 补齐;customized/unknown 只报不动(D-030 方向性
  // 安全:宁可漏刷不可误刷)。manifest 随之对齐当前引擎事实(D-017+D-030 基线记账);
  // stampedAt 不参与「要不要写」的判定,否则日期一变天天有「变更」,幂等就没了。
  {
    const config = { ...DEFAULTS, ...curRaw };
    const cls = classifyTemplates(root, config);
    const refreshed = new Set();
    for (const c of cls) {
      if (c.state === 'stale' || c.state === 'missing') {
        refreshed.add(c.rel);
        changes.set(c.rel, {
          path: c.rel,
          content: c.content,
          desc: c.state === 'stale' ? '副本落后于包内新版(基线证明未定制)——带走(F-004)' : '副本缺失——按当前包渲染补齐(F-004)',
        });
      } else if (c.state === 'customized') {
        notes.push(`${c.rel}:已本地定制(与包渲染和工具上次写入均不同),upgrade 不覆盖`);
      } else if (c.state === 'unknown') {
        notes.push(`${c.rel}:与包渲染不同且无基线记录(老 manifest 仓的存量形态),无从判定定制/漂移——不动;确认非定制可删除该文件后重跑 upgrade`);
      }
    }
    const prev = readManifest(root);
    const nextManifest = buildManifest(root, config, todayLocal(), prev, refreshed);
    const material = (s) => { try { const o = JSON.parse(s); delete o.stampedAt; return JSON.stringify(o); } catch { return null; } };
    const curManifest = existsSync(join(root, ...MANIFEST_REL.split('/'))) ? readFileSync(join(root, ...MANIFEST_REL.split('/')), 'utf8') : null;
    if (curManifest === null || material(curManifest) !== material(nextManifest)) {
      changes.set(MANIFEST_REL, { path: MANIFEST_REL, content: nextManifest, desc: 'manifest 对齐当前引擎(版本/schemaVersion/templates 基线,D-017+D-030)' });
    }
  }
  const cfgChange = changes.get(CONFIG_NAME);
  if (cfgChange && configLossy) cfgChange.lossy = true;
  return { steps, changes: [...changes.values()], notes, verifiers, target: curRaw };
}

/** 备份文件名:与 skill 分发同规格(时间戳后缀,回滚 = 改回原名) */
const backupName = (p, stamp) => `${p}.bak-${stamp}`;

/**
 * 落盘变更集:先备份 → 原子写(tmp→rename)→ 复验 → 不过则整体回滚。
 * export 供 selftest 直测失败路径(与 RECONCILERS 同理:内部件的回滚契约要可直证)。
 * @returns {{ok: true, backups: string[]}|{ok: false, error: string, restored: boolean}}
 */
export function applyChanges(root, changes, stamp, verifiers = []) {
  const backups = [];
  const written = [];
  const createdDirs = []; // 本批真正新建的目录(B10:回滚时深→浅撤)
  try {
    for (const c of changes) {
      const abs = join(root, c.path);
      if (existsSync(abs)) { const b = backupName(abs, stamp); copyFileSync(abs, b); backups.push(b); }
      else {
        // 迁移也可能新建文件(如新造的实体目录)。逐级记下将要新建的目录:回滚只还原
        // 文件不撤目录的话,残留空目录会改 index 门「实际目录」判定——失败的迁移留下门红。
        for (let d = dirname(abs); !existsSync(d); d = dirname(d)) createdDirs.push(d);
        mkdirSync(dirname(abs), { recursive: true });
      }
      const tmp = `${abs}.tmp-${process.pid}`;
      writeFileSync(tmp, c.content);
      renameSync(tmp, abs); // 同卷原子替换:不留「写了一半」的配置
      written.push(abs);
    }
    // 写后复验:迁移产出的配置必须自己过得了校验。不复验的话,一次坏迁移会把
    // 仓推进到一个「声明是新版、内容不合新版」的状态——比不迁移更难收拾。
    const { errors } = loadConfig(root);
    if (errors.length) throw new Error(`迁移产物未通过配置校验:${errors.join(';')}`);
    // 各级迁移自带的复验(如 v3 断言 id 已全部播种且唯一)。配置校验只看配置文件,
    // 看不见**数据布局**迁移的产物——而 v2→v3 改的恰恰全在文档里。
    for (const v of verifiers) {
      const errs = v(root);
      if (errs.length) throw new Error(`迁移产物未通过复验:${errs.join(';')}`);
    }
    return { ok: true, backups };
  } catch (e) {
    // 回滚:有备份的还原,新建的删掉——让仓回到迁移前的样子
    let restored = true;
    try {
      for (const abs of written) {
        const b = backupName(abs, stamp);
        if (existsSync(b)) copyFileSync(b, abs);
        else rmSync(abs, { force: true });
      }
      // 新建目录深→浅撤。rmdirSync 非递归:目录里有非本批内容即留(取证安全);
      // `.bak` 备份同理**不删**——失败现场的还原依据与人工排障线索。
      for (const d of [...createdDirs].sort((a, b) => b.length - a.length)) {
        try { rmdirSync(d); } catch { /* 非空/已撤:留 */ }
      }
    } catch { restored = false; }
    return { ok: false, error: e.message, restored };
  }
}

/** upgrade 认得的标志。见下方 main 里的拒绝逻辑——这是本工具唯一会重写文件的命令 */
const KNOWN_FLAGS = new Set(['--dry-run']);

export function main({ root, t, args }) {
  // 未知标志一律拒绝,**不**当作「带个无关参数的真跑」。upgrade 是唯一重写文件的命令,
  // 而它的安全阀恰恰是一个标志:`--dry-runn` 手滑漏个字母,就从「预览」变成「真迁移」。
  // 别的命令把未知标志忽略掉最多是没生效;这里是**默认执行破坏性动作**。
  const unknown = args.filter((a) => !KNOWN_FLAGS.has(a));
  if (unknown.length) { console.error(t('upgrade.unknownFlag', { flags: unknown.join(' '), known: [...KNOWN_FLAGS].join(' ') })); return 2; }
  const dryRun = args.includes('--dry-run');
  const path = join(root, CONFIG_NAME);
  if (!existsSync(path)) { console.error(t('upgrade.noConfig', { name: CONFIG_NAME })); return 2; }

  const rawText = readFileSync(path, 'utf8');
  let raw;
  try { raw = parseJsonc(rawText); } catch (e) {
    console.error(t('upgrade.parseFail', { msg: e.message }));
    return 2;
  }
  const v = raw?.schemaVersion;
  if (!Number.isInteger(v)) { console.error(t('upgrade.badVersion', { got: JSON.stringify(v) })); return 2; }
  if (v > LATEST_SCHEMA_VERSION) {
    // 配置比引擎新:该升的是**工具**,不是配置。此时迁移无从谈起。
    console.error(t('upgrade.tooNew', { got: v, latest: LATEST_SCHEMA_VERSION }));
    return 2;
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(v)) { console.error(t('upgrade.unsupported', { got: v, supported: SUPPORTED_SCHEMA_VERSIONS.join('/') })); return 2; }

  // ⚠️ 此处**不得**在 v === LATEST 时早退。曾经如此,那一行正是让存量仓的梯子消失的地方:
  // init 直接 stamp 最新版配置,于是满仓没有 id 的旧文档撞上一句「已是最新版」——
  // 播种代码永远不会执行。改由 planUpgrade 统一回答「要让这个仓真的到位,得改什么」;
  // 真的无事可做时它给出空变更集,幂等性由此保住。
  const plan = planUpgrade(root, raw, v, rawText);
  if (plan.error) { console.error(`✗ ${plan.error}`); return 2; }
  if (!plan.changes.length) {
    // 零变更也可能有注记(F-004:定制/无基线副本「只报不动」)——早退不得吞掉它们
    for (const n of plan.notes) console.log(`  ⚠ ${n}`);
    console.log(t('upgrade.alreadyLatest', { v }));
    return 0;
  }

  console.log(plan.steps.length
    ? t('upgrade.planHeader', { from: v, to: LATEST_SCHEMA_VERSION })
    : t('upgrade.reconcileHeader', { v }));
  for (const s of plan.steps) console.log(`  · v${s.from} → v${s.to}:${s.title}`);
  for (const c of plan.changes) console.log(`  · ${c.path}:${c.desc}`);
  for (const n of plan.notes) console.log(`  ⚠ ${n}`);
  // 诚实告知代价:配置改写**默认外科编辑保注释**(F-005,jsoncedit);只有编辑产物
  // 未通过解析等价断言而回落整体重写(lossy)时才丢注释——警告只在真丢时打,
  // 否则「每次都喊丢」会把真丢那次的警报淹没成背景噪音。
  if (plan.changes.some((c) => c.path === CONFIG_NAME && c.lossy)) console.log(t('upgrade.commentLoss'));

  if (dryRun) {
    console.log(`\n${t('upgrade.dryRunTail')}`);
    for (const c of plan.changes) console.log(`\n──── ${c.path} ────\n${c.content}`);
    return 0;
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const r = applyChanges(root, plan.changes, stamp, plan.verifiers);
  if (!r.ok) {
    console.error(t('upgrade.failed', { msg: r.error }));
    console.error(r.restored ? t('upgrade.rolledBack') : t('upgrade.rollbackFailed'));
    return 1;
  }
  for (const b of r.backups) console.log(t('upgrade.backup', { path: b }));
  console.log(t('upgrade.done', { to: LATEST_SCHEMA_VERSION }));
  return 0;
}

// ── selftest:v1→v2 fixture + dry-run 零写入 + 备份/回滚 ──────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-upgrade: ${name}`); if (!cond) failed++; };
  const t = (k, p = {}) => `${k} ${Object.values(p).join(' ')}`;
  const quiet = (fn) => {
    const log = console.log, err = console.error;
    console.log = () => {}; console.error = () => {};
    try { return fn(); } finally { console.log = log; console.error = err; }
  };
  // 典型 v1 配置(本工具 v1 时期的真实形状:types 是字符串数组)
  const v1 = {
    $schema: './schema/worklogrc.schema.json',
    schemaVersion: 1,
    lang: 'zh',
    docsDir: 'docs',
    dirs: ['designs', 'worklogs'],
    status: ['draft', 'active'],
    types: ['design', 'review', '我的自定义型'],
    dispositions: [{ name: 'experience', targetKind: 'docs' }],
  };
  const withRepo = (cfg, fn) => {
    const root = mkdtempSync(join(tmpdir(), 'wk-upgrade-'));
    try {
      if (cfg !== null) writeFileSync(join(root, CONFIG_NAME), JSON.stringify(cfg, null, 2));
      return fn(root);
    } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const readCfg = (root) => parseJsonc(readFileSync(join(root, CONFIG_NAME), 'utf8'));

  // 1. v1 配置**不 upgrade 也能用**——梯子先于门(R5-C3):载入时归一,今天照跑
  withRepo(v1, (root) => {
    const { config, errors, fileVersion } = loadConfig(root);
    assert(errors.length === 0, 'v1 配置零错误载入(旧版仍可读,不强制先迁移)');
    assert(fileVersion === 1, 'fileVersion 如实报 1(doctor 据此提示可升级)');
    // 断言引常量而非写死数字:写死的话每升一版就要来修同样这几处,
    // 而它们要证的本来就是「归一到**最新**版」,不是「归一到 2」。
    assert(config.schemaVersion === LATEST_SCHEMA_VERSION, '内部形态归一为最新版');
    assert(Array.isArray(config.types) && config.types.every((x) => typeof x === 'object' && 'canBeAuthoritative' in x), 'v1 的字符串 types 归一为 v2 对象数组');
    assert(config.types.find((x) => x.name === 'design')?.canBeAuthoritative === true, '内置 type 按内置表取 canBeAuthoritative');
    assert(config.types.find((x) => x.name === '我的自定义型')?.canBeAuthoritative === false, '未知 type 保守置 false(不静默授予权威资格)');
  });

  // 2. dry-run 零写入
  withRepo(v1, (root) => {
    const before = readFileSync(join(root, CONFIG_NAME), 'utf8');
    const code = quiet(() => main({ root, t, args: ['--dry-run'] }));
    assert(code === 0 && readFileSync(join(root, CONFIG_NAME), 'utf8') === before, 'upgrade --dry-run 零写入');
    assert(readdirSync(root).filter((n) => n.includes('.bak-')).length === 0, 'dry-run 不留备份文件');
  });

  // 3. apply:落盘 + 备份 + 产物合法 + 幂等
  withRepo(v1, (root) => {
    const code = quiet(() => main({ root, t, args: [] }));
    const after = readCfg(root);
    assert(code === 0 && after.schemaVersion === LATEST_SCHEMA_VERSION, `upgrade 落盘 schemaVersion → ${LATEST_SCHEMA_VERSION}`);
    assert(after.types.every((x) => typeof x === 'object'), 'upgrade 落盘 types 为对象数组');
    assert(after.$schema === `./schema/worklogrc.v${LATEST_SCHEMA_VERSION}.schema.json`, '$schema 改指最新版(含无版本号的历史名)');
    assert(readdirSync(root).some((n) => n.startsWith(`${CONFIG_NAME}.bak-`)), 'apply 留下备份');
    assert(loadConfig(root).errors.length === 0, '迁移产物自身通过配置校验');
    assert(quiet(() => main({ root, t, args: [] })) === 0 && readCfg(root).schemaVersion === LATEST_SCHEMA_VERSION, '已是最新版时 upgrade 幂等 exit 0');
  });

  // 3b. F-005:注释保全——带注释的 v1 **原文**全链升到最新版,注释原样、不打丢注释告警
  const withRepoText = (text, fn) => {
    const root = mkdtempSync(join(tmpdir(), 'wk-upgrade-'));
    try { writeFileSync(join(root, CONFIG_NAME), text); return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const capture = (fn) => {
    const log = console.log, err = console.error, buf = [];
    console.log = (...a) => buf.push(a.join(' ')); console.error = (...a) => buf.push(a.join(' '));
    try { return { code: fn(), out: buf.join('\n') }; } finally { console.log = log; console.error = err; }
  };
  {
    const v1Text = [
      '// 顶注:模板注释就是文档(F-005 保全对象)',
      '{',
      '  "$schema": "./schema/worklogrc.schema.json",',
      '  "schemaVersion": 1, // 行尾注',
      '  "lang": "zh",',
      '  "docsDir": "docs",',
      '  /* 块注:dirs 是机器真源 */',
      '  "dirs": ["designs", "worklogs"],',
      '  "status": ["draft", "active"],',
      '  "types": ["design", "review"],',
      '  "dispositions": [{ "name": "experience", "targetKind": "docs" }]',
      '}',
      '',
    ].join('\n');
    withRepoText(v1Text, (root) => {
      const { code, out } = capture(() => main({ root, t, args: [] }));
      const after = readFileSync(join(root, CONFIG_NAME), 'utf8');
      const cfg = parseJsonc(after);
      assert(code === 0 && cfg.schemaVersion === LATEST_SCHEMA_VERSION, 'F-005 带注释 v1 全链升至最新版 exit 0');
      assert(['// 顶注', '// 行尾注', '/* 块注'].every((m) => after.includes(m)), 'F-005 三种注释全数保全');
      assert(cfg.types.every((x) => typeof x === 'object') && cfg.dirs.includes(LINES_DIR), 'F-005 外科编辑产物语义正确(types 对象化 + dirs 补 lines)');
      assert(!out.includes('upgrade.commentLoss'), 'F-005 注释保全成功时不打丢注释告警');
    });
  }
  // 3c. F-005 兜底:重复键(JSON 后者胜出,文本手术改前者)→ 等价断言失配 → 整体重写 + 如实告警。
  //     lossy 须传染到最终变更:首级兜底后,后级外科编辑全成也不得吞掉告警。
  {
    const dupText = [
      '// 这行注释注定丢失(兜底路径)',
      '{',
      '  "schemaVersion": 1,',
      '  "schemaVersion": 1,',
      '  "lang": "zh",',
      '  "docsDir": "docs",',
      '  "dirs": ["designs", "worklogs"],',
      '  "status": ["draft", "active"],',
      '  "types": ["design"],',
      '  "dispositions": [{ "name": "experience", "targetKind": "docs" }]',
      '}',
    ].join('\n');
    withRepoText(dupText, (root) => {
      const { code, out } = capture(() => main({ root, t, args: [] }));
      assert(code === 0 && readCfg(root).schemaVersion === LATEST_SCHEMA_VERSION, 'F-005 兜底:罕见形态(重复键)仍迁移成功');
      assert(out.includes('upgrade.commentLoss'), 'F-005 兜底:整体重写时如实打丢注释告警(lossy 传染到最终变更)');
    });
  }

  // 4. 拒绝迁移的三种情形
  withRepo(null, (root) => assert(quiet(() => main({ root, t, args: [] })) === 2, '无配置文件时 upgrade exit 2'));
  withRepo({ ...v1, schemaVersion: 99 }, (root) => {
    const code = quiet(() => main({ root, t, args: [] }));
    // 配置比引擎新:该升的是**工具**不是配置,迁移无从谈起
    assert(code === 2 && readCfg(root).schemaVersion === 99, '配置版本高于引擎时 upgrade exit 2 且不改文件');
  });
  withRepo({ ...v1, schemaVersion: 'bad' }, (root) => {
    assert(quiet(() => main({ root, t, args: [] })) === 2, 'schemaVersion 非整数时 upgrade exit 2');
  });

  // 5. registry 逐级无断链:每个受支持版本都能走到最新版
  for (const v of SUPPORTED_SCHEMA_VERSIONS) {
    const root = mkdtempSync(join(tmpdir(), 'wk-upgrade-reg-')); // v2→v3 会读 docs,须给它一个真目录
    try {
      const p = planUpgrade(root, { ...v1, schemaVersion: v }, v);
      assert(!p.error, `registry 从 v${v} 到最新版无断链`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // ── 6. deriveId 直证(方案 §4.1 item1 派生规则)──────────────────────────────
  {
    const none = () => false;
    const probes = [
      [{ rel: 'docs/todo.md', created: '2026-07-16' }, none, '2026-07-16-todo', '无日期前缀 ⇒ 补 created'],
      [{ rel: 'docs/designs/2026-07-12-方案.md', created: '2026-07-16' }, none, '2026-07-12-方案', '文件名已是 <日>-<名> ⇒ 不再补(否则得到双日期)'],
      [{ rel: 'docs/README.md', created: '2026-07-16' }, none, '2026-07-16-README', '仓内 README'],
      // 撞号:本仓 docs/README.md 与 docs/worklogs/README.md 同名同 created —— 真会发生
      [{ rel: 'docs/worklogs/README.md', created: '2026-07-16' }, (id) => id === '2026-07-16-README', '2026-07-16-worklogs-README', '撞号 ⇒ 前缀父目录名'],
      [{ rel: 'docs/中文名.md', created: '2026-07-16' }, none, '2026-07-16-中文名', '中文原样保留(D-007)'],
      [{ rel: 'docs/带 空格.md', created: '2026-07-16' }, none, '2026-07-16-带-空格', '空格 → `-`(slugify 同一套)'],
      [{ rel: 'docs/名(K).md', created: '2026-07-16' }, none, '2026-07-16-名', '剥 (X) 字母尾(D-007 ①)'],
    ];
    for (const [doc, taken, want, name] of probes) {
      const r = deriveId(doc, taken);
      const pass = r.ok && r.id === want;
      assert(pass, `deriveId ${name}${pass ? '' : `(得 ${JSON.stringify(r)},期望 ${want})`}`);
    }
    // 两级都撞 ⇒ 拒绝,不发一个随便凑的号
    const r = deriveId({ rel: 'docs/a/x.md', created: '2026-07-16' }, () => true);
    assert(!r.ok, 'deriveId 两级消歧都撞 ⇒ 拒绝(不静默凑号)');
  }

  // ── 7. v2→v3:文档 id 播种(第一个改**文档**而非配置的迁移)───────────────────
  const v2 = { ...v1, schemaVersion: 2, types: [{ name: 'design', canBeAuthoritative: true }, { name: 'index', canBeAuthoritative: false }] };
  const doc = (over = {}) => {
    const f = { status: 'active', type: 'design', line: 'x', created: '2026-07-16', ...over };
    return `---\n${Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# 标题\n正文。\n`;
  };
  const withDocs = (cfg, files, fn) => withRepo(cfg, (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, ...rel.split('/'));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    return fn(root);
  });
  const idOf = (root, rel) => parseFrontmatter(readFileSync(join(root, ...rel.split('/')), 'utf8')).data.id;

  withDocs(v2, { 'docs/designs/2026-07-12-方案.md': doc(), 'docs/todo.md': doc({ type: 'index' }) }, (root) => {
    const code = quiet(() => main({ root, t, args: [] }));
    assert(code === 0 && readCfg(root).schemaVersion === LATEST_SCHEMA_VERSION, `v2 起步落盘 schemaVersion → ${LATEST_SCHEMA_VERSION}(逐级走到最新)`);
    assert(idOf(root, 'docs/designs/2026-07-12-方案.md') === '2026-07-12-方案', 'v2 起步为文档播种 id(文件名已带日期则不重复补)');
    assert(idOf(root, 'docs/todo.md') === '2026-07-16-todo', 'v2 起步无日期前缀的文档补 created');
  });

  // 本仓真实形态:同名同 created 的两个 README —— 迁移在自己的 dogfood 仓里第一步就会撞
  withDocs(v2, { 'docs/README.md': doc({ type: 'index' }), 'docs/worklogs/README.md': doc({ type: 'index' }) }, (root) => {
    assert(quiet(() => main({ root, t, args: [] })) === 0, 'v2→v3 同名同 created 的两个 README 能消歧(撞号是真实形态)');
    const ids = [idOf(root, 'docs/README.md'), idOf(root, 'docs/worklogs/README.md')];
    assert(new Set(ids).size === 2 && ids.every(Boolean), `两个 README 得到不同 id(实得 ${JSON.stringify(ids)})`);
  });

  // 已有 id ⇒ 冻结,绝不重算(改名不变的前提)
  withDocs(v2, { 'docs/designs/a.md': doc({ id: '我自己起的号' }) }, (root) => {
    quiet(() => main({ root, t, args: [] }));
    assert(idOf(root, 'docs/designs/a.md') === '我自己起的号', 'v2→v3 不覆盖已有 id(播种只此一次)');
  });

  // ── 对账:配置已是最新版、文档却没到位(存量仓 init 后的真实形态)──────────────
  // 这条是本阶段实测挖出的洞:曾经 `v === LATEST` 就早退,于是 init 出来的存量仓
  // 一个梯子都拿不到——播种代码永远不会执行。
  const vLatest = { ...v2, schemaVersion: LATEST_SCHEMA_VERSION, types: [...v2.types, { name: 'line', canBeAuthoritative: false }] };
  // 线实体 fixture:v4 起 line 引用要有实体;「无事可做」类用例须预置它,否则对账会去播种
  const lineEnt = (slug) => `---\nid: 2026-01-01-线-${slug}\nstatus: active\ntype: line\nline: ${slug}\ncreated: 2026-01-01\n---\n\n# ${slug}\n`;
  withDocs(vLatest, { 'docs/designs/a.md': doc(), 'docs/todo.md': doc({ type: 'index' }) }, (root) => {
    const code = quiet(() => main({ root, t, args: [] }));
    assert(code === 0, '配置已是最新版但文档缺 id ⇒ upgrade 仍干活(不答「已是最新版」了事)');
    assert(idOf(root, 'docs/designs/a.md') === '2026-07-16-a', '对账为最新版仓的存量文档播种 id');
    assert(idOf(root, 'docs/todo.md') === '2026-07-16-todo', '同上,第二篇');
    // 幂等:再跑一次不该有任何动作
    const again = quiet(() => main({ root, t, args: [] }));
    assert(again === 0 && idOf(root, 'docs/designs/a.md') === '2026-07-16-a', '对账幂等:再跑零变更、id 不动');
  });
  withDocs(vLatest, { 'docs/designs/a.md': doc({ id: '已有号' }), 'docs/lines/x.md': lineEnt('x') }, (root) => {
    const before = readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8');
    assert(quiet(() => main({ root, t, args: [] })) === 0, '最新版且文档全有 id、line 全有实体 ⇒ exit 0');
    assert(readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8') === before, '真的无事可做时零写入');
  });
  withDocs(vLatest, { 'docs/designs/a.md': doc() }, (root) => {
    const before = readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8');
    assert(quiet(() => main({ root, t, args: ['--dry-run'] })) === 0, '对账也认 --dry-run');
    assert(readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8') === before, '对账 --dry-run 零写入');
    assert(!existsSync(join(root, 'docs', 'lines')), '对账 --dry-run 不建线实体');
    assert(!existsSync(join(root, '.worklog')), '对账 --dry-run 不落模板/manifest(F-004 同守零写入)');
  });

  // ── F-004:模板/skill 副本漂移——带走(stale)/补齐(missing)/不动(customized/unknown)──
  {
    const tplRelPosix = '.worklog/templates/progress.md';
    withDocs(vLatest, { 'docs/designs/a.md': doc({ id: 'A-1' }), 'docs/lines/x.md': lineEnt('x') }, (root) => {
      const tplAbs = join(root, '.worklog', 'templates', 'progress.md');
      const mfAbs = join(root, '.worklog', 'manifest.json');
      // ① missing → 补齐 + manifest 基线记账(六件:skill + 五模板)
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'F-004 首跑 exit 0(副本缺失→补齐)');
      const mf1 = JSON.parse(readFileSync(mfAbs, 'utf8'));
      assert(existsSync(tplAbs) && existsSync(join(root, '.claude', 'skills', 'planning', 'SKILL.md')), 'F-004 缺失副本已补齐(模板 + skill)');
      assert(Object.keys(mf1.templates ?? {}).length === 6, `F-004 manifest 六件基线记账(实得 ${Object.keys(mf1.templates ?? {}).length})`);
      // ② 幂等:stampedAt 不参与「要不要写」的判定,否则日期一变天天有假变更
      const r2 = capture(() => main({ root, t, args: [] }));
      assert(r2.code === 0 && r2.out.includes('upgrade.alreadyLatest'), 'F-004 二跑零变更(stampedAt 不制造假变更)');
      // ③ stale:副本 ≡ 基线 ≠ 渲染 ⇒ 证明未定制,带走
      const render = readFileSync(tplAbs, 'utf8');
      writeFileSync(tplAbs, '旧版模板\n');
      mf1.templates[tplRelPosix] = hashContent('旧版模板\n');
      writeFileSync(mfAbs, JSON.stringify(mf1, null, 2));
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'F-004 stale 跑 exit 0');
      assert(readFileSync(tplAbs, 'utf8') === render, 'F-004 stale(基线证明未定制)被带走为当前渲染');
      assert(JSON.parse(readFileSync(mfAbs, 'utf8')).templates[tplRelPosix] === hashContent(render), 'F-004 stale 刷新后基线随之更新');
      // ④ customized:副本 ≠ 基线 ≠ 渲染 ⇒ 不动,零变更时注记也照打
      writeFileSync(tplAbs, '用户定制内容\n');
      const r4 = capture(() => main({ root, t, args: [] }));
      assert(r4.code === 0 && readFileSync(tplAbs, 'utf8') === '用户定制内容\n', 'F-004 customized 不覆盖(D-030 方向性安全)');
      assert(r4.out.includes('不覆盖'), 'F-004 customized 注记不被 alreadyLatest 早退吞掉');
      // ⑤ unknown:manifest 丢失 ⇒ 相异副本只报不动;一致副本可安全收编,重建六缺一的基线
      rmSync(mfAbs);
      const r5 = capture(() => main({ root, t, args: [] }));
      const mf3 = JSON.parse(readFileSync(mfAbs, 'utf8'));
      assert(r5.code === 0 && readFileSync(tplAbs, 'utf8') === '用户定制内容\n', 'F-004 unknown(无基线)不动副本');
      assert(!(tplRelPosix in mf3.templates) && Object.keys(mf3.templates).length === 5, 'F-004 unknown 不记账(绝不记录非工具写入),一致副本收编 5 件');
      assert(r5.out.includes('无从判定'), 'F-004 unknown 注记如实');
    });
  }

  // ── v3 → v4:line 收紧为实体引用,实体由对账播种(F-001 门梯同批)────────────
  const v3 = { ...v2, schemaVersion: 3 };
  withDocs(v3, { 'docs/designs/a.md': doc({ id: '2026-01-01-a' }) }, (root) => {
    assert(quiet(() => main({ root, t, args: [] })) === 0, 'v3→v4 exit 0');
    const cfg = readCfg(root);
    assert(cfg.schemaVersion === LATEST_SCHEMA_VERSION, `v3 起步逐级走到最新版(${LATEST_SCHEMA_VERSION})`);
    assert(cfg.types.some((x) => x.name === 'line') && cfg.dirs.includes('lines'), 'v3→v4 实例层补 type line 与 dirs lines');
    const fmEnt = parseFrontmatter(readFileSync(join(root, 'docs', 'lines', 'x.md'), 'utf8')).data;
    assert(fmEnt.type === 'line' && fmEnt.line === 'x' && !!fmEnt.id, '对账从存量 line 值播种实体(type/line/id 齐)');
    assert(quiet(() => main({ root, t, args: [] })) === 0 && readdirSync(join(root, 'docs', 'lines')).length === 1, '实体播种幂等(再跑不重建)');
  });
  // 字母尾归并:`名(X)` 与 `名` 剥尾后同 slug ⇒ 只建一个实体(D-007 ①)
  withDocs(v3, {
    'docs/designs/a.md': doc({ id: '2026-01-01-a', line: '甲线(A)' }),
    'docs/designs/b.md': doc({ id: '2026-01-01-b', line: '甲线' }),
  }, (root) => {
    quiet(() => main({ root, t, args: [] }));
    const names = readdirSync(join(root, 'docs', 'lines')).filter((n) => n.endsWith('.md'));
    assert(names.length === 1 && names[0] === '甲线.md', `字母尾剥离后同 slug 归并为一个实体(实得 ${JSON.stringify(names)})`);
  });
  // 实体 id 与同日播种的文档 id 撞号 ⇒ 共用占号集合、父目录消歧(不再各自维护世界观)
  {
    const TODAY = todayLocal(); // 与引擎同源:UTC 日在本地 0–8 点窗口会与播种 id 差一天
    withDocs(v3, { 'docs/designs/x.md': doc({ created: TODAY }) }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, '文档 id 与线实体 id 同名同日仍能消歧(exit 0)');
      assert(idOf(root, 'docs/designs/x.md') === `${TODAY}-x`, '文档先占号(排序确定)');
      assert(idOf(root, 'docs/lines/x.md') === `${TODAY}-lines-x`, `实体撞号后前缀父目录(实得 ${idOf(root, 'docs/lines/x.md')})`);
    });
  }
  // line 值全非法字符 ⇒ 跳过并注记,不整体拒绝(lineBadSlug 属 baseline 可立账的人判债)
  withDocs(v3, { 'docs/designs/a.md': doc({ id: '2026-01-01-a', line: ':*?' }) }, (root) => {
    assert(quiet(() => main({ root, t, args: [] })) === 0, 'line 值派生不出 slug ⇒ 跳过播种仍 exit 0(人判债不扣自动修的人质)');
    assert(!existsSync(join(root, 'docs', 'lines')), '坏值不产出实体');
  });
  // README 目录职责表补行(索引门三方一致的 README 腿)
  {
    const readme = `---\nid: 2026-01-01-README\nstatus: active\ntype: index\nline: x\ncreated: 2026-01-01\n---\n\n# idx\n\n## 目录职责\n\n| 目录 | 放什么 |\n|---|---|\n| \`designs/\` | x |\n\n## 维护规则\n- x\n`;
    withDocs(v3, { 'docs/README.md': readme, 'docs/designs/a.md': doc({ id: '2026-01-01-a' }) }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'v3→v4 带 README 的仓 exit 0');
      const after = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
      assert(after.includes('| `lines/` |'), 'README 职责表补上 lines/ 行');
      quiet(() => main({ root, t, args: [] }));
      const twice = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
      assert((twice.match(/\| `lines\/` \|/g) || []).length === 1, 'README 补行幂等(不重复插行)');
    });
  }

  // ── v4 → v5:只推版本号与 $schema,不强塞新键(mode 缺省 invariant = 行为不变)──
  {
    const v4 = { ...v2, schemaVersion: 4, types: [...v2.types, { name: 'line', canBeAuthoritative: false }], dirs: [...v1.dirs, 'lines'] };
    withDocs(v4, { 'docs/designs/a.md': doc({ id: '2026-01-01-a' }), 'docs/lines/x.md': lineEnt('x') }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'v4→v5 exit 0');
      const cfg = readCfg(root);
      assert(cfg.schemaVersion === 5 && /worklogrc\.v5\.schema\.json$/.test(cfg.$schema), 'v4→v5 推版本号并改指 v5 schema');
      assert(cfg.index === undefined, 'v4→v5 不强塞 index 键(用户没声明的键迁移不替他发明)');
      assert(loadConfig(root).errors.length === 0, 'v5 产物过配置校验');
    });
  }

  // 三件套与归档件不参与(§7.2 source universe)
  withDocs(v2, {
    'docs/planning/t/task_plan.md': '# 无 frontmatter 的草稿\n',
    'docs/archive/old.md': '> 已归档\n\n# 旧件\n',
    'docs/designs/a.md': doc(),
  }, (root) => {
    quiet(() => main({ root, t, args: [] }));
    assert(idOf(root, 'docs/planning/t/task_plan.md') === undefined, 'v2→v3 不碰三件套(过程件全域豁免)');
    assert(!readFileSync(join(root, 'docs', 'archive', 'old.md'), 'utf8').includes('id:'), 'v2→v3 不碰归档件(横幅式归档件零迁移)');
    assert(idOf(root, 'docs/designs/a.md') === '2026-07-16-a', '同批的活区文档照常播种');
  });

  // 归档件声明的 id(if-id,D-020)必须进占号集合——否则播种撞号、复验放行,
  // 随后 check 红 docs.idDuplicate 且按 D-013 不可 baseline:梯子制造自己修不了的违规
  const archived = (id) => `---\n${id ? `id: ${id}\n` : ''}status: archived\ntype: design\nline: x\ncreated: 2020-01-01\n---\n\n> 已归档\n\n# 旧件\n`;
  withDocs(v2, { 'docs/archive/old.md': archived('2026-07-16-a'), 'docs/designs/a.md': doc() }, (root) => {
    assert(quiet(() => main({ root, t, args: [] })) === 0, '播种避开归档件声明的 id(if-id 占号,exit 0)');
    const id = idOf(root, 'docs/designs/a.md');
    assert(id === '2026-07-16-designs-a', `撞归档件 id 后前缀父目录消歧(实得 ${id})`);
  });
  // 复验与门同域:活区 id 与归档件声明 id 相同 ⇒ verify 必须抓到(不再跳过归档件)
  withDocs(vLatest, {
    'docs/archive/old.md': archived('2026-01-01-撞'),
    'docs/designs/a.md': doc({ id: '2026-01-01-撞' }),
    'docs/lines/x.md': lineEnt('x'),
  }, (root) => {
    const errs = RECONCILERS[LATEST_SCHEMA_VERSION].verify(root);
    assert(errs.length === 1 && errs[0].includes('撞号'), '复验抓到活区与归档件的 id 撞号');
  });

  // 混合行尾(首行 LF、正文 CRLF):id 须插在 frontmatter 内,不得落进正文
  {
    const out = insertIdLine('---\nstatus: active\n---\r\n\r\n# 标题\r\n', 'X');
    assert(out === '---\nid: X\nstatus: active\n---\r\n\r\n# 标题\r\n', `insertIdLine 混合行尾按首行行尾插入(实得 ${JSON.stringify(out)})`);
  }
  withDocs(v2, { 'docs/designs/a.md': '---\nstatus: active\r\ntype: design\r\nline: x\r\ncreated: 2026-07-16\r\n---\r\n\r\n# 标题\r\n' }, (root) => {
    assert(quiet(() => main({ root, t, args: [] })) === 0, '混合行尾文档也能播种(曾:插进正文→复验失败→该类文件永远播不了)');
    assert(idOf(root, 'docs/designs/a.md') === '2026-07-16-a', '混合行尾播种的 id 落在 frontmatter 内');
  });

  // ── 迁移四件事 ②③④:字母登记表归并/退役 + 三类失配报告 + todo 分节改写 ────────
  // 合成 fixture 覆盖 §8 D-004 六类形态:①登记表 ②语义值(中文+下划线两风格)
  // ③混合 `名(X)` ④野号 ⑤死号 ⑥表外线(实测多数,最不能漏)。内容全假(D-004)。
  {
    const registry = [
      '## 工作线字母登记表', '',
      '> 新立项先来此取号(legacy 取号规则,白纸黑字)', '',
      '| 字母 | 工作线 | 立项 | 权威文档 |',
      '|---|---|---|---|',
      '| A | 甲线 | 2026-01-02 | repo:x.md |',
      '| B | 死线 | 2026-01-03 | — |',
      '| D | 乙线 | 2026-01-04 | [乙案](designs/b.md) |',
    ].join('\n');
    const readmeReg = `---\nstatus: active\ntype: index\nline: 甲线\ncreated: 2026-01-01\n---\n\n# idx\n\n## 目录职责\n\n| 目录 | 放什么 |\n|---|---|\n| \`designs/\` | x |\n\n${registry}\n\n## 维护规则\n- x\n`;
    const todoReg = `---\nstatus: active\ntype: index\nline: 甲线\ncreated: 2026-01-01\n---\n\n# 滚动\n\n## A. 甲线\n\n- 事项\n\n## Z. 附录编号不该动\n\n- x\n`;
    const cfgReg = { ...v3, dispositions: [...v1.dispositions, { name: 'todo', targetKind: 'fixed', target: 'docs/todo.md' }] };
    withDocs(cfgReg, {
      'docs/README.md': readmeReg,
      'docs/todo.md': todoReg,
      'docs/designs/a.md': doc({ id: '2026-01-01-a', line: '甲线' }),
      'docs/designs/b.md': doc({ id: '2026-01-01-b', line: '乙线(D)' }),
      'docs/designs/c.md': doc({ id: '2026-01-01-c', line: '丙线(T)' }),
      'docs/designs/d.md': doc({ id: '2026-01-01-d', line: '表外线一' }),
      'docs/designs/e.md': doc({ id: '2026-01-01-e', line: 'refactor_x' }),
    }, (root) => {
      const cap = [];
      const log = console.log, err = console.error;
      console.log = (...a) => cap.push(a.join(' ')); console.error = console.log;
      let code; try { code = main({ root, t, args: [] }); } finally { console.log = log; console.error = err; }
      const out = cap.join('\n');
      assert(code === 0, '登记表仓 upgrade exit 0');
      const names = new Set(readdirSync(join(root, 'docs', 'lines')));
      assert(names.size === 5 && ['甲线.md', '乙线.md', '丙线.md', '表外线一.md', 'refactor_x.md'].every((n) => names.has(n)),
        `①实体 = 五条被引用的线,死号不建实体(实得 ${JSON.stringify([...names])})`);
      const jia = readFileSync(join(root, 'docs', 'lines', '甲线.md'), 'utf8');
      const jiaFm = parseFrontmatter(jia).data;
      assert(jiaFm.created === '2026-01-02' && jiaFm.id === '2026-01-02-甲线', '②归并:立项日成为实体 created 与 id 日期');
      assert(jia.includes('权威文档:repo:x.md') && jia.includes('登记表 A 行'), '②归并:权威文档/出处写进实体正文(人工判断两列保留)');
      const yi = readFileSync(join(root, 'docs', 'lines', '乙线.md'), 'utf8');
      const yiFm = parseFrontmatter(yi).data;
      assert(yiFm.created === '2026-01-04', '②混合形态 `名(X)` 剥尾后仍与登记表行归并');
      assert(yi.includes('](../designs/b.md)') && jia.includes('权威文档:repo:x.md'),
        '②归并:格内相对链接 rebase ../(README 根 → lines/ 深一级),repo:/scheme 原样');
      assert(out.includes('死号') && out.includes('B(死线)'), '③死号上报 B(表有字母无引用)');
      assert(out.includes('野号') && out.includes('T(丙线(T))'), '③野号上报 T(在野未登记)');
      assert(out.includes('表外线') && out.includes('表外线一') && out.includes('refactor_x'), '③表外线上报(实测多数形态,最不能漏)');
      const rm = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
      assert(rm.includes('本表已退役') && !rm.includes('| A | 甲线 |'), '②登记表节改退役横幅,数据行不再留 README');
      assert(rm.includes('| `lines/` |'), 'README 同一笔变更兼补 lines/ 行');
      const td = readFileSync(join(root, 'docs', 'todo.md'), 'utf8');
      assert(td.includes('## 甲线') && !td.includes('## A. 甲线'), '④todo 分节号 A. 退役');
      assert(td.includes('## Z. 附录编号不该动'), '④不在登记表的字母前缀不动(机器不猜)');
      const before = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
      assert(quiet(() => main({ root, t, args: [] })) === 0 && readFileSync(join(root, 'docs', 'README.md'), 'utf8') === before,
        '退役后幂等:再跑 README 零变更(找不到表 = 全程 no-op)');
    });
    // 同文件双笔变更叠加:README/todo 同批既播 id 又被改写,第二笔必须叠在第一笔之上
    withDocs(cfgReg, {
      'docs/README.md': readmeReg,
      'docs/todo.md': todoReg,
      'docs/designs/a.md': doc({ line: '甲线' }),
    }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, '叠加仓 upgrade exit 0');
      const rm = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
      const td = readFileSync(join(root, 'docs', 'todo.md'), 'utf8');
      assert(!!parseFrontmatter(rm).data.id && rm.includes('本表已退役') && rm.includes('| `lines/` |'), 'README:id 播种 + 退役 + 补行三笔叠加皆生效');
      assert(!!parseFrontmatter(td).data.id && td.includes('## 甲线') && !td.includes('## A. '), 'todo:id 播种 + 分节改写两笔叠加皆生效');
    });
    // dry-run:登记表迁移同样零写入
    withDocs(cfgReg, { 'docs/README.md': readmeReg, 'docs/designs/a.md': doc({ id: '2026-01-01-a', line: '甲线' }) }, (root) => {
      const before = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
      assert(quiet(() => main({ root, t, args: ['--dry-run'] })) === 0, '登记表仓 --dry-run exit 0');
      assert(readFileSync(join(root, 'docs', 'README.md'), 'utf8') === before && !existsSync(join(root, 'docs', 'lines')), '登记表迁移 --dry-run 零写入');
    });
  }

  // ── generated 档数据布局对账(阶段 4 下半;R3-3 改档=迁移,F-001 门梯同批)────────
  {
    const cfgGen = {
      ...v2, schemaVersion: 5,
      dirs: ['designs', 'lines', 'worklogs'],
      types: [...v2.types, { name: 'line', canBeAuthoritative: false }],
      dispositions: [...v1.dispositions, { name: 'todo', targetKind: 'fixed', target: 'docs/todo.md' }],
      index: { mode: 'generated' },
    };
    const lineFm = (slug, status = 'active') => `---\nid: 2026-01-01-线-${slug}\nstatus: ${status}\ntype: line\nline: ${slug}\ncreated: 2026-01-01\n---\n\n# ${slug}\n`;
    const todoGen = `---\nid: 2026-01-01-滚动\nstatus: active\ntype: index\nline: 甲线\ncreated: 2026-01-01\n---\n\n# 滚动状态\n\n## 甲线\n\n- 甲线待办一\n- 甲线待办二\n\n## 丁线\n\n- 无实体的孤儿分节\n`;
    const closeoutGen = `---\nid: 2026-01-01-台账\nstatus: snapshot\ntype: closeout\nline: 甲线\ncreated: 2026-01-01\n---\n\n# c\n\n| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |\n|---|---|---|---|---|---|---|\n| D-001 | todo | repo:docs/todo.md | — | new | — | yes |\n`;
    const genFiles = {
      'docs/lines/甲线.md': lineFm('甲线'),
      'docs/lines/乙线.md': lineFm('乙线'),
      'docs/lines/丙线.md': lineFm('丙线', 'archived'),
      'docs/todo.md': todoGen,
      'docs/designs/a.md': doc({ id: '2026-01-01-a', line: '甲线' }),
      'docs/worklogs/t/closeout.md': closeoutGen,
      'docs/worklogs/t/task_plan.md': '# 草\n',
      'docs/worklogs/t/findings.md': '# 草\n',
      'docs/worklogs/t/progress.md': '# 草\n',
    };
    withDocs(cfgGen, genFiles, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'generated 档对账 exit 0');
      const cfgAfter = readCfg(root);
      assert(cfgAfter.dirs.includes('status') && cfgAfter.types.some((x) => x.name === 'rolling-status'), '①配置腿:dirs 补 status、types 补 rolling-status');
      const td = cfgAfter.dispositions.find((d) => d.name === 'todo');
      assert(td.targetKind === 'line-status' && td.statusDir === 'docs/status' && td.target === undefined, '①todo 处置 fixed → line-status(statusDir 落 docs/status,旧 target 不残留)');
      const co = readFileSync(join(root, 'docs', 'worklogs', 't', 'closeout.md'), 'utf8');
      assert(co.includes('repo:docs/status/甲线.md') && !co.includes('repo:docs/todo.md'), '②closeout 台账 todo 行改指线状态分片(D-023:契约迁移随迁台账)');
      const jia = readFileSync(join(root, 'docs', 'status', '甲线.md'), 'utf8');
      const jiaFm = parseFrontmatter(jia).data;
      assert(jiaFm.type === 'rolling-status' && jiaFm.line === '甲线' && !!jiaFm.id, '③分片 frontmatter 齐(type/line/id)');
      assert(jia.includes('甲线待办一') && jia.includes('甲线待办二'), '④todo 甲线分节正文迁入分片');
      assert(existsSync(join(root, 'docs', 'status', '乙线.md')), '③无 todo 分节的活线也得占位分片');
      assert(!existsSync(join(root, 'docs', 'status', '丙线.md')), '③归档线不建分片(墓碑不滚动)');
      const tdRaw = readFileSync(join(root, 'docs', 'todo.md'), 'utf8');
      assert(tdRaw.includes('已迁入 `docs/status/甲线.md`') && !tdRaw.includes('甲线待办一'), '④todo 原分节改指路一行');
      assert(tdRaw.includes('本文件退役') && tdRaw.includes('- 无实体的孤儿分节'), '④退役横幅落位;孤儿分节原样保留(注记人工)');
      assert(readFileSync(join(root, '.gitignore'), 'utf8').includes('.worklog/generated/'), '⑥.gitignore 补生成物目录');
      assert(loadConfig(root).errors.length === 0, '产物配置过校验');
      // 幂等:重跑零变更
      const snap = ['docs/todo.md', 'docs/status/甲线.md', 'docs/worklogs/t/closeout.md', '.gitignore']
        .map((p) => readFileSync(join(root, ...p.split('/')), 'utf8'));
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'generated 对账幂等 exit 0');
      const snap2 = ['docs/todo.md', 'docs/status/甲线.md', 'docs/worklogs/t/closeout.md', '.gitignore']
        .map((p) => readFileSync(join(root, ...p.split('/')), 'utf8'));
      assert(JSON.stringify(snap) === JSON.stringify(snap2), 'generated 对账幂等:重跑关键文件零变更');
    });
    // dry-run 零写入
    withDocs(cfgGen, genFiles, (root) => {
      assert(quiet(() => main({ root, t, args: ['--dry-run'] })) === 0, 'generated 对账 --dry-run exit 0');
      assert(!existsSync(join(root, 'docs', 'status')) && !existsSync(join(root, '.gitignore')), 'generated 对账 --dry-run 零写入');
    });
    // 全孤儿分节的 todo 也要退役横幅(实测本仓即此形态:横幅与「有没有分节被迁走」无关)
    withDocs(cfgGen, {
      'docs/lines/甲线.md': lineFm('甲线'),
      'docs/todo.md': `---\nid: 2026-01-01-滚动\nstatus: active\ntype: index\nline: 甲线\ncreated: 2026-01-01\n---\n\n# 滚动状态\n\n## 待办\n\n- 事项\n`,
    }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, '全孤儿 todo 仓 exit 0');
      const td = readFileSync(join(root, 'docs', 'todo.md'), 'utf8');
      assert(td.includes('本文件退役') && td.includes('- 事项'), '全孤儿分节:退役横幅仍落位,内容原样保留');
    });
    // tier B B8:围栏内的 `## 乙线` 是示例不是分节——fence-blind 扫描曾把它当真分节:
    // 示例内容被迁进乙线分片、甲线正文在示例处被截断
    withDocs(cfgGen, {
      'docs/lines/甲线.md': lineFm('甲线'),
      'docs/lines/乙线.md': lineFm('乙线'),
      'docs/todo.md': `---\nid: 2026-01-01-滚动\nstatus: active\ntype: index\nline: 甲线\ncreated: 2026-01-01\n---\n\n# 滚动状态\n\n## 甲线\n\n- 真待办\n\n\`\`\`md\n## 乙线\n- 围栏内示例\n\`\`\`\n\n- 围栏后的甲线待办\n`,
    }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'B8:含围栏示例分节的 todo 对账 exit 0');
      const jia = readFileSync(join(root, 'docs', 'status', '甲线.md'), 'utf8');
      assert(jia.includes('真待办') && jia.includes('围栏内示例') && jia.includes('围栏后的甲线待办'),
        'B8:围栏示例及其后的正文都留在甲线分节(假分节不截断)');
      assert(!readFileSync(join(root, 'docs', 'status', '乙线.md'), 'utf8').includes('围栏内示例'),
        'B8:乙线分片不含围栏内示例(fence-blind 曾把示例当真分节迁走)');
    });
    // R6-04:brownfield 直接声明 generated 再首跑 upgrade——线实体与分片**同批**播种。
    // 原缺陷:分片集合只扫盘上 graph,同批待播实体拿不到分片 → 写后复验必败 → 整体回滚
    // → 重跑同败(死锁);--dry-run 不跑复验,预览一切正常,坑只在真跑时炸。
    // 旧 fixture 把全部 lines/*.md 预置在盘上,「实体待播 ∧ 已是 generated」从未同批出现。
    withDocs(cfgGen, {
      'docs/designs/a.md': doc({ id: '2026-01-01-a', line: '甲线' }),
    }, (root) => {
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'R6-04:同批待播线实体的 generated 首跑 exit 0(不死锁)');
      assert(existsSync(join(root, 'docs', 'lines', '甲线.md')), 'R6-04:线实体同批播种落盘');
      assert(existsSync(join(root, 'docs', 'status', '甲线.md')), 'R6-04:同批新实体也拿到状态分片');
      assert(quiet(() => main({ root, t, args: [] })) === 0, 'R6-04:重跑幂等 exit 0');
    });
  }

  // 缺 created ⇒ id 不可派生 ⇒ **整体拒绝、零写入**(半迁移会让梯子永久消失,见 migrateV2toV3)
  withDocs(v2, { 'docs/designs/a.md': doc({ created: undefined }), 'docs/designs/b.md': doc() }, (root) => {
    const code = quiet(() => main({ root, t, args: [] }));
    assert(code === 2, 'v2→v3 有文档缺 created 时拒绝迁移 exit 2(不编日期、不半迁移)');
    assert(readCfg(root).schemaVersion === 2, '拒绝时配置不动');
    assert(idOf(root, 'docs/designs/b.md') === undefined, '拒绝时零写入:同批本可播种的文档也不动');
    assert(readdirSync(join(root, 'docs', 'designs')).every((n) => !n.includes('.bak-')), '拒绝时不留备份(压根没写)');
  });

  // 未知标志不当作「带个无关参数的真跑」——upgrade 是唯一重写文件的命令
  withDocs(v2, { 'docs/designs/a.md': doc() }, (root) => {
    const code = quiet(() => main({ root, t, args: ['--dry-runn'] }));
    assert(code === 2 && readCfg(root).schemaVersion === 2, '未知标志 exit 2 且零写入(--dry-runn 手滑不该变成真迁移)');
  });

  // dry-run 零写入:文档也不许动
  withDocs(v2, { 'docs/designs/a.md': doc() }, (root) => {
    const before = readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8');
    quiet(() => main({ root, t, args: ['--dry-run'] }));
    assert(readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8') === before, 'v2→v3 --dry-run 对文档零写入');
  });

  // 行尾原样保留:迁移是加一个字段,不是把用户的文件重新格式化一遍
  withDocs(v2, { 'docs/designs/a.md': doc().replaceAll('\n', '\r\n') }, (root) => {
    quiet(() => main({ root, t, args: [] }));
    const after = readFileSync(join(root, 'docs', 'designs', 'a.md'), 'utf8');
    assert(!/(?<!\r)\n/.test(after) && after.includes('id: 2026-07-16-a\r\n'), 'v2→v3 保留 CRLF 行尾(不制造满屏 EOL 噪声淹没真变更)');
  });

  // ── tier B B10:apply 失败路径直测——回滚连新建目录一并撤,.bak 留作取证 ────────
  // 残留空目录会改 index 门「实际目录」判定(三方一致凭空多一腿):失败的迁移留下门红。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-upgrade-rollback-'));
    try {
      const okCfg = {
        schemaVersion: LATEST_SCHEMA_VERSION, docsDir: 'docs', dirs: ['designs'], status: ['active'],
        types: [{ name: 'design', canBeAuthoritative: true }],
        dispositions: [{ name: 'experience', targetKind: 'docs' }],
      };
      const cfgBefore = JSON.stringify(okCfg, null, 2);
      writeFileSync(join(root, CONFIG_NAME), cfgBefore);
      const changes = [
        { path: CONFIG_NAME, content: `${cfgBefore}\n// 迁移改笔\n`, desc: 'x' },
        { path: 'docs/lines/新线.md', content: '# 新\n', desc: 'x' }, // docs/ 与 docs/lines/ 两级均新建
      ];
      const r = applyChanges(root, changes, '20260101000000', [() => ['注入的复验失败']]);
      assert(r.ok === false && r.restored === true, 'B10:复验失败 ⇒ 整体回滚(restored)');
      assert(readFileSync(join(root, CONFIG_NAME), 'utf8') === cfgBefore, 'B10:既有文件按 .bak 逐字节还原');
      assert(!existsSync(join(root, 'docs')), 'B10:本批新建的目录逐级撤除(docs/ 与 docs/lines/ 都不残留)');
      assert(existsSync(join(root, `${CONFIG_NAME}.bak-20260101000000`)), 'B10:.bak 留作取证不删');
      // 目录里有**非本批**内容 ⇒ 只还原文件、目录留下(rmdirSync 非递归的取证安全面)
      mkdirSync(join(root, 'docs'), { recursive: true });
      writeFileSync(join(root, 'docs', '用户手记.md'), '# 手记\n');
      const r2 = applyChanges(root, [{ path: 'docs/lines/新线.md', content: '# 新\n', desc: 'x' }], '20260101000001', [() => ['再次注入失败']]);
      assert(r2.ok === false && existsSync(join(root, 'docs', '用户手记.md')) && existsSync(join(root, 'docs'))
        && !existsSync(join(root, 'docs', 'lines')), 'B10:携用户内容的目录留、纯本批新建的子目录撤');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  console.log(failed ? `\n✗ upgrade selftest 失败 ${failed} 项` : '\n✓ upgrade selftest 全部通过');
  return failed ? 1 : 0;
}
