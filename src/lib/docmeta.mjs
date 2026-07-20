// 文档 frontmatter 元数据契约 + source universe(方案 §4.1 item1 字段表、§7.2 表)。
//
// 字段集属**元模型**(D-003):固定、由 schemaVersion 编号、变更须附迁移;
// 具体枚举值(status/type 有哪几个)属实例,由配置声明。
//
// 为什么字段表是**数据**而非一串 if:三处要读它——门禁校验、v2→v3 迁移播种、
// 以及「设计表 ≡ 代码表」的 selftest。写成 if 的话第三处就无从谈起,设计正文那张表
// 会安静地漂移成一份文档化的愿望。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { walk, relPath, DOCS_SKIP } from './fsutil.mjs';
import { parseFrontmatter, FM_DELIM_RE } from './frontmatter.mjs';
import { slugify, isNFC } from './slug.mjs';
import { isValidDateStr } from './dates.mjs';

/** 过程件文件名(三件套):未蒸馏的工作记忆,收口即冻结,全域豁免 */
export const TRIO = new Set(['task_plan.md', 'findings.md', 'progress.md']);

/**
 * 线实体目录名(§4.1 item2 ⑥,阶段 2)。与 `archive/`/`planning/`/`worklogs/` 同级的
 * **固定约定**,不入配置:它是 v4 数据布局的一部分(`line` 引用按 `<docsDir>/lines/<slug>.md`
 * 解析),可配的话引用语义就随配置漂,upgrade 播种、引用门、生成器三处要各自跟着猜。
 */
export const LINES_DIR = 'lines';

/**
 * frontmatter 字段表(方案 §4.1 item1)。
 *
 * `ladder` = 该字段缺失时用户爬哪把梯子(F-001「不得只上门不给梯子」的落点):
 *   - `upgrade`:值可由既有数据**机械派生**(`id` = `<created>-<文件名 slug>`),迁移全自动;
 *   - `baseline`:值是**人工判断**,机器派生不出来(`line`:机器不知道一篇文档属于哪条线),
 *     存量债只能立账豁免、只对新文档 enforce。
 * 判据就是「机器能否派生」——不是「这个字段重不重要」。
 */
export const DOC_FIELDS = [
  { name: 'id', required: true, kind: 'token', ladder: 'upgrade', rule: 'docs.idMissing' },
  { name: 'status', required: true, kind: 'enum', ladder: 'baseline', rule: 'docs.statusInvalid' },
  { name: 'type', required: true, kind: 'enum', ladder: 'baseline', rule: 'docs.missingType' },
  { name: 'line', required: true, kind: 'text', ladder: 'baseline', rule: 'docs.lineMissing' },
  { name: 'created', required: true, kind: 'date', ladder: 'baseline', rule: 'docs.missingCreated' },
  { name: 'title', required: false, kind: 'text', ladder: null, rule: null },
  { name: 'summary', required: false, kind: 'text', ladder: null, rule: null },
  { name: 'authoritative', required: false, kind: 'bool', ladder: null, rule: null },
  { name: 'authorityScope', required: false, kind: 'text', ladder: null, rule: null },
  { name: 'supersedes', required: false, kind: 'idref', ladder: null, rule: null },
  { name: 'supersededBy', required: false, kind: 'idref', ladder: null, rule: null },
  { name: 'owner', required: false, kind: 'text', ladder: null, rule: null },
];

const FIELD = new Map(DOC_FIELDS.map((f) => [f.name, f]));

/**
 * `id` 合法性。它不是文件名,故不必过 slugify 的文件系统字符集;要挡的是三件事:
 *   - 空白:`id` 是 token,带空白的 id 在人眼里与相邻列难分,且无法安全放进锚点;
 *   - `|`:会把 markdown 表格切成两半(生成式索引要把 id 放进表格单元);
 *   - `/` `\`:会被误读为路径,而 id 恰恰是**不挂路径**的那个标识(改名不变)。
 * NFC 断言同 D-007:含假名/谚文/重音拉丁的 id 不归一就会有两个「看起来相同」的值。
 */
export const isValidId = (s) => !!s && !/[\s|/\\]/.test(s) && isNFC(s);

/** 布尔字面量:只认 true/false。YAML 的 yes/on/1 一概不认——多一种写法就多一条漏判路径 */
const BOOL = new Set(['true', 'false']);

/**
 * 文档分类:source universe 的机器真源(方案 §7.2 表)。
 * @param {object} config
 * @param {string} rel 仓根相对路径(`/` 分隔)
 * @returns {{cls: 'trio'|'event'|'archive'|'governed', links: boolean, frontmatter: boolean, banner: boolean, graph: boolean|'if-id', index: boolean}}
 */
export function classifyFile(config, rel) {
  const d = config.docsDir;
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  // event(P3 设计件 §2):team 任务的 `<任务>/progress/**` 全归此类——与 trio 同为过程件
  // 全域豁免(零 frontmatter,D-027),契约在**文件名**,由 E2/E3 专属文法门守(非本表职责)。
  // 覆盖整个 progress/ 子树而不只 events/:杂物(progress/notes.md)落 governed 的话
  // 会红出一串误导的 frontmatter 缺失,而它真正的病是「不该在这」——E2 报得更准。
  // R6-02:docsDir 允许多段(schema/isSafeRelPath 均放行 `docs/sub`),故先剥 `${d}/`
  // 前缀再按段判——按绝对段下标(seg[0]===d)隐含单段假设,多段时 event 全落 governed,
  // 每个事件文件红 frontmatter 缺失,D-027 全域豁免破产。
  const seg = rel.startsWith(`${d}/`) ? rel.slice(d.length + 1).split('/') : [];
  if ((seg[0] === 'worklogs' || seg[0] === 'planning') && seg[2] === 'progress' && seg.length >= 4) {
    return { cls: 'event', links: false, frontmatter: false, banner: false, graph: false, index: false };
  }
  if ((rel.startsWith(`${d}/worklogs/`) || rel.startsWith(`${d}/planning/`)) && TRIO.has(base)) {
    return { cls: 'trio', links: false, frontmatter: false, banner: false, graph: false, index: false };
  }
  if (rel.startsWith(`${d}/archive/`)) {
    // graph='if-id':归档件**声明了 id 才参与**取代图与唯一性。理由见 §7.2 表下注——
    // 归档是 git mv,frontmatter 随文件走,故正常归档的文档自带 id、自动继续参与;
    // 横幅式历史归档件(Scrollery 实测 28 篇)无 frontmatter,零迁移即合法。
    return { cls: 'archive', links: false, frontmatter: false, banner: true, graph: 'if-id', index: false };
  }
  // closeout 是处置台账,不是知识本体(§7.2 表:index ⬜)——其余门全按 governed 走。
  // 此格在生成器(阶段 4)上线前无人读,曾与设计表漂移(index 误为 true),对齐于此。
  if (rel.startsWith(`${d}/worklogs/`) && base === 'closeout.md') {
    return { cls: 'governed', links: true, frontmatter: true, banner: false, graph: true, index: false };
  }
  return { cls: 'governed', links: true, frontmatter: true, banner: false, graph: true, index: true };
}

/**
 * 图参与者扫描:source universe「id/取代图」列的**机器兑现**(F-014,阶段 3 抽取)。
 *
 * 此前「谁参与图」散在四处各答一遍(check 的占号循环、upgrade 的 id 播种、两个写后
 * 复验),阶段 3 的图不变量本要成为第五处——同一语义两份实现正是阶段 1 Review 认定的
 * 缺陷母题,故先收敛再加门。返回:
 *   - governed 且有 frontmatter 的文档(`graph: true`,`data` 全量可读);
 *   - archive 中**声明了 id** 的文档(`graph: 'if-id'`,D-020:取代关系挂 id,归档后
 *     仍须参与唯一性与成对校验,否则 supersedes 指向归档件即成盲区)。
 * 排序确定:「谁先占号」不随 readdir 的平台差异漂移。排的是 **rel**(`/` 分隔)而非
 * 绝对路径(R6-09)——绝对路径含平台分隔符,`\`(0x5C)与 `/`(0x2F)码位序不同,
 * 撞号首占归属会随平台反转,而 id 落盘即冻结;init 的 seedIds 亦按 rel 排,两处同标。
 *
 * @returns {{abs: string, rel: string, cls: string, graph: true|'if-id', data: Record<string,string>, body: string}[]}
 */
export function collectGraphDocs(root, config) {
  const out = [];
  const files = walk(join(root, config.docsDir), ['.md'], DOCS_SKIP)
    .map((abs) => ({ abs, rel: relPath(root, abs) }))
    .sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
  for (const { abs, rel } of files) {
    const c = classifyFile(config, rel);
    if (!c.frontmatter && c.graph !== 'if-id') continue; // 三件套:全域豁免
    const { hasFm, data, body } = parseFrontmatter(readFileSync(abs, 'utf8'));
    if (c.graph === 'if-id') {
      if (hasFm && data.id) out.push({ abs, rel, cls: c.cls, graph: 'if-id', data, body });
      continue;
    }
    if (!hasFm) continue; // 缺 frontmatter 归 missingFrontmatter 管,不是图的输入
    out.push({ abs, rel, cls: c.cls, graph: true, data, body });
  }
  return out;
}

/**
 * 占号图:id → 首个声明它的图参与者(F-014「already-taken id set」的唯一实现)。
 * governed 文档的**非法** id 不占号(它已由 idInvalid 单独报,再叠 idDuplicate 是噪声;
 * 且机器派生的 id 恒为合法形态,不可能与非法串相撞);归档件声明了什么就占什么——
 * 它豁免字段门,占号是它参与图的唯一方式,不占的话播种会撞上它。
 * @param {(id: string, g: object, prev: object) => void} [onDup] 撞号回调(后者、先占者)
 */
export function collectIds(graphDocs, onDup) {
  const byId = new Map();
  for (const g of graphDocs) {
    const id = g.data.id;
    if (!id) continue;
    if (g.graph === true && !isValidId(id)) continue;
    const prev = byId.get(id);
    if (prev) onDup?.(id, g, prev);
    else byId.set(id, g);
  }
  return byId;
}

/**
 * 仓根**文件**(非递归)。R4-11 结案:`sourceRoots` 解析只收顶层**目录**,
 * 于是仓根 `README.md` 里写 `docs/gone.md` 时 1a(只走 docsDir 之下)与 1b(只走目录)
 * **两门皆盲**。`auto` 时并扫仓根文件;显式数组时须用 `"."` 点名。
 */
export function repoRootFiles(root, config, exts) {
  const skip = new Set([config.docsDir, ...(config.sourceExclude || [])]);
  return readdirSync(root)
    .filter((n) => !skip.has(n) && exts.some((e) => n.endsWith(e)))
    .filter((n) => { try { return statSync(join(root, n)).isFile(); } catch { return false; } })
    .map((n) => join(root, n));
}

/** `sourceRoots` 是否要求并扫仓根文件(`auto` 隐含;显式数组须写 `"."`) */
export const wantsRepoRoot = (config) =>
  config.sourceRoots === 'auto' || (Array.isArray(config.sourceRoots) && config.sourceRoots.includes('.'));

/**
 * 播种 `id`(v2→v3 迁移用;**仅一次性**,之后该值冻结在文件里,永不重算)。
 * 规则见 §4.1 item1:文件名 slug → 无日期前缀则补 `created-` → 撞号则再前缀父目录名 → 仍撞则拒绝。
 *
 * ⚠️ 撞号不是理论风险:本仓 `docs/README.md` 与 `docs/worklogs/README.md` 同名同 created,
 * 第二步之后二者均为 `<created>-README` —— 迁移命令在自己的 dogfood 仓里第一步就会撞。
 *
 * @param {{rel: string, created: string}} doc rel = 仓根相对路径
 * @param {(id: string) => boolean} taken 该 id 是否已被占用
 * @returns {{ok: true, id: string, note?: string} | {ok: false, id: string}}
 */
export function deriveId({ rel, created }, taken) {
  const parts = rel.split('/');
  const stem = slugify(parts[parts.length - 1].replace(/\.md$/i, ''));
  const parent = parts.length >= 2 ? slugify(parts[parts.length - 2]) : '';
  // 文件名已是 `<日>-<名>` 形态就不再补日期——否则得到 `2026-07-12-2026-07-12-方案`
  const mk = (s) => (/^\d{4}-\d{2}-\d{2}-/.test(s) ? s : `${created}-${s}`);
  const first = mk(stem);
  if (!taken(first)) return { ok: true, id: first };
  const second = mk(parent ? `${parent}-${stem}` : stem);
  if (second !== first && !taken(second)) return { ok: true, id: second, note: `${first} 撞号,已前缀父目录名` };
  return { ok: false, id: first };
}

/**
 * 校验单篇文档的 frontmatter 字段(不含跨文档的 id 唯一性——那要全量扫完才判,见调用方)。
 *
 * @param {{data: Record<string,string>, config: object, rep: (rule: string, params?: object) => void}} o
 */
export function validateDocMeta({ data, config, rep }) {
  const statusSet = new Set(config.status);
  const typeByName = new Map(config.types.map((x) => [x.name, x]));
  const deprecated = new Set(config.deprecatedStatuses || []);

  // ── 必填四项(status/type/created 沿用既有 rule key:它们是 baseline 的钥匙,改名即失配)──
  const status = data.status;
  if (!status || !statusSet.has(status)) rep('docs.statusInvalid', { status: status ?? '无', allowed: config.status.join('|') });
  else if (deprecated.has(status)) rep('docs.statusDeprecated', { status, docsDir: config.docsDir });

  const type = data.type;
  if (!type) rep('docs.missingType');
  else if (!typeByName.has(type)) rep('docs.typeInvalid', { type, allowed: [...typeByName.keys()].join('|') });

  // N3(第七轮复核 §3):形态 + 日历语义——`2026-99-99` 曾过纯形态正则;
  // 事件时间戳早有 Date.UTC 往返校验,created 同术同罚(isValidDateStr 单一实现)。
  if (!isValidDateStr(data.created)) rep('docs.missingCreated');

  // `line`:阶段 1 只要求**存在**;阶段 2 收紧为 `lines/<slug>.md` 实体引用(F-001:门与梯子同批)
  if (!data.line) rep('docs.lineMissing');

  // `id`:阶段 1 新增必填。梯子 = `worklog-kit upgrade`(机器可派生),故**不入 baseline 允许清单**
  const id = data.id;
  if (!id) rep('docs.idMissing');
  else if (!isValidId(id)) rep('docs.idInvalid', { id });

  // ── 可选项:声明了就不许是空值 ──────────────────────────────────────────────
  // `title: ` 这种空声明比不写更坏:它看着像已经填了。缺省回落 H1 是明确的契约,
  // 空字符串则两头不靠——既没回落、也没内容。
  for (const f of DOC_FIELDS) {
    if (f.required) continue;
    if (f.name in data && data[f.name] === '') rep('docs.fieldEmpty', { field: f.name });
  }

  // `authoritative`:只认字面量 true/false
  if ('authoritative' in data && data.authoritative !== '' && !BOOL.has(data.authoritative)) {
    rep('docs.boolInvalid', { field: 'authoritative', value: data.authoritative });
  }
  // 权威**资格**由 types 元模型判(v2 的 canBeAuthoritative 槽位),不靠 type 名字猜语义
  if (data.authoritative === 'true' && type && typeByName.get(type)?.canBeAuthoritative === false) {
    rep('docs.authoritativeNotAllowed', { type });
  }
  // 死配置同治:与 §7.4 拒绝「非 fixed 却带 target」同一条判据——不会被读的声明是个谎
  if ('authorityScope' in data && data.authoritative !== 'true') {
    rep('docs.deadField', { field: 'authorityScope', why: '仅 authoritative: true 的文档有作用域可言' });
  }
}

/**
 * 在 frontmatter 顶端插一行 `id:`,返回新全文;非 frontmatter 文档返回 null。
 *
 * BOM 与行尾**原样保留**:补一个字段的职责不包括顺手把用户的文件重新格式化一遍——
 * 那会让 diff 里真正的变更淹没在几百行 EOL 噪声里,review 无从进行。
 */
export function insertIdLine(raw, id) {
  const bom = raw.charCodeAt(0) === 0xfeff ? '﻿' : '';
  const text = bom ? raw.slice(1) : raw;
  // 行尾按**首行自己的**行尾判,不做全文探测:混合行尾的文件(首行 LF、正文 CRLF)
  // 全文 indexOf('\r\n') 会落到 frontmatter 关闭线之后,id 被插进正文。
  const nl = text.indexOf('\n');
  if (nl === -1) return null;
  const eol = text[nl - 1] === '\r' ? '\r\n' : '\n';
  // 开栏判定走 FM_DELIM_RE 单一实现(N1):`---oops` 门不认作 frontmatter,
  // 这里也不得往里插 id——插了等于承认一个门判非法的块。
  if (!FM_DELIM_RE.test(text.slice(0, eol === '\r\n' ? nl - 1 : nl))) return null;
  const cut = nl + 1;
  return `${bom}${text.slice(0, cut)}id: ${id}${eol}${text.slice(cut)}`;
}

/** 正文 H1(`title` 缺省时的回落值;**门不校验二者一致**——那正是 R2-C1 清剿过的 drift gate) */
export function h1Of(body) {
  const m = /^#\s+(.+)$/m.exec(body ?? '');
  return m ? m[1].trim() : null;
}

/** 展示用标题:frontmatter `title` 优先,回落 H1(§4.1 item1) */
export const titleOf = (data, body) => data.title || h1Of(body);

export { FIELD };
