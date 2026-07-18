// 文档门禁:断链 / frontmatter / 位置一致性 / closeout 收口契约。
// 通用化自 Scrollery tools/check_docs.mjs——枚举与 disposition 语义外置到配置,
// walk 带存在性守卫,1b 源码扫描去硬编码(可配 sourceRoots),文案走 i18n catalog。
//
// 检查项:
//   1a. 活区 .md 的仓内相对链接目标必须存在(archive/ 与三件套过程件豁免)。
//   1b. sourceRoots 代码/配置里的 `<docsDir>/...md` 引用必须可达。
//   2.  活区 .md 须有合法 frontmatter(status ∈ 枚举 / type ∈ 枚举 / created)。
//   3.  archive/ 文件文首须带状态横幅;活区不得出现「已死」状态。
//   4.  worklogs/ 归档任务须带 closeout.md,声明候选恰好各处置一次。
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, DOCS_SKIP } from './lib/fsutil.mjs';
import { parseTables, parseFrontmatter, escapeRe, makeFenceSkipper } from './lib/frontmatter.mjs';
import { DEFAULTS } from './lib/config.mjs';
import { locOf, BASELINE_ELIGIBLE } from './lib/violations.mjs';
import { reportViolations } from './lib/gate.mjs';
import { slugify, isNFC } from './lib/slug.mjs';
import { TRIO, LINES_DIR, classifyFile, validateDocMeta, repoRootFiles, wantsRepoRoot, collectGraphDocs, collectIds } from './lib/docmeta.mjs';
const ID_RE = /^[FD]-\d{3}$/;
// team 候选 ID(设计件 §3):作者段贪婪、两端定界(前缀 [FD]- 固定、尾部恰三位数字),
// 作者含 `-` 无歧义。solo 禁作者段(ID_RE 本就拒绝)——单任务内文法单一。
const TEAM_ID_RE = /^[FD]-(.+)-(\d{3})$/;
export const CANDIDATE_COL = /候选\s*ID|candidate\s*id/i; // 声明表/处置表的候选 ID 列(zh 模板;英文前向兼容);team.mjs 迁移共用同一把尺
// 事件文件名(设计件 §2):定宽 UTC 时间戳(字典序=时间序的前提)+ 作者段 + 两位 seq
//(不定宽 `-10` 会排在 `-2` 前)。作者段贪婪,解析同 TEAM_ID_RE 靠两端定界。
// export:build-index 的 timeline 聚合用同一把尺解析,不另写第二份文法。
export const EVENT_FILE_RE = /^(\d{8}T\d{6}Z)-(.+)-(\d{2})\.md$/;

// closeout 处置表的固定列 schema(R5-C1,方案 §7.1)。本实现**按列位置解构**,
// 故列名/列数/顺序必须全部校验——只认「首列含候选 ID」就放行的话,插一列或换序
// 会让 target 取到 locator 的值,静默错位而非报错。每列接受 zh(现役模板)与 en
// 两种写法:列名属展示面,可 i18n;列的**位置与语义**属机器面,固定。
const CLOSEOUT_COLUMNS = [
  { key: 'id', re: /^(候选\s*ID|candidate\s*id)$/i },
  { key: 'disposition', re: /^(disposition|处置)$/i },
  { key: 'target', re: /^(target|落点)$/i },
  { key: 'locator', re: /^(locator|定位)$/i },
  { key: 'dedup', re: /^(去重证据|dedupe?\s*evidence)$/i },
  { key: 'naReason', re: /^(N[/-]A\s*理由|na\s*reason)$/i },
  { key: 'verified', re: /^(verified|已验证)$/i },
];
const CLOSEOUT_HEADER_HINT = '候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified';

const REPO_REF_RE = /^repo:([^\s@]+)$/;
const FROZEN_REF_RE = /^repo:([^\s@]+)@([0-9a-f]{7,40})$/;

/**
 * 校验 `repo:` 引用的 grammar 与**仓根 containment**(R5-C1,方案 §7.1)。
 * 「验存」的语义是「落点在本仓、随本仓演进」,不是「磁盘上有这个文件」——
 * 故 `repo:../<仓外文件>` 即便真实存在也非法,否则一次误填即可把仓外文件当合法落点。
 * 拒绝:绝对路径(POSIX `/` 与 Windows 盘符)、空段、`.`、`..`。
 * 注:symlink 逃逸不在本门射程(需 realpath 且随 checkout 变),由仓库自身约束。
 * @param {string} root 仓根绝对路径
 * @param {string} ref 形如 `repo:docs/x.md`;frozen 模式为 `repo:src/x.rs@abc1234`
 * @param {{frozen?: boolean}} opts frozen=true 时要求 `@<commit 短hash>` 后缀
 * @returns {{ok: true, abs: string, path: string} | {ok: false, reason: 'grammar'|'escape'}}
 */
export function validateRepoRef(root, ref, opts = {}) {
  const m = (opts.frozen ? FROZEN_REF_RE : REPO_REF_RE).exec((ref ?? '').trim());
  if (!m) return { ok: false, reason: 'grammar' };
  const path = m[1];
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return { ok: false, reason: 'escape' };
  if (path.split(/[/\\]/).some((s) => s === '' || s === '.' || s === '..')) return { ok: false, reason: 'escape' };
  const abs = resolve(root, path);
  const rootAbs = resolve(root);
  if (!abs.startsWith(rootAbs + sep)) return { ok: false, reason: 'escape' };
  return { ok: true, abs, path };
}

/**
 * 提取一行散文里的 markdown 链接靶点(R6-03)。原正则 `\]\(([^)]+)\)` 在**第一个** `)`
 * 截断,半角括号文件名(`a(1).md`)必假红——而 1b 侧注释早已写明「文件名里的括号合法」,
 * 只有全角括号才安全是两门的读法分叉。此处对 `](` 之后做括号配对计数取真关闭括号;
 * 未闭合的 `](` 视为非链接,本行余下放弃。
 */
function linkTargetsOf(prose) {
  const out = [];
  let i = 0;
  while ((i = prose.indexOf('](', i)) !== -1) {
    let depth = 1;
    let j = i + 2;
    while (j < prose.length && depth > 0) {
      if (prose[j] === '(') depth++;
      else if (prose[j] === ')') depth--;
      j++;
    }
    if (depth !== 0) break;
    out.push(prose.slice(i + 2, j - 1));
    i = j;
  }
  return out;
}

/**
 * 断链判定的形态重试(R6-03):%-编码链接(VS Code 补全中文文件名常产)与 NFD 形态
 * 指向真实存在的文件不算断——原样不存在时,追加 decodeURIComponent 与 NFC 归一的
 * 组合各重试一次。「中文文件名一等公民」的主打场景恰是这两种形态的高发区,不重试即假红。
 */
function linkTargetExists(baseDir, target) {
  const variants = new Set([target]);
  try { variants.add(decodeURIComponent(target)); } catch { /* 含裸 % 的字面路径:保持原样 */ }
  for (const v of [...variants]) variants.add(v.normalize('NFC'));
  for (const v of variants) if (existsSync(resolve(baseDir, v))) return true;
  return false;
}

/**
 * 解析 sourceRoots 配置为绝对**目录**列表。"auto"=探测顶层目录 - 排除表 - docsDir。
 * 仓根**文件**不在此列(它们不是「根」)——由 `repoRootFiles` 单独收,见 R4-11(§7.2)。
 */
export function resolveSourceRoots(root, config) {
  const { sourceRoots, sourceExclude = [], docsDir } = config;
  // `.` 在显式数组里是「并扫仓根文件」的点名写法,不是一个要递归遍历的目录——
  // 不滤掉的话 join(root, '.') = 仓根,walk 会把整个仓(含 docsDir)拖进 1b。
  if (Array.isArray(sourceRoots)) return sourceRoots.filter((d) => d !== '.').map((d) => join(root, d)).filter(existsSync);
  if (sourceRoots === 'auto') {
    // R6-02 连带:skip 集按**顶层名**匹配,docsDir 多段(docs/sub)时顶层 `docs` 不在集里,
    // 整棵文档树会被当 source root 拖进 1b。故连 docsDir 的首段一并排除——docsDir 所在的
    // 顶层树归文档域,auto 档保守让位(要扫其内源码请显式声明 sourceRoots)。
    const skip = new Set([...sourceExclude, docsDir, docsDir.split('/')[0], '.git']);
    return readdirSync(root)
      .filter((n) => { try { return statSync(join(root, n)).isDirectory() && !skip.has(n); } catch { return false; } })
      .map((n) => join(root, n));
  }
  return [];
}

// ── closeout 契约 ──────────────────────────────────────────────────────────
/**
 * 任务的 team 声明(task_plan frontmatter;设计件 §1)。成员集合 = {owner} ∪ collaborators,
 * NFC 归一后入集(D-007)——它是事件作者段(E3)与候选 ID 作者段(E5)的合法值域。
 * E1 的字段级校验(枚举/必填/字符集)在 checkTeamAndTaskNames,此处只回答「谁是成员」。
 */
export function teamDeclOf(taskDir) {
  const tp = join(taskDir, 'task_plan.md');
  if (!existsSync(tp)) return { team: false, owner: '', members: new Set() };
  const { data } = parseFrontmatter(readFileSync(tp, 'utf8'));
  const owner = (data.owner ?? '').trim();
  const members = new Set();
  if (owner) members.add(owner.normalize('NFC'));
  for (const c of (data.collaborators ?? '').split(/[,,]/).map((s) => s.trim()).filter(Boolean)) {
    members.add(c.normalize('NFC'));
  }
  return { team: (data.mode ?? '').trim() === 'team', owner, members };
}

/**
 * 候选 ID 文法按模式分派(E5,设计件 §3)。solo=裸 `F-NNN`;team=强制作者段且
 * 作者 ∈ 成员集合——文法错与成员错分开报(打错自己名字的人不该被送去学文法)。
 * @returns {boolean} 合法与否(非法的 ID 不入声明集合,维持既有语义)
 */
function checkCandidateId(id, teamCtx, rep) {
  if (!teamCtx?.team) {
    if (ID_RE.test(id)) return true;
    rep('closeout.candidateIdInvalid', { id });
    return false;
  }
  const m = TEAM_ID_RE.exec(id);
  if (!m || !isValidAuthor(m[1])) { rep('team.idNoNamespace', { id }); return false; }
  if (!teamCtx.members.has(m[1].normalize('NFC'))) {
    rep('team.idAuthorUnknown', { id, author: m[1], members: [...teamCtx.members].join(', ') || '无' });
    return false;
  }
  return true;
}

/** 从三件套两张声明表收集候选 ID(仅带「候选 ID」列的表;叙事提及不算) */
export function collectDeclaredIds(taskDir, report, rfn, teamCtx) {
  const declared = new Set();
  for (const name of ['findings.md', 'task_plan.md']) {
    const p = join(taskDir, name);
    if (!existsSync(p)) continue;
    for (const tb of parseTables(readFileSync(p, 'utf8'))) {
      const col = tb.header.findIndex((h) => CANDIDATE_COL.test(h));
      if (col === -1) continue;
      for (const row of tb.rows) {
        const cell = (row[col] ?? '').trim();
        if (!cell || cell === '—') continue; // 决策表允许留空=仅会话内决策
        if (!checkCandidateId(cell, teamCtx, (rule, params) => report({ file: rfn(p), rule, params }))) continue;
        if (declared.has(cell)) report({ file: rfn(p), rule: 'closeout.candidateIdDup', params: { id: cell } });
        declared.add(cell);
      }
    }
  }
  return declared;
}

/**
 * 按 targetKind 分派 target / 去重证据 / N-A 理由的校验(方案 §7.4 元模型)。
 * ⚠️ verified **不在此处**判——它是全 disposition 共用的收口断言,由调用方在分派之外
 * 统一校验,否则任一分支的提前 return 都会让它被静默跳过(R5-C1 的原始成因)。
 */
function checkDispositionTarget(o) {
  const { root, rule, id, disposition, target, dedup, naReason, file, report } = o;
  const rep = (ruleKey, params) => report({ file, rule: ruleKey, params });
  if (rule.targetKind === 'none') {
    if (target !== '—') rep('closeout.noPromoTarget', { id });
    if (rule.reasonRequired && (!naReason || naReason === '—')) rep('closeout.noPromoReason', { id });
    if (dedup !== '—') rep('closeout.noPromoDedup', { id });
    return;
  }
  if (naReason !== '—') rep('closeout.reasonMustDash', { id });
  if (rule.targetKind === 'frozen-ref') {
    // 冻结引用只验 grammar + 仓根边界,不验存在(指向的 commit 里有即可,永不回改)
    const r = validateRepoRef(root, target, { frozen: true });
    if (!r.ok) {
      if (r.reason === 'escape') rep('closeout.targetEscape', { id, target });
      else rep('closeout.frozenRefInvalid', { id, disposition, target: target || '空' });
    }
  } else if (rule.targetKind === 'fixed') {
    const expected = `repo:${rule.target}`;
    if (target !== expected) rep('closeout.fixedMismatch', { id, disposition, expected, target: target || '空' });
    else {
      // 靶点由**配置**给出,同样过 containment——配置写 `../x` 不该比 closeout 写 `../x` 更可信
      const r = validateRepoRef(root, target);
      if (!r.ok) rep('closeout.targetEscape', { id, target });
      else if (!existsSync(r.abs)) rep('closeout.docsMissing', { id, path: r.path });
    }
  } else if (rule.targetKind === 'line-status') {
    // D-014:靶点随候选所属**工作线**变化,配置只声明根目录,靶点由任务的 `line` 求解。
    // 这正是 `fixed` 表达不了的东西——它的 target 是配置里一个死字符串。
    if (!o.taskLine) { rep('closeout.lineStatusNoLine', { id }); return; }
    const slug = slugify(o.taskLine);
    if (!slug) { rep('closeout.lineStatusBadSlug', { id, line: o.taskLine }); return; }
    const expected = `repo:${rule.statusDir}/${slug}.md`;
    // D-007:**先 NFC 归一再比对**。不归一就比的话,一个 NFD 的 target 会撞
    // `lineStatusMismatch`(「你指错线了」)——而用户指的线其实是对的,错的是编码;
    // 报错把他送去改线名,他会怎么改都改不对。归一后比对,才谈得上分辨这两件事。
    if (target.normalize('NFC') !== expected) rep('closeout.lineStatusMismatch', { id, disposition, expected, target: target || '空', line: o.taskLine });
    else if (!isNFC(target)) {
      // 归一后相等、原文却非 NFC ⇒ 指的线没错,就是编码问题。macOS 产 NFD,不拦的话
      // 「看起来同名」的两个文件会各自存在、撞名永不暴露,Q7 的卖点被静默绕过。
      rep('closeout.lineStatusNotNFC', { id, target });
    } else {
      const r = validateRepoRef(root, target);
      if (!r.ok) rep('closeout.targetEscape', { id, target });
      else if (!existsSync(r.abs)) rep('closeout.docsMissing', { id, path: r.path });
    }
  } else { // docs
    const r = validateRepoRef(root, target);
    if (!r.ok) {
      if (r.reason === 'escape') rep('closeout.targetEscape', { id, target });
      else rep('closeout.docsGrammar', { id, target: target || '空' });
    } else if (!existsSync(r.abs)) rep('closeout.docsMissing', { id, path: r.path });
  }
  if (dedup !== 'new') {
    // 越仓与语法错要分开报:写 `repo:../x.md` 的人语法是对的,错在路径越仓——
    // 报「须为 new 或 repo:<路径>」会把他送去改语法,而语法本来就没错。
    const r = validateRepoRef(root, dedup);
    if (!r.ok) {
      if (r.reason === 'escape') rep('closeout.dedupEscape', { id, dedup });
      else rep('closeout.dedupInvalid', { id, dedup: dedup || '空' });
    }
  }
}

/** 校验 root 下 docs/worklogs 全部归档任务的 closeout 契约(结构化 disposition 分派) */
export function checkCloseouts(root, config, report) {
  const wl = join(root, config.docsDir, 'worklogs');
  if (!existsSync(wl)) return;
  const rfn = (p) => relPath(root, p);
  const dispMap = new Map(config.dispositions.map((d) => [d.name, d]));
  for (const name of readdirSync(wl)) {
    const dir = join(wl, name);
    if (!statSync(dir).isDirectory()) continue;
    if (![...TRIO].some((f) => existsSync(join(dir, f)))) continue; // 无任何三件套 = 非任务目录
    const teamCtx = teamDeclOf(dir); // 归档 team 任务的候选文法随模式走(E5),契约随 git mv 随行
    // R5-M1:归档任务须**三件齐**。只剩 task_plan 的半截目录不是「已收口」,是烂尾;
    // 原实现「任一存在即进入」使这种目录连同空 closeout 一起零违规通过。
    // team 档的 progress 承载是 progress/events/(设计件 §2)——此处按模式验承载存在,
    // 非空与文法由 E2/E4 管(同一事实一处判)。
    for (const f of TRIO) {
      if (f === 'progress.md' && teamCtx.team) {
        if (!existsSync(join(dir, 'progress', 'events'))) report({ file: rfn(dir), rule: 'closeout.trioIncomplete', params: { file: 'progress/events/' } });
        continue;
      }
      if (!existsSync(join(dir, f))) report({ file: rfn(dir), rule: 'closeout.trioIncomplete', params: { file: f } });
    }
    const closeout = join(dir, 'closeout.md');
    if (!existsSync(closeout)) { report({ file: rfn(dir), rule: 'closeout.missing' }); continue; }
    const declared = collectDeclaredIds(dir, report, rfn, teamCtx);
    const file = rfn(closeout);
    const rep = (ruleKey, params) => report({ file, rule: ruleKey, params });
    const raw = readFileSync(closeout, 'utf8');
    // `line-status` 的靶点要从任务所属工作线求解(D-014)。取 closeout 自己的 frontmatter
    // `line`——它与三件套同属一个任务,且 closeout 本就受 frontmatter 门校验,不必再多读一个文件。
    const coData = parseFrontmatter(raw).data;
    const taskLine = coData.line;
    // E6(设计件 §5):owner 唯一收口的机器可判面——closeout 台账须由 owner 具名。
    // 如实标注边界:CI 看不见谁在跑命令,这里咬的是**声明一致性**;发起人身份的真强制
    // 在 review 面(CODEOWNERS,阶段 5)与命令面(worklog closeout 的权限提示)。
    if (teamCtx.team) {
      const got = (coData.owner ?? '').trim();
      if (!got || got !== teamCtx.owner) rep('team.closeoutOwner', { owner: teamCtx.owner || '无', got: got || '无' });
    }
    const tables = parseTables(raw).filter((tb) => CANDIDATE_COL.test(tb.header[0] ?? ''));
    if (!tables.length) { rep('closeout.noTable'); continue; }
    const seen = new Set();
    for (const tb of tables) {
      const hdr = tb.header.map((c) => (c ?? '').trim());
      if (hdr.length !== CLOSEOUT_COLUMNS.length || !CLOSEOUT_COLUMNS.every((c, i) => c.re.test(hdr[i]))) {
        rep('closeout.tableSchema', { expected: CLOSEOUT_HEADER_HINT, got: hdr.join(' | ') });
        continue; // 列不符即不可按位置解构,继续读会给出错位的假判定
      }
      for (const row of tb.rows) {
        const [id, disposition, target, , dedup, naReason, verified] = row.map((c) => (c ?? '').trim());
        // 处置行 ID 与声明侧同一把文法尺(E5 按模式分派);行侧只报 rowIdInvalid 定位到表
        const idOk = teamCtx.team
          ? checkCandidateId(id, teamCtx, rep)
          : ID_RE.test(id);
        if (!idOk) { if (!teamCtx.team) rep('closeout.rowIdInvalid', { id: id || '空' }); continue; }
        // D-012:一候选恰好一处置行,ID 即行主键——覆盖判定与去重判定共用同一把钥匙
        if (seen.has(id)) rep('closeout.reDisposed', { id });
        seen.add(id);
        if (!declared.has(id)) rep('closeout.unknownCandidate', { id });
        // R5-C1:verified 在 per-kind 分派**之外**判,no-promotion 亦不例外
        //(「不提升」也是一个要有人确认已做完的决定)
        if (verified !== 'yes') rep('closeout.verifiedInvalid', { id, verified: verified || '空' });
        const rule = dispMap.get(disposition);
        if (!rule) { rep('closeout.dispositionInvalid', { id, disposition }); continue; }
        checkDispositionTarget({ root, rule, id, disposition, target, dedup, naReason, file, report, taskLine });
      }
    }
    for (const id of declared) if (!seen.has(id)) rep('closeout.unknownCandidate', { id: `${id}(已声明未处置)` });
  }
}

// ── P3 阶段 3:任务名全局唯一 + team 声明门 E1(设计件 §1/§5)──────────────────
/** 任务目录名的日期前缀(planning=开工日 / worklogs=收口日;同名任务两处前缀必不同) */
const TASK_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
/**
 * 作者短标识字符集:与 isValidId 同源(非空、无空白、无 `|` `/` `\`)+ NFC(D-007),
 * 另拒 Windows 保留字符 `: * ? " < >` 与 C0 控制符(R7-07 语境补正):作者段要进
 * **事件文件名**(设计件 §2/§3),这些字符在 Windows 上写盘即炸,而炸点恰在 team
 * 迁移写事件的中途——放行它们等于预约一次半迁移。空白断词、`|` 切表格、斜杠误读路径。
 */
export const isValidAuthor = (s) => !!s && !/[\s|/\\:*?"<>\x00-\x1f]/.test(s) && isNFC(s);
export const TASK_MODES = new Set(['solo', 'team']);

/**
 * 事件时间戳语义校验(E2)。正则只挡形态,`20260132T256099Z` 这种「语法合法、
 * 时刻荒谬」的串要靠 Date.UTC 往返比对——构造后逐字段核对,进位即暴露(13 月变 1 月)。
 * @param {string} ts 已过 EVENT_FILE_RE 定宽正则的 `YYYYMMDDTHHMMSSZ`
 */
const isValidEventTs = (ts) => {
  const [y, mo, d, h, mi, s] = [ts.slice(0, 4), ts.slice(4, 6), ts.slice(6, 8), ts.slice(9, 11), ts.slice(11, 13), ts.slice(13, 15)].map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
    && dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === s;
};

/**
 * 任务名全局唯一(R1 撞名 4×add/add 的 before 读数)+ E1 team 声明校验。
 *
 * 任务名 = 目录名剥日期前缀后 NFC 归一——不剥前缀的话,planning(开工日)与
 * worklogs(收口日)里的同名任务名义上不同串,复用旧任务名永不暴露。
 * 撞名的主语是**任务名**不是单个文件(同 idDuplicate 论证)⇒ 结构上不入 baseline。
 *
 * E1:mode/owner/collaborators 住在 task_plan frontmatter——trio 按文件名豁免字段门
 * (过程件哲学),故这里针对性解析,只校验 team 语义,不引入通用字段义务。
 * 新门零存量(当前无任何 mode 声明)⇒ 无梯需求,门单独上(设计件 §5)。
 */
export function checkTeamAndTaskNames(root, config, report) {
  const rfn = (p) => relPath(root, p);
  const nameSeen = new Map(); // 任务名 → 先占目录(readdir 排序保「谁先占」不随平台漂)
  for (const sub of ['planning', 'worklogs']) {
    const base = join(root, config.docsDir, sub);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const dir = join(base, name);
      if (!statSync(dir).isDirectory()) continue;
      if (![...TRIO].some((f) => existsSync(join(dir, f)))) continue; // 非任务目录
      const taskName = name.replace(TASK_DATE_PREFIX, '').normalize('NFC');
      const prev = nameSeen.get(taskName);
      if (prev) report({ file: rfn(dir), rule: 'team.taskNameDup', params: { name: taskName, other: prev } });
      else nameSeen.set(taskName, rfn(dir));
      const tp = join(dir, 'task_plan.md');
      if (!existsSync(tp)) continue; // 归档三件不齐由 closeout.trioIncomplete 管,不在此重报
      const { data } = parseFrontmatter(readFileSync(tp, 'utf8'));
      const file = rfn(tp);
      const rep = (rule, params) => report({ file, rule, params });
      const mode = (data.mode ?? '').trim();
      if (mode && !TASK_MODES.has(mode)) rep('team.modeInvalid', { mode });
      const team = mode === 'team';
      const owner = (data.owner ?? '').trim();
      if (team && !owner) rep('team.ownerMissing');
      if (owner && !isValidAuthor(owner)) rep('team.authorInvalid', { field: 'owner', value: owner });
      const collab = (data.collaborators ?? '').trim();
      if (collab) {
        // 死配置同治(deadField 同判据):solo 任务读不到 collaborators,声明即谎
        if (!team) rep('team.collabWithoutTeam', { mode: mode || 'solo' });
        for (const c of collab.split(/[,,]/).map((s) => s.trim())) {
          if (!isValidAuthor(c)) rep('team.authorInvalid', { field: 'collaborators', value: c || '空' });
        }
      }
      // ── E2/E3/E4:events 档形态与文法(设计件 §2/§5)────────────────────────
      const teamCtx = teamDeclOf(dir);
      const dirFile = rfn(dir);
      const repDir = (rule, params) => report({ file: dirFile, rule, params });
      const progressDir = join(dir, 'progress');
      const eventsDir = join(progressDir, 'events');
      if (team) {
        // E4 形态互斥:events 档已是 progress 的承载,progress.md 残留即双真源
        if (existsSync(join(dir, 'progress.md'))) repDir('team.teamHasProgressMd');
        const n = existsSync(eventsDir) ? readdirSync(eventsDir).length : 0;
        if (!n) repDir('team.eventsEmpty');
      } else if (existsSync(progressDir)) {
        // E4 反向:solo 不得有 progress/ 目录——切 team 是显式迁移,不做隐式混用
        repDir('team.soloHasEvents');
      }
      if (existsSync(progressDir)) {
        // E2:progress/ 下只许 events/;events/ 内逐文件过文法(readdir 而非 walk:
        // 杂散的非 .md 文件也要拦——事件契约在文件名,任何形态外的东西都是漂移)
        for (const entry of readdirSync(progressDir).sort()) {
          if (entry !== 'events') repDir('team.progressStray', { name: entry });
        }
        if (existsSync(eventsDir)) {
          for (const entry of readdirSync(eventsDir).sort()) {
            if (statSync(join(eventsDir, entry)).isDirectory()) { repDir('team.eventNameInvalid', { name: `${entry}/` }); continue; }
            if (!isNFC(entry)) { repDir('team.eventNameNotNFC', { name: entry }); continue; }
            const em = EVENT_FILE_RE.exec(entry);
            if (!em || !isValidAuthor(em[2])) { repDir('team.eventNameInvalid', { name: entry }); continue; }
            if (!isValidEventTs(em[1])) repDir('team.eventTsInvalid', { name: entry, ts: em[1] });
            // E3:作者段 ∈ 成员集合(solo 已由 soloHasEvents 整体拦,不再逐文件重报)
            if (team && !teamCtx.members.has(em[2].normalize('NFC'))) {
              repDir('team.eventAuthorUnknown', { author: em[2], name: entry, members: [...teamCtx.members].join(', ') || '无' });
            }
          }
        }
      }
      // ── E5:在施 team 任务的候选 ID 文法(归档侧由 checkCloseouts 同一把尺管,不重叠)──
      if (team && sub === 'planning') collectDeclaredIds(dir, report, rfn, teamCtx);
    }
  }
}

// ── 阶段 3:权威 / 生命周期图不变量(方案 §7.2,R2-C3)─────────────────────────
/**
 * 图不变量:id 唯一 / 取代关系成对双向 / 权威唯一 / 归档线引用禁令 / 终态字段。
 *
 * **D-015:只验当前快照,不读 git history**——这里验的全是「这批文件此刻自洽吗」,
 * 状态**转换**是否合法(draft→active 谁批的)是写命令的约束,不是本门的输入。
 * 扫描域 = collectGraphDocs(活区 + 归档 if-id + 线实体),与 upgrade 播种同一份世界观。
 * 按 D-013,本函数报的一切(supersededNoRef 除外)都是图违规,**不入 baseline 允许清单**。
 */
export function checkGraphInvariants(config, graph, report) {
  // 组合不变量只对状态机的**既知词汇**说话(§7.2:draft→active→snapshot|superseded|archived,
  // 机器面 ASCII,R3-1)。status 枚举是实例可配的,但自定义状态的生死语义机器不知道——不猜。
  const LIVE = new Set(['draft', 'active']);
  const DEAD_LINE = new Set(['archived', 'superseded']);
  const byId = collectIds(graph, (id, g, prev) =>
    // id 唯一性是图不变量(主语是 id,不是某个文件)→ 按 D-013 不可 baseline
    report({ file: g.rel, rule: 'docs.idDuplicate', params: { id, other: prev.rel } }));
  // 线实体状态表:归档线引用禁令的解析域。墓碑教义——关线 = 实体改 status: archived
  // **留在原地**(git mv 走的话,老 snapshot 文档的引用门当场断,且 slug 失去撞名保护)。
  const lineEntityRe = new RegExp(`^${escapeRe(config.docsDir)}\\/${LINES_DIR}\\/([^/]+)\\.md$`);
  const lineStatus = new Map();
  for (const g of graph) {
    const m = lineEntityRe.exec(g.rel);
    if (m) lineStatus.set(m[1].normalize('NFC'), g.data.status);
  }
  const authSeen = new Map(); // (line slug, authorityScope) → 先占者
  for (const g of graph) {
    const { data, rel } = g;
    const rep = (rule, params) => report({ file: rel, rule, params });
    // 取代关系:成对/悬垂/自环。归档件(if-id)一并参与——取代关系挂 id,正常归档的
    // 文档 frontmatter 随 git mv 走,supersededBy 还在;不看归档件,指向它的边全成盲区。
    for (const field of ['supersedes', 'supersededBy']) {
      const ref = (data[field] ?? '').trim();
      if (!ref) continue;
      if (data.id && ref === data.id) { rep('docs.supersedesSelf', { field }); continue; }
      const other = byId.get(ref);
      if (!other) { rep('docs.idrefDangling', { field, ref }); continue; }
      const backField = field === 'supersedes' ? 'supersededBy' : 'supersedes';
      // 无 id 的文档谈不上「对方回指我」(idMissing 已红),只验到悬垂为止
      if (data.id && (other.data[backField] ?? '').trim() !== data.id) {
        rep('docs.supersedesUnpaired', { field, ref, other: other.rel, backField, self: data.id });
      }
    }
    if (g.graph !== true) continue; // 归档件字段全免:以下组合不变量只对活区文档说话
    // 终态字段(§7.2 状态机):superseded 必携 supersededBy。接任者是谁机器派生不出,
    // 属人判债 ⇒ 本条例外地入 baseline 允许清单(D-018 两把梯子;存量仓真有此形态)
    if (data.status === 'superseded' && !(data.supersededBy ?? '').trim()) rep('docs.supersededNoRef');
    // 组合合法性:声明 supersededBy = 承认已被取代,与现役状态互斥。没有这条,
    // 成对双向一致 + 旧文档忘了改 status 依旧两个「现役」并存——双活恰好绕过所有门
    if ((data.supersededBy ?? '').trim() && LIVE.has(data.status)) rep('docs.supersededButAlive', { status: data.status });
    // 权威唯一:每 (line, authorityScope) 至多一个 active+authoritative;scope 缺省 = 整线。
    // 键取 slugify(line):「甲线(K)」与「甲线」是同一条线(D-007),不归并即各占一键假绿。
    // 键做**精确相等**,不判「整线 ⊇ 某 scope」的包含关系——那要机器懂 scope 语义,§7.2 没许诺
    if (data.status === 'active' && data.authoritative === 'true' && data.line) {
      const key = `${slugify(data.line)}\u0000${(data.authorityScope ?? '').trim()}`;
      const prev = authSeen.get(key);
      if (prev) rep('docs.authorityDuplicate', { line: data.line, scope: (data.authorityScope ?? '').trim() || '整线', other: prev.rel });
      else authSeen.set(key, g);
    }
    // 归档线引用禁令(拆线/并线,§7.2):现役文档不得引用已死的线实体。
    // snapshot/superseded 文档不受此限——冻结件的 line 是历史事实,不该被迫改写;
    // 墓碑实体自身也天然豁免(它的 status 就是 archived,不在现役集合里)。
    if (data.line && LIVE.has(data.status)) {
      const slug = slugify(data.line);
      const st = lineStatus.get(slug);
      if (st && DEAD_LINE.has(st)) rep('docs.lineArchivedRef', { line: data.line, status: st, entity: `${config.docsDir}/${LINES_DIR}/${slug}.md` });
    }
  }
}

// ── 1 + 2 + 3:链接 / frontmatter / 位置 ─────────────────────────────────────
export function checkDocsAndLinks(root, config, report, linksOnly) {
  const DOCS = join(root, config.docsDir);
  const rfn = (p) => relPath(root, p);
  // 排序:让扫描域与判定顺序不随 readdir 的平台差异漂移。id 播种/去重的「谁先占号」
  // 依赖这个顺序,不排的话同一个仓在两台机器上会得到不同的 id。
  // 排 rel 不排绝对路径(R6-09):`\` 与 `/` 码位序不同,排绝对路径会让顺序随平台反转。
  // skip 用 DOCS_SKIP(R6-01):文档树里 build/dist 是合理目录名,不得沿用源码根的跳过集。
  const docFiles = walk(DOCS, ['.md'], DOCS_SKIP)
    .map((abs) => ({ abs, rel: rfn(abs) }))
    .sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0))
    .map((x) => x.abs);
  // source universe 单一真源(§7.2 表):谁参与哪道检查只在此处答一次。
  // 原实现把它散成 inArchive/isTrio 两个各自为政的谓词,阶段 3/4 再各问一遍必然漂移。
  const cls = new Map(docFiles.map((f) => [f, classifyFile(config, rfn(f))]));

  // 1a. 活区 md 相对链接
  for (const file of docFiles) {
    if (!cls.get(file).links) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    // 围栏跟踪走 makeFenceSkipper 单一实现(R3-6):此前这里是一份内联单布尔翻转,
    // 状态机升级(记定界字符/长度)时若不收敛,1a 与节扫描家族对同一语法两种读法。
    const inCode = makeFenceSkipper();
    lines.forEach((text, i) => {
      if (inCode(text)) return;
      const prose = text.replace(/`[^`]*`/g, ''); // 行内代码是语法示意,非活链接
      for (const raw of linkTargetsOf(prose)) {
        let target = raw.trim();
        // CommonMark `<...>` 包裹目标(第七轮 P2):含空格路径的**合法**链接写法,
        // 旧实现见 `<` 一律跳过 ⇒ 该类断链静默放行。剥包裹后照常验存;
        // 空格只在包裹形态下放行(裸目标含空白仍非链接语法,照旧跳)。
        const bracketed = target.startsWith('<') && target.endsWith('>');
        if (bracketed) target = target.slice(1, -1).trim();
        if (/^(https?:|mailto:|#|tauri:)/.test(target)) continue;
        target = target.split('#')[0].trim();
        if (!target || !/[./]/.test(target) || target.includes('<') || (!bracketed && /\s/.test(target))) continue;
        const abs = resolve(dirname(file), target);
        const outOfScope = !abs.startsWith(DOCS + sep) && dirname(abs) !== root;
        if (outOfScope) continue; // 指向代码路径的导航链随重构腐化,不入本门
        if (!linkTargetExists(dirname(file), target)) report({ file: rfn(file), line: i + 1, rule: 'docs.brokenLink', params: { target } });
      }
    });
  }

  // 1b. sourceRoots 代码/配置里的 docs 全路径引用
  // `]` 必须在排除集里:markdown 链接 `[docs/x.md](docs/x.md)` 中,贪婪 `*` 会跨过 `](`
  // 吞掉两段、再回溯到最末一个 `.md`,产出 `docs/x.md](docs/x.md` 这种**拼接出来的假路径**
  // ——它当然不存在,于是每个这种链接都是一条假红。(R4-11 放行仓根扫描后当场实测复现。)
  // 刻意**不**排除 `(`:文件名里的括号是合法的(`docs/巡检修复(F).md`),排掉会截断真路径;
  // 而 `)` 本就已排除,故 `[文字](docs/a.md)` 这一侧从来是对的。
  const docRefRe = new RegExp(`(?<![\\w-])${escapeRe(config.docsDir)}\\/[^\\s)\\]"'\`〕〔),;:]*\\.md`, 'g');
  const codeExts = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.rs', '.py', '.go', '.java', '.md', '.json', '.toml', '.yml', '.yaml'];
  // R4-11:仓根**文件**曾是 1a/1b 双盲区——1a 只走 docsDir 之下,1b 只走顶层目录,
  // 于是仓根 README.md 里的 `docs/gone.md` 谁都看不见(§7.2 source universe 表已结案)。
  const codeFiles = [
    ...resolveSourceRoots(root, config).flatMap((d) => walk(d, codeExts, new Set(config.sourceExclude || []))),
    ...(wantsRepoRoot(config) ? repoRootFiles(root, config, codeExts) : []),
  ];
  for (const file of codeFiles) {
    // markdown 的反引号 = 「我在谈论这个字面量」,不是引用——1a 上面已用同一条规则
    // (「行内代码是语法示意,非活链接」),1b 此前没有,是两门对同一语法的两种读法。
    // 代码文件的反引号则是**字符串定界符**:`docs/todo.md` 写在 .mjs 里是真引用,不能剥。
    // 实测触发点:本工具自己的 README 写「init 会 stamp 到**你仓里的** `docs/runbooks/closeout.md`」
    // ——那是在描述**消费仓**的路径,本仓没有也不该有该文件;不剥即假红(R4-11 放行仓根文件后必现)。
    const isMd = file.endsWith('.md');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let inFence = false;
    lines.forEach((text, i) => {
      if (isMd && /^\s*(```|~~~)/.test(text)) { inFence = !inFence; return; }
      if (isMd && inFence) return; // 围栏内是示例,同理
      const scan = isMd ? text.replace(/`[^`]*`/g, '') : text;
      for (const m of scan.matchAll(docRefRe)) {
        if (!existsSync(join(root, m[0]))) report({ file: rfn(file), line: i + 1, rule: 'docs.refUnreachable', params: { ref: m[0] } });
      }
    });
  }

  // 2 + 3. frontmatter 字段契约 / 位置一致性 / id 全局唯一 / line 引用门(阶段 2)
  if (!linksOnly) {
    // 线实体全集(引用门的解析域):`<docsDir>/lines/<name>.md` 的文件名集合。
    // 文件名先 NFC 归一再入集(D-007:归一必须在比对之前);非 NFC 的文件名本身即红——
    // macOS 产 NFD,不拦的话「看起来同名」的两个实体会各自存在,Q7 的撞名暴露被静默绕过。
    const lineEntityRe = new RegExp(`^${escapeRe(config.docsDir)}\\/${LINES_DIR}\\/([^/]+)\\.md$`);
    // status 分片目录由 line-status 处置声明(D-014:配置只声明 statusDir);无该处置则无此门
    const statusDir = (config.dispositions || []).find((d) => d.targetKind === 'line-status')?.statusDir;
    const statusEntityRe = statusDir ? new RegExp(`^${escapeRe(statusDir)}\\/([^/]+)\\.md$`) : null;
    const lineEntities = new Set();
    for (const file of docFiles) {
      const m = lineEntityRe.exec(rfn(file));
      if (!m) continue;
      if (!isNFC(m[1])) report({ file: rfn(file), rule: 'docs.lineFileNotNFC', params: { name: m[1] } });
      lineEntities.add(m[1].normalize('NFC'));
    }
    for (const file of docFiles) {
      const c = cls.get(file);
      const raw = readFileSync(file, 'utf8');
      const rep = (ruleKey, params) => report({ file: rfn(file), rule: ruleKey, params });
      if (c.banner) {
        const head = raw.split(/\r?\n/).slice(0, 8).join('\n');
        if (!(config.archiveBannerMarkers || []).some((m) => head.includes(m))) {
          rep('docs.archiveNoBanner', { markers: (config.archiveBannerMarkers || []).join('/') });
        }
      }
      // 过程件全域豁免;归档件字段门全免(其 id 唯一性/取代边归下面的图不变量统一管)
      if (!c.frontmatter) continue;
      const { hasFm, data } = parseFrontmatter(raw);
      // 起了 `---` 却没收尾 = frontmatter 本身坏了,报**一条** missingFrontmatter;
      // 原实现在此会把它拆成 status/type/created 三条假错,把读者送去查三个不存在的字段。
      if (!hasFm) { rep('docs.missingFrontmatter'); continue; }
      validateDocMeta({ data, config, rep });
      // 引用门(§4.1 item2 ②):`line` 值须解析到 lines/<slug>.md 实体。
      // slug 先派生(剥字母尾 + NFC 归一)再比对——值缺失归 lineMissing,此处只管「有值但无实体」。
      if (data.line) {
        const slug = slugify(data.line);
        if (!slug) rep('docs.lineBadSlug', { line: data.line });
        else if (!lineEntities.has(slug)) rep('docs.lineUnresolved', { line: data.line, expected: `${config.docsDir}/${LINES_DIR}/${slug}.md` });
      }
      // 线实体自检(§4.1 item2 ⑥):type 固定 line;`line` 指向自身文件名 slug——
      // 二者若可漂,实体就成了一份「声明是甲线、文件名是乙线」的两可数据。
      const em = lineEntityRe.exec(rfn(file));
      if (em) {
        if (data.type !== 'line') rep('docs.lineEntityType', { type: data.type ?? '无' });
        // R6-11:比对经 slugify(剥字母尾 + NFC),与下方 status 分片同一把尺——此前实体用
        // 原文 NFC、分片用 slugify,`line: 甲线(K)` 在实体红、在分片绿,同一身份纪律两种判法。
        if (slugify(data.line ?? '') !== em[1].normalize('NFC')) rep('docs.lineEntityMismatch', { line: data.line ?? '无', slug: em[1] });
      }
      // status 分片自检(§4.1 item2 ⑥ 表:type 恒 rolling-status、line 指自身文件名 slug、
      // 文件名 NFC——与线实体同一套身份纪律)。解析域 = line-status 处置声明的 statusDir。
      const sm = statusEntityRe?.exec(rfn(file));
      if (sm) {
        if (!isNFC(sm[1])) rep('docs.statusFileNotNFC', { name: sm[1] });
        if (data.type !== 'rolling-status') rep('docs.statusEntityType', { type: data.type ?? '无' });
        if (slugify(data.line ?? '') !== sm[1].normalize('NFC')) rep('docs.statusEntityMismatch', { line: data.line ?? '无', slug: sm[1] });
      }
    }
    // 图不变量(阶段 3):id 唯一 + 取代成对 + 权威唯一 + 归档线引用禁令。
    // 扫描域由 collectGraphDocs 单独回答(F-014)——与上面的逐文件字段门是两种主语:
    // 字段门问「这篇文档自洽吗」,图门问「这**批**文档互相自洽吗」。
    checkGraphInvariants(config, collectGraphDocs(root, config), report);
  }
  return { docsCount: docFiles.length, codeCount: codeFiles.length };
}

/** 门禁主入口:打印违规与汇总,返回退出码。 */
export function main({ root, config, t, args }) {
  const linksOnly = args.includes('--links-only');
  const violations = [];
  const report = (v) => violations.push(v);
  const { docsCount, codeCount } = checkDocsAndLinks(root, config, report, linksOnly);
  if (!linksOnly) {
    checkCloseouts(root, config, report);
    checkTeamAndTaskNames(root, config, report);
  }
  const r = reportViolations({ violations, config, root, args, t });
  if (r.clean) {
    console.log(t('docs.pass', { mode: linksOnly ? '仅断链' : '断链+frontmatter+位置+收口', docs: docsCount, code: codeCount }));
  } else if (r.exit === 1) {
    // F-003:总行只数强制。violations.length 会把 baseline 豁免也计进来,豁免挂账
    // 与真实违规在总数里同形(实测 193 = 186 豁免 + 7 强制),读数误导。
    // exit 2(如 baseline 账文件损坏)自带成因行,不再叠一句「0 处违反」。
    console.error(`\n${t('docs.fail', { n: r.enforced })}`);
  }
  return r.exit;
}

// ── selftest:临时目录构造微型仓,断言校验器判定方向 ─────────────────────────
// 注意(experience §12):fixture 内一切 docs 前缀/.md 后缀均经变量拼接,
// 绝不连成同一字面量——否则被 1b 扫描当真引用验存拦红。
export function selftest() {
  const D = 'docs';
  const cfg = (over = {}) => ({ ...DEFAULTS, ...over, docsDir: D });
  const HDR = '| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |\n|---|---|---|---|---|---|---|\n';
  const findingsWith = (ids) => `# f\n\n## 候选\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n${ids.map((i) => `| ${i} | x | experience |`).join('\n')}\n`;
  // closeout 带 frontmatter 才有 `line`——`line-status` 靶点由它求解(D-014)
  const closeoutFm = (line) => `---\nstatus: snapshot\ntype: closeout\nline: ${line}\ncreated: 2026-01-01\n---\n\n`;
  const LS = [{ name: 'todo', targetKind: 'line-status', statusDir: `${'docs'}/status` }, ...DEFAULTS.dispositions.filter((d) => d.name !== 'todo')];
  const planWith = (ids) => (ids.length
    ? `# p\n\n| 决策 | 理由 | 候选 ID |\n|---|---|---|\n${ids.map((i) => `| d | r | ${i} |`).join('\n')}\n`
    : '# p\n\n无需提升的会话内决策。\n');
  // 三件套齐全是**归档任务的结构前提**(R5-M1),故 fixture 默认写齐三件;
  // 单独测「不齐」的用例显式删件,其余用例不该因结构不齐而红(否则 bad 用例会因
  // 非预期原因通过 = 假绿,测不到它本来要测的那条规则)。
  const trio = (findingIds = [], planIds = []) => ({
    [`${D}/worklogs/t/findings.md`]: findingsWith(findingIds),
    [`${D}/worklogs/t/task_plan.md`]: planWith(planIds),
    [`${D}/worklogs/t/progress.md`]: '# p\n\n进度。\n',
  });
  const closeoutWith = (rows) => `# c\n\n${HDR}${rows.join('\n')}\n`;
  const CO = `${D}/worklogs/t/closeout.md`;
  const okRow = `| F-001 | experience | repo:${D}/experience.md | — | new | — | yes |`;
  // 受检文档的最小合法 frontmatter(阶段 1 起 id 必填)。id 自增以免各用例互撞——
  // **撞号本身另有专门用例**,不该在无关用例里作为副作用发生。
  let seq = 0;
  const fm = (status, type, extra = {}) => {
    const f = { id: `2026-01-01-doc${++seq}`, status, type, line: 'x', created: '2026-01-01', ...extra };
    const body = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n');
    return `---\n${body}\n---\n\n# 标题\n正文。\n`;
  };
  // 线实体 fixture(阶段 2 引用门):fm() 默认 line: x,故 ok 用例须带 `...LX` 供其解析;
  // 不带的 ok 用例会因 lineUnresolved 假红——那正是引用门在干活,不是用例坏了。
  const lineEnt = (slug) => `---\nid: 2026-01-01-线-${slug}\nstatus: active\ntype: line\nline: ${slug}\ncreated: 2026-01-01\n---\n\n# ${slug}\n`;
  const LX = { [`${D}/lines/x.md`]: lineEnt('x') };
  // 阶段 4:status 分片 fixture(§4.1 item2 ⑥)。RS = 带 line-status 处置与 rolling-status type 的配置
  const statusEnt = (slug) => `---\nid: 2026-01-01-状态-${slug}\nstatus: active\ntype: rolling-status\nline: ${slug}\ncreated: 2026-01-01\n---\n\n# ${slug} · 滚动状态\n\n- 现况:施工中\n`;
  const RS = {
    types: [...DEFAULTS.types, { name: 'rolling-status', canBeAuthoritative: false }],
    dispositions: [{ name: 'todo', targetKind: 'line-status', statusDir: `${'docs'}/status` }, ...DEFAULTS.dispositions.filter((d) => d.name !== 'todo')],
  };

  // [名称, expectBad, which('closeout'|'docs'), configOverride, {相对 root 路径 → 内容}]
  const cases = [
    ['ok-closeout-basic', false, 'closeout', {}, {
      [`${D}/experience.md`]: 'x', [`${D}/todo.md`]: 'x',
      ...trio(['F-001'], ['D-001']),
      [CO]: closeoutWith([okRow, `| D-001 | todo | repo:${D}/todo.md | — | new | — | yes |`]),
    }],
    ['ok-code-frozen-目标可不存在', false, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | code | repo:src/gone.rs@abc1234 | — | new | — | yes |']),
    }],
    ['ok-narrative-叙事提及不算声明', false, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [`${D}/worklogs/t/progress.md`]: '# p\n\n顺带提到 F-002 但没声明它。\n',
      [CO]: closeoutWith([okRow]),
    }],
    ['ok-围栏内示例候选表不算声明(parseTables 跳围栏,与 1a/1b 同一语义)', false, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [`${D}/worklogs/t/findings.md`]: findingsWith(['F-001']) + '\n```markdown\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n| F-099 | 围栏示例,非真声明 | experience |\n```\n',
      [CO]: closeoutWith([okRow]),
    }],
    ['ok-去重证据指既有文档', false, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutWith([`| F-001 | experience | repo:${D}/experience.md | — | repo:${D}/experience.md | — | yes |`]),
    }],
    // F-023 门层 dogfood:某格含字面竖线 `\|`,门按位置解构七列仍不错位(旧 split 断幻影列
    // → hdr 长度 7≠8 → 假报 closeout.tableSchema)。naReason 是 no-promotion 唯一必填自由文本格。
    ['ok-转义竖线不炸列(F-023:格内 `\\|` 是字面竖线,非列界)', false, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | no-promotion | — | — | — | 理由含字面竖线 a\\|b,门须读满七列 | yes |']),
    }],
    ['bad-缺closeout', true, 'closeout', {}, trio(['F-001'])],
    ['bad-三件套不齐(缺progress)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      [`${D}/worklogs/t/findings.md`]: findingsWith(['F-001']),
      [`${D}/worklogs/t/task_plan.md`]: planWith([]),
      [CO]: closeoutWith([okRow]),
    }],
    ['bad-三件套不齐(只剩task_plan+空closeout)', true, 'closeout', {}, {
      [`${D}/worklogs/t/task_plan.md`]: planWith([]),
      [CO]: '# c\n\n(空)\n',
    }],
    ['bad-漏处置已声明候选', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001', 'F-002']),
      [CO]: closeoutWith([okRow]),
    }],
    ['bad-重复处置', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutWith([okRow, okRow]),
    }],
    ['bad-未知候选', true, 'closeout', {}, {
      ...trio([]),
      [CO]: closeoutWith(['| F-009 | no-promotion | — | — | — | 无 | yes |']),
    }],
    ['bad-非法enum', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | misc | — | — | — | 无 | yes |']),
    }],
    ['bad-nopromo缺理由', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | no-promotion | — | — | — | — | yes |']),
    }],
    ['bad-docs目标不存在', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith([`| F-001 | experience | repo:${D}/gone.md | — | new | — | yes |`]),
    }],
    ['bad-冻结引用缺commit', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | code | repo:src/x.rs | — | new | — | yes |']),
    }],
    ['bad-fixed靶点不符', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutWith([`| F-001 | todo | repo:${D}/experience.md | — | new | — | yes |`]),
    }],
    ['bad-verified非yes', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutWith([`| F-001 | experience | repo:${D}/experience.md | — | new | — | pending |`]),
    }],
    // ── R5-C1 三组:verified 跳过 / 仓根逃逸 / 固定列 schema ──
    ['bad-nopromo的verified非yes(R5-C1:曾被提前 continue 跳过)', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | no-promotion | — | — | — | 不值得提升 | no |']),
    }],
    ['bad-target越出仓根(R5-C1)', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | experience | repo:../outside.md | — | new | — | yes |']),
    }],
    ['bad-target绝对路径(R5-C1)', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | experience | repo:/etc/passwd | — | new | — | yes |']),
    }],
    ['bad-冻结引用越出仓根(R5-C1)', true, 'closeout', {}, {
      ...trio(['F-001']),
      [CO]: closeoutWith(['| F-001 | code | repo:../elsewhere/x.rs@abc1234 | — | new | — | yes |']),
    }],
    ['bad-去重证据越出仓根(R5-C1)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutWith([`| F-001 | experience | repo:${D}/experience.md | — | repo:../elsewhere.md | — | yes |`]),
    }],
    ['bad-处置表多一列(R5-C1:按位解构会错位)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: `# c\n\n| 候选 ID | disposition | 新插列 | target | locator | 去重证据 | N/A 理由 | verified |\n|---|---|---|---|---|---|---|---|\n| F-001 | experience | x | repo:${D}/experience.md | — | new | — | yes |\n`,
    }],
    ['bad-处置表列换序(R5-C1)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      ...trio(['F-001']),
      [CO]: `# c\n\n| 候选 ID | target | disposition | locator | 去重证据 | N/A 理由 | verified |\n|---|---|---|---|---|---|---|\n| F-001 | repo:${D}/experience.md | experience | — | new | — | yes |\n`,
    }],
    // ── D-014 line-status:靶点由任务 line 求解,不是配置里的死字符串 ──
    ['ok-line-status 靶点按中文 line 求解', false, 'closeout', { dispositions: LS }, {
      [`${D}/status/中文工作线.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutFm('中文工作线') + closeoutWith([`| F-001 | todo | repo:${D}/status/中文工作线.md | — | new | — | yes |`]),
    }],
    ['ok-line-status 剥 (X) 字母尾后求解(D-007)', false, 'closeout', { dispositions: LS }, {
      [`${D}/status/丙线完善.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutFm('丙线完善(K)') + closeoutWith([`| F-001 | todo | repo:${D}/status/丙线完善.md | — | new | — | yes |`]),
    }],
    ['bad-line-status 靶点指错线', true, 'closeout', { dispositions: LS }, {
      [`${D}/status/甲线.md`]: 'x', [`${D}/status/乙线.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutFm('甲线') + closeoutWith([`| F-001 | todo | repo:${D}/status/乙线.md | — | new | — | yes |`]),
    }],
    ['bad-line-status 靶点不存在', true, 'closeout', { dispositions: LS }, {
      ...trio(['F-001']),
      [CO]: closeoutFm('甲线') + closeoutWith([`| F-001 | todo | repo:${D}/status/甲线.md | — | new | — | yes |`]),
    }],
    ['bad-line-status 但 closeout 缺 line', true, 'closeout', { dispositions: LS }, {
      [`${D}/status/甲线.md`]: 'x',
      ...trio(['F-001']),
      [CO]: `---\nstatus: snapshot\ntype: closeout\ncreated: 2026-01-01\n---\n\n` + closeoutWith([`| F-001 | todo | repo:${D}/status/甲线.md | — | new | — | yes |`]),
    }],
    // D-007 NFC 门。**注意 fixture 用的是假名不是中文**:CJK 统一表意文字无正则分解映射,
    // `'中文工作线'.normalize('NFD')` 与原串全等 —— 拿纯中文测 NFC 门等于测一个恒真命题。
    // 真正会分裂的是带浊点假名(が 1→2 码点)、谚文(한 1→3)、带变音符拉丁(é 1→2)。
    ['ok-纯中文 line 天然 NFC 稳定(CJK 无分解映射)', false, 'closeout', { dispositions: LS }, {
      [`${D}/status/中文工作线.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutFm('中文工作线') + closeoutWith([`| F-001 | todo | repo:${D}/status/${'中文工作线'.normalize('NFD')}.md | — | new | — | yes |`]),
    }],
    ['bad-line-status 靶点为 NFD(假名浊点;线对、编码错)', true, 'closeout', { dispositions: LS }, {
      [`${D}/status/ガンダム対応.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutFm('ガンダム対応') + closeoutWith([`| F-001 | todo | repo:${D}/status/${'ガンダム対応'.normalize('NFD')}.md | — | new | — | yes |`]),
    }],
    ['bad-line-status 靶点为 NFD(谚文)', true, 'closeout', { dispositions: LS }, {
      [`${D}/status/한글작업.md`]: 'x',
      ...trio(['F-001']),
      [CO]: closeoutFm('한글작업') + closeoutWith([`| F-001 | todo | repo:${D}/status/${'한글작업'.normalize('NFD')}.md | — | new | — | yes |`]),
    }],
    // ── P3 阶段 4:E5/E6 归档 team 任务(closeout 门按模式选文法;契约随 git mv 随行)──
    ['ok-归档 team 任务:候选带作者段 + closeout owner 具名(E5/E6 正例)', false, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      [`${D}/worklogs/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n\n无需提升的会话内决策。\n',
      [`${D}/worklogs/t/findings.md`]: findingsWith(['F-alice-001']),
      [`${D}/worklogs/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [CO]: `---\nstatus: snapshot\ntype: closeout\nline: x\ncreated: 2026-01-01\nowner: alice\n---\n\n# c\n\n${HDR}| F-alice-001 | experience | repo:${D}/experience.md | — | new | — | yes |\n`,
    }],
    ['bad-归档 team 任务 closeout 缺 owner(E6:owner 唯一收口)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      [`${D}/worklogs/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n\n无需提升的会话内决策。\n',
      [`${D}/worklogs/t/findings.md`]: findingsWith(['F-alice-001']),
      [`${D}/worklogs/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [CO]: closeoutWith([`| F-alice-001 | experience | repo:${D}/experience.md | — | new | — | yes |`]),
    }],
    ['bad-归档 team 任务 closeout owner ≠ task_plan owner(E6)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      [`${D}/worklogs/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n\n无需提升的会话内决策。\n',
      [`${D}/worklogs/t/findings.md`]: findingsWith(['F-alice-001']),
      [`${D}/worklogs/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [CO]: `---\nstatus: snapshot\ntype: closeout\nline: x\ncreated: 2026-01-01\nowner: bob\n---\n\n# c\n\n${HDR}| F-alice-001 | experience | repo:${D}/experience.md | — | new | — | yes |\n`,
    }],
    ['bad-归档 team 任务处置行 ID 裸编号(行侧与声明侧同一把文法尺)', true, 'closeout', {}, {
      [`${D}/experience.md`]: 'x',
      [`${D}/worklogs/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n\n无需提升的会话内决策。\n',
      [`${D}/worklogs/t/findings.md`]: findingsWith(['F-alice-001']),
      [`${D}/worklogs/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [CO]: `---\nstatus: snapshot\ntype: closeout\nline: x\ncreated: 2026-01-01\nowner: alice\n---\n\n# c\n\n${HDR}| F-001 | experience | repo:${D}/experience.md | — | new | — | yes |\n`,
    }],
    // 文档 / 链接 / 1b
    ['ok-frontmatter合法', false, 'docs', {}, { ...LX, [`${D}/designs/a.md`]: fm('active', 'design') }],
    ['bad-缺frontmatter', true, 'docs', {}, { [`${D}/designs/a.md`]: '# 无头\n' }],
    // ── N1(第七轮复核 §3):`---oops` 开栏不是 frontmatter——parseFrontmatter 曾认
    // (startsWith),flipStatusSnapshot 严拒,同一文件门绿、收口静默降级 ──
    ['bad-N1:---oops 开栏不算 frontmatter(双 parser 曾分叉)', true, 'docs', {}, {
      ...LX, [`${D}/designs/n1.md`]: '---oops\nid: 2026-01-01-n1\nstatus: active\ntype: design\nline: x\ncreated: 2026-01-01\n---\n\n# t\n',
    }],
    // ── N3(第七轮复核 §3):created 语义日期——形态正则曾放行日历荒谬值 ──
    ['bad-N3:created 非真实日历日(2026-99-99 曾过形态正则)', true, 'docs', {}, {
      ...LX, [`${D}/designs/n3.md`]: fm('active', 'design', { created: '2026-99-99' }),
    }],
    ['bad-N3:created 非闰年 2 月 29 日', true, 'docs', {}, {
      ...LX, [`${D}/designs/n3b.md`]: fm('active', 'design', { created: '2026-02-29' }),
    }],
    ['ok-N3:闰日合法(2024-02-29)', false, 'docs', {}, {
      ...LX, [`${D}/designs/n3c.md`]: fm('active', 'design', { created: '2024-02-29' }),
    }],
    ['bad-status非法', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('bogus', 'design') }],
    ['bad-type非法', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'bogus') }],
    ['bad-已死状态未归档', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('superseded', 'design') }],
    ['bad-断链', true, 'docs', {}, {
      [`${D}/designs/a.md`]: fm('active', 'design') + '\n[x](./gone.md)\n',
    }],
    ['ok-同目录链接存在', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design') + '\n[b](./b.md)\n',
      [`${D}/designs/b.md`]: fm('active', 'design'),
    }],
    // ── 第七轮 P2:`<...>` 包裹目标(CommonMark 含空格路径写法)曾整类跳过 ──
    ['bad-尖括号包裹断链(含 `<` 曾静默放行)', true, 'docs', {}, {
      [`${D}/designs/a.md`]: fm('active', 'design') + '\n[x](<./gone file.md>)\n',
    }],
    ['ok-尖括号包裹链接存在(含空格路径)', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design') + '\n[b](<./b file.md>)\n',
      [`${D}/designs/b file.md`]: fm('active', 'design'),
    }],
    ['bad-archive缺横幅', true, 'docs', {}, { [`${D}/archive/old.md`]: '# 无横幅归档件\n' }],
    ['ok-archive有横幅', false, 'docs', {}, { [`${D}/archive/old.md`]: '# 旧件\n\n> 📦 已归档,被 X 取代。\n' }],
    ['bad-1b引用不可达', true, 'docs', { sourceRoots: ['code'] }, {
      [`${D}/designs/a.md`]: fm('active', 'design'),
      'code/app.mjs': `// 见 ${D}/gone.md 说明\n`,
    }],
    ['ok-1b引用存在', false, 'docs', { sourceRoots: ['code'] }, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design'),
      [`${D}/real.md`]: fm('active', 'design'),
      'code/app.mjs': `// 见 ${D}/real.md 说明\n`,
    }],
    // ── 阶段 1:frontmatter 字段表(方案 §4.1 item1)──────────────────────────
    ['ok-全字段齐备', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', {
        title: '标题', summary: '一句话摘要', authoritative: 'true',
        authorityScope: '渲染', owner: 'gjs',
      }),
    }],
    ['bad-缺 id(阶段 1 新必填)', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { id: undefined }) }],
    ['bad-id 含空白', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { id: 'a b' }) }],
    ['bad-id 含 `|`(会把生成式索引的表格切两半)', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { id: 'a|b' }) }],
    ['bad-id 含 `/`(id 恰恰是不挂路径的那个标识)', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { id: 'a/b' }) }],
    // CJK 无分解映射,故 NFC 负例须用假名/谚文(F-006 实测教训:拿纯中文测等于测恒真命题)
    ['bad-id 非 NFC(假名浊点)', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { id: '2026-01-01-ガンダム'.normalize('NFD') }) }],
    ['ok-纯中文 id 天然 NFC', false, 'docs', {}, { ...LX, [`${D}/designs/a.md`]: fm('active', 'design', { id: '2026-01-01-中文标识' }) }],
    ['bad-id 撞号', true, 'docs', {}, {
      [`${D}/designs/a.md`]: fm('active', 'design', { id: '2026-01-01-同一个号' }),
      [`${D}/designs/b.md`]: fm('active', 'design', { id: '2026-01-01-同一个号' }),
    }],
    ['bad-缺 line', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { line: undefined }) }],
    ['bad-可选字段空值(声明了却没填)', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { title: '' }) }],
    ['bad-authoritative 非字面量 true/false', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { authoritative: 'yes' }) }],
    ['bad-canBeAuthoritative=false 的 type 声明权威', true, 'docs', {}, { [`${D}/reviews/a.md`]: fm('active', 'review', { authoritative: 'true' }) }],
    ['ok-canBeAuthoritative=true 的 type 声明权威', false, 'docs', {}, { ...LX, [`${D}/designs/a.md`]: fm('active', 'design', { authoritative: 'true' }) }],
    ['bad-authorityScope 无 authoritative(死配置)', true, 'docs', {}, { [`${D}/designs/a.md`]: fm('active', 'design', { authorityScope: '渲染' }) }],
    ['bad-frontmatter 起了 --- 却没收尾', true, 'docs', {}, { [`${D}/designs/a.md`]: '---\nstatus: active\ntype: design\n\n# 正文\n' }],
    // ── source universe(方案 §7.2 表)────────────────────────────────────────
    ['ok-归档件无 frontmatter 只验横幅(零迁移:实测靶场 32 篇归档件仅 4 篇有 fm)', false, 'docs', {}, {
      [`${D}/archive/old.md`]: '# 旧件\n\n> 📦 已归档,被 X 取代。\n',
    }],
    ['ok-归档件有 fm 但无 id ⇒ 不参与唯一性', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', { id: '2026-01-01-x' }),
      [`${D}/archive/old.md`]: '---\nstatus: archived\ntype: design\nline: x\ncreated: 2026-01-01\n---\n\n> 已归档\n\n# 旧件\n',
    }],
    ['bad-归档件声明的 id 与活区撞号(if-id ⇒ 参与唯一性)', true, 'docs', {}, {
      [`${D}/designs/a.md`]: fm('active', 'design', { id: '2026-01-01-x' }),
      [`${D}/archive/old.md`]: '---\nid: 2026-01-01-x\nstatus: archived\ntype: design\nline: x\ncreated: 2026-01-01\n---\n\n> 已归档\n\n# 旧件\n',
    }],
    ['ok-归档件的 frontmatter 不受字段门校验(只验横幅)', false, 'docs', {}, {
      // status/type 全非法、line/created 全缺——归档件依旧只需要横幅
      [`${D}/archive/old.md`]: '---\nstatus: 乱写\ntype: 乱写\n---\n\n> 已归档\n\n# 旧件\n',
    }],
    ['ok-三件套全域豁免(字段全缺也不红)', false, 'docs', {}, {
      [`${D}/planning/t/task_plan.md`]: '# 没有 frontmatter 的草稿\n\n[断链](./gone.md)\n',
    }],
    // ── 阶段 2:line 引用门(§4.1 item2 ②;slug 规则 D-007)──────────────────
    ['ok-线实体自洽(type line + line=自身 slug,自引用绿)', false, 'docs', {}, { ...LX }],
    ['bad-line 无对应实体(lineUnresolved;梯子=upgrade 播种,不入 baseline)', true, 'docs', {}, {
      [`${D}/designs/a.md`]: fm('active', 'design'),
    }],
    ['ok-line 带字母尾解析到剥尾实体(D-007 ①:`名(X)` → `名`)', false, 'docs', {}, {
      [`${D}/lines/甲线.md`]: lineEnt('甲线'),
      [`${D}/designs/a.md`]: fm('active', 'design', { line: '甲线(K)' }),
    }],
    ['bad-line 全非法字符派生不出 slug(lineBadSlug;人判债,可 baseline)', true, 'docs', {}, {
      [`${D}/designs/a.md`]: fm('active', 'design', { line: ':*?' }),
    }],
    // NFC 分支必须用可分解字符测(F-006 教训:纯中文测 NFC 是恒真命题)
    ['ok-NFD 的 line 值解析到 NFC 实体(先归一再比对,D-007)', false, 'docs', {}, {
      [`${D}/lines/ガンダム対応.md`]: lineEnt('ガンダム対応'),
      [`${D}/designs/a.md`]: fm('active', 'design', { line: 'ガンダム対応'.normalize('NFD') }),
    }],
    ['bad-线实体文件名非 NFC(撞名暴露依赖归一)', true, 'docs', {}, {
      [`${D}/lines/${'ガンダム対応'.normalize('NFD')}.md`]: lineEnt('ガンダム対応'),
    }],
    ['bad-线实体 line ≠ 自身文件名 slug(身份声明不得两可)', true, 'docs', {}, {
      [`${D}/lines/x.md`]: lineEnt('x').replace('line: x', 'line: y'),
    }],
    ['bad-线实体 type 非 line', true, 'docs', {}, {
      [`${D}/lines/x.md`]: lineEnt('x').replace('type: line', 'type: design'),
    }],
    // ── 阶段 3:权威 / 生命周期图不变量(§7.2;D-015 只验快照)────────────────
    ['ok-取代成对:active 取代 snapshot,双向互指', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/new.md`]: fm('active', 'design', { id: '2026-01-02-新方案', supersedes: '2026-01-01-旧方案' }),
      [`${D}/designs/old.md`]: fm('snapshot', 'design', { id: '2026-01-01-旧方案', supersededBy: '2026-01-02-新方案' }),
    }],
    ['ok-取代成对:被取代方已入 archive(if-id 参与成对校验,frontmatter 随 git mv 走)', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/new.md`]: fm('active', 'design', { id: '2026-01-02-新方案', supersedes: '2026-01-01-旧方案' }),
      [`${D}/archive/old.md`]: '---\nid: 2026-01-01-旧方案\nsupersededBy: 2026-01-02-新方案\n---\n\n> 📦 已归档,被新方案取代。\n\n# 旧\n',
    }],
    ['bad-supersedes 悬垂(指向图中不存在的 id;方案 §7.2 表下注点名的检查)', true, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', { supersedes: '2026-01-01-不存在' }),
    }],
    ['bad-supersedes 不成对(对方未回指 supersededBy)', true, 'docs', {}, {
      ...LX,
      [`${D}/designs/new.md`]: fm('active', 'design', { id: '2026-01-02-新方案', supersedes: '2026-01-01-旧方案' }),
      [`${D}/designs/old.md`]: fm('snapshot', 'design', { id: '2026-01-01-旧方案' }),
    }],
    ['bad-supersededBy 反向不成对(对方没声明 supersedes)', true, 'docs', {}, {
      ...LX,
      [`${D}/designs/new.md`]: fm('active', 'design', { id: '2026-01-02-新方案' }),
      [`${D}/designs/old.md`]: fm('snapshot', 'design', { id: '2026-01-01-旧方案', supersededBy: '2026-01-02-新方案' }),
    }],
    ['bad-取代自环(supersedes 指向自身)', true, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', { id: '2026-01-01-自环', supersedes: '2026-01-01-自环' }),
    }],
    // deprecatedStatuses 置空以隔离新规则:默认档 superseded 本就红 statusDeprecated,
    // 不隔离的话 bad 用例会因别的规则红(假绿),ok 用例则根本绿不了
    ['bad-superseded 缺 supersededBy(终态字段;存量债可 baseline)', true, 'docs', { deprecatedStatuses: [] }, {
      ...LX,
      [`${D}/designs/a.md`]: fm('superseded', 'design'),
    }],
    ['ok-superseded 携 supersededBy 且成对(终态字段齐备)', false, 'docs', { deprecatedStatuses: [] }, {
      ...LX,
      [`${D}/designs/new.md`]: fm('active', 'design', { id: '2026-01-02-新方案', supersedes: '2026-01-01-旧方案' }),
      [`${D}/designs/old.md`]: fm('superseded', 'design', { id: '2026-01-01-旧方案', supersededBy: '2026-01-02-新方案' }),
    }],
    ['bad-双活(声明 supersededBy 却仍 active;成对一致也拦——否则旧文档忘改 status 即两个「现役」)', true, 'docs', {}, {
      ...LX,
      [`${D}/designs/new.md`]: fm('active', 'design', { id: '2026-01-02-新方案', supersedes: '2026-01-01-旧方案' }),
      [`${D}/designs/old.md`]: fm('active', 'design', { id: '2026-01-01-旧方案', supersededBy: '2026-01-02-新方案' }),
    }],
    ['bad-双权威:同线同 scope 两个 active+authoritative(§12 判据点名)', true, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', { authoritative: 'true' }),
      [`${D}/designs/b.md`]: fm('active', 'design', { authoritative: 'true' }),
    }],
    ['ok-同线双权威但 authorityScope 细分(缺省=整线,可细分)', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', { authoritative: 'true', authorityScope: '渲染' }),
      [`${D}/designs/b.md`]: fm('active', 'design', { authoritative: 'true', authorityScope: '排版' }),
    }],
    ['bad-双权威跨字母尾同线(「甲线(K)」与「甲线」slug 归并同键,D-007)', true, 'docs', {}, {
      [`${D}/lines/甲线.md`]: lineEnt('甲线'),
      [`${D}/designs/a.md`]: fm('active', 'design', { line: '甲线(K)', authoritative: 'true' }),
      [`${D}/designs/b.md`]: fm('active', 'design', { line: '甲线', authoritative: 'true' }),
    }],
    ['ok-非 active 的权威声明不占键(唯一性主语是 active+authoritative)', false, 'docs', {}, {
      ...LX,
      [`${D}/designs/a.md`]: fm('active', 'design', { authoritative: 'true' }),
      [`${D}/designs/b.md`]: fm('snapshot', 'design', { authoritative: 'true' }),
    }],
    ['bad-归档线被 active 文档引用(拆线/并线后 line 未同 commit 迁移)', true, 'docs', {}, {
      [`${D}/lines/x.md`]: lineEnt('x').replace('status: active', 'status: archived'),
      [`${D}/designs/a.md`]: fm('active', 'design'),
    }],
    ['ok-归档线被 snapshot 引用(冻结件的 line 是历史事实,不迫改写)', false, 'docs', {}, {
      [`${D}/lines/x.md`]: lineEnt('x').replace('status: active', 'status: archived'),
      [`${D}/designs/a.md`]: fm('snapshot', 'design'),
    }],
    ['ok-归档线墓碑独存(实体自引用不因自身已死而红;关线=改 status 留原地)', false, 'docs', {}, {
      [`${D}/lines/x.md`]: lineEnt('x').replace('status: active', 'status: archived'),
    }],
    ['bad-归档件的 supersededBy 悬垂(archive 参与图:扫描域=活区+归档+线)', true, 'docs', {}, {
      ...LX,
      [`${D}/archive/old.md`]: '---\nid: 2026-01-01-旧\nsupersededBy: 2026-01-01-不存在\n---\n\n> 📦 已归档。\n\n# 旧\n',
    }],
    // ── 阶段 4:status 分片实体自检(§4.1 item2 ⑥ 表;解析域 = line-status 的 statusDir)──
    ['ok-status 分片自洽(type rolling-status + line=自身 slug)', false, 'docs', RS, {
      ...LX, [`${D}/status/x.md`]: statusEnt('x'),
    }],
    ['bad-status 分片 type 非 rolling-status', true, 'docs', RS, {
      ...LX, [`${D}/status/x.md`]: statusEnt('x').replace('type: rolling-status', 'type: design'),
    }],
    ['bad-status 分片 line 与自身文件名漂移(每线恰好一片,D-016)', true, 'docs', RS, {
      ...LX, [`${D}/status/x.md`]: statusEnt('x').replace('line: x', 'line: y'),
    }],
    ['bad-status 分片文件名非 NFC(假名浊点)', true, 'docs', RS, {
      [`${D}/lines/ガンダム対応.md`]: lineEnt('ガンダム対応'),
      [`${D}/status/${'ガンダム対応'.normalize('NFD')}.md`]: statusEnt('ガンダム対応'),
    }],
    ['ok-无 line-status 处置则 status 门不设(D-014:门随处置声明)', false, 'docs', {}, {
      ...LX, [`${D}/status/x.md`]: statusEnt('x').replace('type: rolling-status', 'type: design'),
    }],
    // ── R4-11:仓根文件曾是 1a/1b 双盲区 ──────────────────────────────────────
    ['bad-仓根文件引用不可达(R4-11;auto 档并扫仓根文件)', true, 'docs', {}, {
      'README.md': `# 仓\n\n见 ${D}/gone.md\n`,
    }],
    ['ok-仓根文件引用存在(R4-11)', false, 'docs', {}, {
      ...LX,
      'README.md': `# 仓\n\n见 ${D}/real.md\n`,
      [`${D}/real.md`]: fm('active', 'design'),
    }],
    ['ok-显式 sourceRoots 不含 `.` ⇒ 不扫仓根(尊重「只扫我列的」)', false, 'docs', { sourceRoots: ['code'] }, {
      'README.md': `# 仓\n\n见 ${D}/gone.md\n`,
      'code/app.mjs': '// 无引用\n',
    }],
    ['bad-显式 sourceRoots 含 `.` ⇒ 点名并扫仓根', true, 'docs', { sourceRoots: ['code', '.'] }, {
      'README.md': `# 仓\n\n见 ${D}/gone.md\n`,
      'code/app.mjs': '// 无引用\n',
    }],
    // ── 1b 的 markdown 反引号语义(与 1a 对齐)────────────────────────────────
    ['ok-1b:.md 行内代码里的 docs 路径不算引用(实测触发点见 R4-11 注释)', false, 'docs', {}, {
      'README.md': `# 仓\n\ninit 会 stamp 到**你仓里的** \`${D}/runbooks/closeout.md\`\n`,
    }],
    ['ok-1b:.md 围栏内的 docs 路径不算引用', false, 'docs', {}, {
      'README.md': `# 仓\n\n\`\`\`yaml\ntarget: ${D}/gone.md\n\`\`\`\n`,
    }],
    ['bad-1b:.mjs 反引号里的 docs 路径**是**真引用(代码里反引号是字符串定界符)', true, 'docs', { sourceRoots: ['code'] }, {
      'code/app.mjs': `const p = \`${D}/gone.md\`;\n`,
    }],
    // ── P3 阶段 3:任务名唯一 + E1 team 声明(设计件 §1/§5;which='team' 只跑该门)──
    ['ok-无 mode 声明=solo,零语义变化', false, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '# 无 frontmatter 的草稿\n',
    }],
    ['ok-team 声明齐备(owner+collaborators,中文作者一等公民)', false, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: 小明\ncollaborators: alice, 小红\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-小明-01.md`]: '# 开线\n',
    }],
    ['bad-mode 非法枚举', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: multi\n---\n\n# p\n',
    }],
    ['bad-team 缺 owner(收口唯一发起人不可缺位)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\n---\n\n# p\n',
    }],
    ['bad-collaborators 含空白作者(作者段要进文件名与候选 ID)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\ncollaborators: bo b\n---\n\n# p\n',
    }],
    ['bad-owner 非 NFC(假名浊点;F-006 教训:NFC 负例不得用纯中文)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: `---\nmode: team\nowner: ${'ガンダム'.normalize('NFD')}\n---\n\n# p\n`,
    }],
    ['bad-solo 声明 collaborators(死配置同治,deadField 同判据)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\ncollaborators: alice\n---\n\n# p\n',
    }],
    ['bad-撞名:planning 在施任务复用 worklogs 已归档任务名(剥日期前缀后比对)', true, 'team', {}, {
      [`${D}/planning/2026-01-02-同名任务/task_plan.md`]: '# p\n',
      [`${D}/worklogs/2026-01-01-同名任务/task_plan.md`]: '# p\n',
    }],
    ['bad-撞名:worklogs 两个归档任务同名不同收口日', true, 'team', {}, {
      [`${D}/worklogs/2026-01-01-同名任务/task_plan.md`]: '# p\n',
      [`${D}/worklogs/2026-01-02-同名任务/task_plan.md`]: '# p\n',
    }],
    ['ok-异名任务共存(唯一门只咬重名)', false, 'team', {}, {
      [`${D}/planning/2026-01-02-甲任务/task_plan.md`]: '# p\n',
      [`${D}/worklogs/2026-01-01-乙任务/task_plan.md`]: '# p\n',
    }],
    ['ok-非任务目录不占名(无任何三件套即跳过)', false, 'team', {}, {
      [`${D}/planning/2026-01-02-同名任务/task_plan.md`]: '# p\n',
      [`${D}/worklogs/2026-01-01-同名任务/notes.md`]: '# 不是任务目录\n',
    }],
    // ── P3 阶段 4:E2/E3/E4/E5 events 档形态与文法(设计件 §2/§5)──────────────
    ['ok-team 完整形态(events 档 + 中文含连字符作者,贪婪解析两端定界)', false, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: 小-明\ncollaborators: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-小-明-01.md`]: '# 开线\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# 加入\n',
    }],
    ['bad-team 残留 progress.md(双真源)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress.md`]: '# 旧承载\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
    }],
    ['bad-team 零事件(须至少 1 个)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
    }],
    ['bad-solo 有 progress/ 目录(切档须显式迁移)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
    }],
    ['bad-progress/ 下有杂物(只许 events/)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/notes.md`]: '# 杂\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
    }],
    ['bad-事件文件名不合文法(时间戳不定宽)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/2026-01-01-alice-01.md`]: '# e\n',
    }],
    ['bad-事件 seq 一位(不定宽则 -10 排 -2 前,字典序破)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-1.md`]: '# e\n',
    }],
    ['bad-事件时间戳 13 月(语法合法、时刻荒谬;Date.UTC 往返拦)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20261301T080000Z-alice-01.md`]: '# e\n',
    }],
    ['bad-事件作者不在成员集合(E3;F-004 修复面)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-mallory-01.md`]: '# e\n',
    }],
    ['ok-team 候选 ID 带作者段(E5;每作者独立编号)', false, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\ncollaborators: 小明\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [`${D}/planning/t/findings.md`]: '# f\n\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n| F-alice-001 | x | experience |\n| F-小明-001 | y | design |\n',
    }],
    ['bad-team 候选 ID 裸编号(E5:team 强制作者段)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [`${D}/planning/t/findings.md`]: '# f\n\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n| F-001 | x | experience |\n',
    }],
    ['bad-team 候选作者段不在成员集合(E5)', true, 'team', {}, {
      [`${D}/planning/t/task_plan.md`]: '---\nmode: team\nowner: alice\n---\n\n# p\n',
      [`${D}/planning/t/progress/events/20260101T080000Z-alice-01.md`]: '# e\n',
      [`${D}/planning/t/findings.md`]: '# f\n\n| 候选 ID | 摘要 | 去向 |\n|---|---|---|\n| F-bob-001 | x | experience |\n',
    }],
    // 贪婪跨 `](` 的回归钉:链接文字本身就是 docs 路径时,`]` 不排除即产出拼接假路径
    ['ok-1b:markdown 链接文字与靶点同为 docs 路径且存在(`]` 须在排除集里)', false, 'docs', {}, {
      ...LX,
      'README.md': `# 仓\n\n见 [${D}/real.md](${D}/real.md)\n`,
      [`${D}/real.md`]: fm('active', 'design'),
    }],
    ['bad-1b:同上但靶点不存在(仍须红,且报的是真路径不是拼接串)', true, 'docs', {}, {
      'README.md': `# 仓\n\n见 [${D}/gone.md](${D}/gone.md)\n`,
    }],
    // ── R6-01:docs 子树不沿用源码根跳过集(build/dist 是文档仓完全合理的目录名)──
    ['bad-R6-01:docs/build 子树不再逃过文档门(无 frontmatter 须红)', true, 'docs', {}, {
      [`${D}/build/x.md`]: '# 无 frontmatter\n',
    }],
    // ── R6-03:括号文件名 / %-编码 / NFD 形态链接(中文文件名一等公民的主打场景)──
    ['ok-R6-03:半角括号文件名链接指向真实文件不假红', false, 'docs', {}, {
      ...LX,
      [`${D}/a.md`]: fm('active', 'design') + `[附](./a(1).md)\n`,
      [`${D}/a(1).md`]: fm('active', 'design'),
    }],
    ['ok-R6-03:%-编码中文链接指向真实文件不假红(VS Code 补全常产)', false, 'docs', {}, {
      ...LX,
      [`${D}/b.md`]: fm('active', 'design') + `[设计](./${encodeURIComponent('设计')}.md)\n`,
      [`${D}/设计.md`]: fm('active', 'design'),
    }],
    ['bad-R6-03:%-编码链接指向不存在文件仍红(重试不放水)', true, 'docs', {}, {
      ...LX,
      [`${D}/c.md`]: fm('active', 'design') + `[设计](./${encodeURIComponent('不存在')}.md)\n`,
    }],
    ['ok-R6-03:NFD 形态链接指向 NFC 文件不假红(假名浊点;F-006:NFC 用例不得用纯中文)', false, 'docs', {}, {
      ...LX,
      [`${D}/d.md`]: fm('active', 'design') + `[ガ](./${'ガンダム'.normalize('NFD')}.md)\n`,
      [`${D}/ガンダム.md`]: fm('active', 'design'),
    }],
    // ── R6-11:线实体与 status 分片对「line=自身文件名」同一把尺(slugify)──────
    ['ok-R6-11:线实体 line 值带 (X) 字母尾按 slugify 归并(与分片同尺,D-007)', false, 'docs', {}, {
      [`${D}/lines/甲线.md`]: `---\nid: 2026-01-01-线-甲线\nstatus: active\ntype: line\nline: 甲线(K)\ncreated: 2026-01-01\n---\n\n# 甲线\n`,
    }],
    ['bad-R6-11:线实体 line 值指向别的线仍红(同尺不放水)', true, 'docs', {}, {
      [`${D}/lines/甲线.md`]: `---\nid: 2026-01-01-线-甲线\nstatus: active\ntype: line\nline: 乙线\ncreated: 2026-01-01\n---\n\n# 甲线\n`,
      [`${D}/lines/乙线.md`]: lineEnt('乙线'),
    }],
  ];

  let failed = 0;

  // ── validateRepoRef 直证(R5-C1)──────────────────────────────────────────
  // 表驱动 fixture 只能证明「越仓引用会红」,证不了「红的原因是越仓、而非文件不存在」。
  // 故此处在仓外**真建一个文件**再断言它依旧被拒——坐实「验存 = 落点在本仓」,
  // 而非「磁盘上有这个文件」。这正是 R5-C1 逃逸的语义要害。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-ref-selftest-'));
    const outsideName = 'wk-outside-real.md';
    const outside = join(root, '..', outsideName);
    try {
      writeFileSync(outside, '仓外真实文件');
      const probes = [
        [`repo:../${outsideName}`, false, '仓外真实存在的文件仍被拒(不是找不到,是不在仓里)'],
        ['repo:docs/x.md', true, '仓内相对路径通过'],
        ['repo:/etc/passwd', false, '绝对路径(POSIX)被拒'],
        ['repo:C:/Windows/x.md', false, '绝对路径(盘符)被拒'],
        ['repo:docs/../../x.md', false, '中段 .. 被拒'],
        ['repo:docs//x.md', false, '空段被拒'],
        ['repo:./x.md', false, '`.` 段被拒'],
        ['docs/x.md', false, '缺 repo: 前缀被拒'],
        ['repo:src/x.rs@abc1234', false, '冻结语法在非 frozen 模式下被拒'],
      ];
      for (const [ref, expectOk, name] of probes) {
        const pass = validateRepoRef(root, ref).ok === expectOk;
        console.log(`${pass ? '✓' : '✗'} selftest-docs: repoRef ${name}`);
        if (!pass) failed++;
      }
      const okFrozen = validateRepoRef(root, 'repo:src/x.rs@abc1234', { frozen: true }).ok;
      console.log(`${okFrozen ? '✓' : '✗'} selftest-docs: repoRef 冻结引用在 frozen 模式通过`);
      if (!okFrozen) failed++;
      const fe = validateRepoRef(root, `repo:../${outsideName}@abc1234`, { frozen: true });
      const pass = !fe.ok && fe.reason === 'escape';
      console.log(`${pass ? '✓' : '✗'} selftest-docs: repoRef 冻结引用越仓判为 escape(非 grammar)`);
      if (!pass) failed++;
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { force: true });
    }
  }

  // ── source universe 直证(方案 §7.2 表 ≡ classifyFile)──────────────────────
  // fixture 只能证「这个文件红/不红」,证不了「它红是因为归在哪一档」。阶段 3/4 要按
  // 这张表取扫描域,故表本身须逐格可断言——否则设计正文那张表会安静地漂移成愿望。
  {
    const c = { docsDir: 'docs' };
    const probes = [
      ['docs/designs/a.md', 'governed', true, true, false, true, true],
      ['docs/README.md', 'governed', true, true, false, true, true],
      // closeout 是台账非知识本体:index ⬜(§7.2 表;此格曾与设计表漂移,阶段 4 生成器
      // 上线时对齐——probe 只断言「红/不红」测不出没人读的格,表驱动直证才测得出)
      ['docs/worklogs/t/closeout.md', 'governed', true, true, false, true, false],
      ['docs/worklogs/t/task_plan.md', 'trio', false, false, false, false, false],
      ['docs/planning/t/findings.md', 'trio', false, false, false, false, false],
      ['docs/planning/t/progress.md', 'trio', false, false, false, false, false],
      // event(P3 设计件 §2):progress/ 子树全豁免(零 frontmatter,D-027),契约在文件名由 E2/E3 守
      ['docs/planning/t/progress/events/20260101T080000Z-alice-01.md', 'event', false, false, false, false, false],
      ['docs/worklogs/2026-01-01-t/progress/events/20260101T080000Z-alice-01.md', 'event', false, false, false, false, false],
      ['docs/planning/t/progress/notes.md', 'event', false, false, false, false, false],
      // trio 是**按路径 + 文件名**豁免的:同名文件出现在别处不享受豁免
      ['docs/designs/findings.md', 'governed', true, true, false, true, true],
      ['docs/archive/old.md', 'archive', false, false, true, 'if-id', false],
    ];
    for (const [rel, cls, links, frontmatter, banner, graph, index] of probes) {
      const g = classifyFile(c, rel);
      const pass = g.cls === cls && g.links === links && g.frontmatter === frontmatter
        && g.banner === banner && g.graph === graph && g.index === index;
      console.log(`${pass ? '✓' : '✗'} selftest-docs: universe ${rel} → ${cls}${pass ? '' : `(实得 ${JSON.stringify(g)})`}`);
      if (!pass) failed++;
    }
    // R6-02:多段 docsDir(schema 放行 `docs/sub`)下同表逐格成立——原实现按段下标
    //(seg[0]===d)隐含单段假设,event/trio 豁免多段时全落 governed,D-027 破产。
    const c2 = { docsDir: 'docs/sub' };
    const probes2 = [
      ['docs/sub/planning/t/progress/events/20260101T080000Z-alice-01.md', 'event', false, false, false, false, false],
      ['docs/sub/planning/t/progress/notes.md', 'event', false, false, false, false, false],
      ['docs/sub/worklogs/t/task_plan.md', 'trio', false, false, false, false, false],
      ['docs/sub/worklogs/t/closeout.md', 'governed', true, true, false, true, false],
      ['docs/sub/designs/a.md', 'governed', true, true, false, true, true],
      ['docs/sub/archive/old.md', 'archive', false, false, true, 'if-id', false],
    ];
    for (const [rel, cls, links, frontmatter, banner, graph, index] of probes2) {
      const g = classifyFile(c2, rel);
      const pass = g.cls === cls && g.links === links && g.frontmatter === frontmatter
        && g.banner === banner && g.graph === graph && g.index === index;
      console.log(`${pass ? '✓' : '✗'} selftest-docs: universe(多段 docsDir)${rel} → ${cls}${pass ? '' : `(实得 ${JSON.stringify(g)})`}`);
      if (!pass) failed++;
    }
  }

  // ── R6-02 连带:多段 docsDir 的顶层树不得被 auto 档拖进 1b ───────────────────
  // skip 集按顶层名匹配,docsDir=docs/sub 时顶层 `docs` 曾不在集里,整棵文档树成 source root。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-msdocs-selftest-'));
    try {
      mkdirSync(join(root, 'docs', 'sub'), { recursive: true });
      mkdirSync(join(root, 'code'), { recursive: true });
      const names = resolveSourceRoots(root, { sourceRoots: 'auto', sourceExclude: [], docsDir: 'docs/sub' })
        .map((p) => relPath(root, p));
      const pass = names.includes('code') && !names.some((n) => n === 'docs' || n.startsWith('docs/'));
      console.log(`${pass ? '✓' : '✗'} selftest-docs: R6-02 多段 docsDir 顶层树不入 auto source roots${pass ? '' : `(实得 ${JSON.stringify(names)})`}`);
      if (!pass) failed++;
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // ── D-013 教义直证:图不变量结构上不可 baseline ──────────────────────────────
  // 允许清单靠「默认拦」保安全,但清单是可编辑的数据——此处把教义钉成断言:
  // 谁把图规则加进清单,这里当场红,而不是等某个仓静默豁免掉双权威才被发现。
  {
    const graphRules = ['docs.idDuplicate', 'docs.authorityDuplicate', 'docs.idrefDangling',
      'docs.supersedesUnpaired', 'docs.supersedesSelf', 'docs.supersededButAlive', 'docs.lineArchivedRef',
      // P3 阶段 3:撞名主语是任务名(非单文件),team 声明是新写字段(无存量债)——同教义
      'team.taskNameDup', 'team.modeInvalid', 'team.ownerMissing', 'team.authorInvalid', 'team.collabWithoutTeam'];
    const leaked = graphRules.filter((r) => BASELINE_ELIGIBLE.has(r));
    console.log(`${leaked.length === 0 ? '✓' : '✗'} selftest-docs: 图不变量全部不可 baseline(D-013)${leaked.length ? `(泄漏:${leaked.join(', ')})` : ''}`);
    if (leaked.length) failed++;
    const ok = BASELINE_ELIGIBLE.has('docs.supersededNoRef');
    console.log(`${ok ? '✓' : '✗'} selftest-docs: supersededNoRef 可 baseline(per-file 终态字段人判债,唯一例外)`);
    if (!ok) failed++;
  }

  // ── 1b 报出的 ref 必须是**真路径**,不是拼接串 ──────────────────────────────
  // 表驱动只断言「红了」,而拼接串也会红——坏用例会因非预期原因通过,测不到它本要测的东西。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-ref1b-selftest-'));
    try {
      writeFileSync(join(root, 'README.md'), `见 [${D}/gone.md](${D}/gone.md)\n`);
      const got = [];
      checkDocsAndLinks(root, cfg({ sourceRoots: ['.'] }), (v) => got.push(v), true);
      const refs = [...new Set(got.filter((v) => v.rule === 'docs.refUnreachable').map((v) => v.params.ref))];
      const pass = refs.length === 1 && refs[0] === `${D}/gone.md`;
      console.log(`${pass ? '✓' : '✗'} selftest-docs: 1b 报出的 ref 是真路径而非跨 \`](\` 的拼接串${pass ? '' : `(实得 ${JSON.stringify(refs)})`}`);
      if (!pass) failed++;
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  for (const [name, expectBad, which, over, files] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'wk-docs-selftest-'));
    try {
      for (const [rel, content] of Object.entries(files)) {
        const abs = join(root, ...rel.split('/'));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      const got = [];
      const report = (v) => got.push(v);
      const config = cfg(over);
      if (which === 'closeout') checkCloseouts(root, config, report);
      else if (which === 'team') checkTeamAndTaskNames(root, config, report);
      else checkDocsAndLinks(root, config, report, false);
      const pass = expectBad ? got.length > 0 : got.length === 0;
      console.log(`${pass ? '✓' : '✗'} selftest-docs: ${name}${pass ? '' : `(违规 ${got.length} 条:${got.map((v) => `${locOf(v)} ${v.rule}`).join(' | ') || '无'})`}`);
      if (!pass) failed++;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  console.log(failed ? `\n✗ check-docs selftest 失败 ${failed} 项` : '\n✓ check-docs selftest 全部通过');
  return failed ? 1 : 0;
}
