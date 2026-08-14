// 项目配置加载:读 .worklogrc.jsonc(JSONC:允许 // 与 /* */ 注释),与 DEFAULTS 合并。
// R2-C5:配置格式裁 JSONC + JSON Schema。
// R5-M2:JSON Schema 已成为**运行期真源**——校验由 schema/worklogrc.schema.json 驱动
// (见 lib/schema.mjs),不再是「编辑器里有提示、运行期不读」的摆设。
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, realpathSync, statSync, lstatSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PKG_ROOT } from './fsutil.mjs';
import { validateJsonSchema } from './schema.mjs';

export const CONFIG_NAME = '.worklogrc.jsonc';

/**
 * 本工具版本支持的配置布局版本,升序。**旧版本仍可读**(按其版本的 schema 校验、
 * 载入时归一为最新内部形态),这是 R5-C3 的要求:不得只上门不给梯子——存量仓看见
 * 新门的同时必须能跑 `worklog-kit upgrade`。不在此列的版本(未来版本)一律拒绝:
 * 用旧引擎解释新布局,得到的是基于错误 schema 的判定。
 */
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6];
export const LATEST_SCHEMA_VERSION = 6;

/** 采纳档(D-002 四档砍两档;`advisory` 降为 `--warn-only` 标志、`greenfield` 并入 strict) */
export const PROFILES = ['strict', 'brownfield'];

const _schemas = new Map();
/** 懒加载某版本的 schema(包内文件,读一次即缓存) */
export function configSchema(version = LATEST_SCHEMA_VERSION) {
  if (!_schemas.has(version)) {
    _schemas.set(version, JSON.parse(readFileSync(join(PKG_ROOT, 'schema', `worklogrc.v${version}.schema.json`), 'utf8')));
  }
  return _schemas.get(version);
}

/**
 * 内置 type 能否承载 `authoritative: true`(§7.2 权威唯一不变量据此判定)。
 * D-003:这是**实例**的默认值,用户可改;元模型只规定「每个 type 带 canBeAuthoritative 布尔」。
 * 判据 = 「它是不是某条线在某个范围内的**当前答案**」——是则可权威,只是过程或时点记录则否。
 */
export const BUILTIN_AUTHORITATIVE = {
  design: true, decision: true, runbook: true, canon: true, experience: true,
  review: false, // 审查是**时点快照**,不是某条线的当前答案
  'working-memory': false, // 过程件,收口即冻结
  closeout: false, // 处置台账,不是知识本体
  index: false, // 索引/生成物
  line: false, // 线实体是线的**身份声明**,不是线的当前答案(§4.1 item2 ⑥)
};

/** 默认配置(与 templates/worklogrc.jsonc 保持一致;缺配置文件时兜底) */
export const DEFAULTS = {
  schemaVersion: LATEST_SCHEMA_VERSION,
  lang: 'zh',
  docsDir: 'docs',
  dirs: ['designs', 'reviews', 'decisions', 'runbooks', 'lines', 'planning', 'worklogs', 'archive'],
  status: ['draft', 'active', 'snapshot', 'superseded', 'archived'],
  deprecatedStatuses: ['superseded'],
  // 哪些 status 表示“当前答案”。权威资格(type)与当前性(status)是两条正交机器信号；
  // 显式建模后，自定义状态无需冒充 active，历史 snapshot 也不会占当前权威名额。
  authoritativeStatuses: ['active'],
  types: [
    { name: 'design', canBeAuthoritative: true },
    { name: 'review', canBeAuthoritative: false },
    { name: 'decision', canBeAuthoritative: true },
    { name: 'runbook', canBeAuthoritative: true },
    { name: 'canon', canBeAuthoritative: true },
    { name: 'working-memory', canBeAuthoritative: false },
    { name: 'closeout', canBeAuthoritative: false },
    { name: 'index', canBeAuthoritative: false },
    { name: 'line', canBeAuthoritative: false },
    { name: 'experience', canBeAuthoritative: true },
  ],
  dispositions: [
    { name: 'experience', targetKind: 'docs' },
    { name: 'decision', targetKind: 'docs' },
    { name: 'design', targetKind: 'docs' },
    { name: 'runbook', targetKind: 'docs' },
    { name: 'completed', targetKind: 'docs' },
    { name: 'todo', targetKind: 'fixed', target: 'docs/todo.md' },
    { name: 'code', targetKind: 'frozen-ref' },
    { name: 'test', targetKind: 'frozen-ref' },
    { name: 'no-promotion', targetKind: 'none', reasonRequired: true },
  ],
  sourceRoots: 'auto',
  // .claude/.github/.worklog 是 agent/CI/本工具的配置与模板(非应用源码),其内文档常以
  // docs/xxx.md 作示例/占位符,纳入 1b 扫描会误报断链——默认排除(1b 只针对应用代码引用
  // docs 的场景)。`.worklog/templates/` 尤其如此:模板里的 target 样例是**示范**不是引用。
  sourceExclude: ['node_modules', 'dist', 'build', 'target', '.git', '.venv', 'vendor', 'coverage', '.claude', '.github', '.worklog'],
  profile: 'strict',
  // v5 起 index 兼答「索引形态档」(§4.1 M-4 三档梯度的机器面):mode=invariant(手工索引 +
  // 不变量门,MVP 默认)| generated(`index build` 生成、产物不入库 C-3)。outDir 是生成物
  // 专用目录——放仓根 `.worklog/` 家族而非 docsDir 下:docsDir 里每个 .md 都过 frontmatter 门,
  // 生成物没有合法 frontmatter,放进去等于 build 完当场红(与模板放 `.worklog/` 同一判据)。
  index: { dirTableHeading: '目录职责', archivedHeading: '已归档任务', mode: 'invariant', outDir: '.worklog/generated' },
  archiveBannerMarkers: ['已归档', '已废弃', '已执行', '被推翻', '已过时', 'archived', 'superseded', 'deprecated'],
};

/** 索引形态档(D-009 裸 `worklog-kit index` 按此别名)。config.index 是**浅合并**——用户只声明
 *  headings 时 DEFAULTS.index 整体被替换,故缺省值在此兜底,不在合并层。 */
export const indexMode = (config) => config.index?.mode || 'invariant';

/** 生成物专用输出目录(artifact contract,R5-M7)。 */
export const generatedOutDir = (config) => config.index?.outDir || '.worklog/generated';

/** 索引章节标题(展示面)。同浅合并问题:`config.index || DEFAULTS.index` 的**整对象**兜底
 *  在用户只声明 `{mode}` 时失效(对象 truthy、键却缺)——e2e 升档链路实测崩在这儿,
 *  故必须**逐键**兜底,且集中一处。 */
export const indexHeadings = (config) => ({
  dirTableHeading: config.index?.dirTableHeading || DEFAULTS.index.dirTableHeading,
  archivedHeading: config.index?.archivedHeading || DEFAULTS.index.archivedHeading,
});

/**
 * 剥除 JSONC 语法(// 行注释、/* *\/ 块注释、尾随逗号),还原为标准 JSON 文本。
 * 状态机逐字符扫描:追踪是否在字符串、是否在注释——字符串内的 `//` 与 `,}` 均不误伤。
 */
export function stripJsonc(src) {
  let out = '';
  let inStr = false, inLine = false, inBlock = false, esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    // 尾随逗号(JSON 不允许 `,}` / `,]`)必须在**状态机内**消除。R4-04:原实现是剥完
    // 注释后对全文跑 /,(\s*[}\]])/g —— 正则不知道自己身在何处,于是把**字符串值里**的
    // `,}` 一并吃掉:parseJsonc('{"a": "x,}" }') 曾返回 { a: "x}" },配置值被静默篡改。
    // 状态机走到这里时已确知不在字符串内,删的必是结构逗号。
    if (c === '}' || c === ']') {
      const m = /,(\s*)$/.exec(out);
      if (m) out = out.slice(0, m.index) + m[1]; // 只摘逗号、留空白:错误行号不因此漂移
    }
    out += c;
  }
  return out;
}

/** 解析 JSONC 文本 → 对象。R6-08:先剥 BOM——PowerShell 5.1 `Out-File -Encoding utf8`
 *  默认带 BOM,主平台常态;frontmatter 层早有剥/保 BOM 纪律,配置层此前缺席,
 *  同仓两套 BOM 待遇,带 BOM 的配置整体静默回落 DEFAULTS。 */
export function parseJsonc(src) {
  return JSON.parse(stripJsonc(src.charCodeAt(0) === 0xfeff ? src.slice(1) : src));
}

/** 仓内相对路径:非绝对、无 `..`/空段/`.` 段、**无反斜杠**(R6-10:机器面锁 `/`——
 *  `docs\generated` 曾过校验,Windows 上真落进 docsDir,outDir⊂docsDir 守卫被绕过)。
 *  与 check-docs 的 repo ref containment 同源。 */
const isSafeRelPath = (p) => !!p && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\')
  && !p.split('/').some((s) => s === '' || s === '.' || s === '..');

const isWithin = (root, p) => {
  const rel = relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/**
 * 把机器面相对路径解析为仓内绝对路径,并检查既有路径前缀的 realpath。
 * 字符串 containment 不足以挡住仓内 symlink 指向仓外；目标尚不存在时也要检查
 * 最近的既有祖先，供 upgrade 在任何备份/写入前做统一预检。
 *
 * @returns {{ok: true, path: string}|{ok: false, reason: string}}
 */
export function resolveRepoPath(root, rel, { allowRoot = false, needExist = false, needDirectory = false, needFile = false } = {}) {
  if (typeof rel !== 'string' || !((allowRoot && rel === '.') || isSafeRelPath(rel))) {
    return { ok: false, reason: '须为仓内相对路径(只用 /,不得含空段、. 或 ..)' };
  }
  try {
    const rootReal = realpathSync(root);
    const abs = rel === '.' ? rootReal : resolve(rootReal, ...rel.split('/'));
    if (!isWithin(rootReal, abs)) return { ok: false, reason: '解析后越出仓根' };
    if (needExist && !existsSync(abs)) return { ok: false, reason: needDirectory ? '目录不存在' : '路径不存在' };
    if (needDirectory && (!existsSync(abs) || !statSync(abs).isDirectory())) {
      return { ok: false, reason: existsSync(abs) ? '不是目录' : '目录不存在' };
    }
    // 普通文件语义刻意用 lstat：stat 会跟随最终 symlink，使一个链接可冒充真实知识落点。
    if (needFile && (!existsSync(abs) || !lstatSync(abs).isFile())) {
      return { ok: false, reason: existsSync(abs) ? '不是普通文件' : '文件不存在' };
    }

    let probe = abs;
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
    const real = realpathSync(probe);
    if (!isWithin(rootReal, real)) return { ok: false, reason: '既有路径或父目录经符号链接指向仓外' };
    return { ok: true, path: abs };
  } catch (e) {
    return { ok: false, reason: `无法确认真实路径:${e.message}` };
  }
}

/** 取 type 名字列表(内部形态恒为 v2 对象数组;此助手让调用方不必重复知道这件事) */
export const typeNames = (config) => config.types.map((x) => x.name);

/**
 * 把任意受支持版本的配置**归一为最新内部形态**。
 *
 * 这是「梯子先于门」的落地(R5-C3):v1 配置照样能跑门——载入时归一即可,不必先 upgrade。
 * `upgrade` 只负责把**磁盘上的文件**推进到最新版,好让文件声明的版本与实际一致、
 * 且能用上只有新版才表达得了的东西(如 `line-status`)。二者分工:归一保证**今天能用**,
 * upgrade 保证**明天能用新功能**。
 *
 * 只转换 parsed 自己声明过的键;缺的键留给 DEFAULTS 合并补。
 */
export function normalizeConfig(parsed) {
  const out = { ...parsed };
  // v1:types 是字符串数组;v2:对象数组带 canBeAuthoritative
  if (Array.isArray(out.types) && out.types.every((x) => typeof x === 'string')) {
    // 未知 type 一律 false:一个我们不认识的 type **不该静默获得权威资格**。
    // 保守方向是可修的(用户改配置),反过来则是个安静的错误。
    out.types = out.types.map((name) => ({ name, canBeAuthoritative: BUILTIN_AUTHORITATIVE[name] ?? false }));
  }
  // v1-v5 没有 current-authority role 槽位。旧引擎只认 status:active，因此迁入内部
  // 形态时精确保留旧语义：有 active 就是 [active]，没有则为空，绝不猜哪个自定义值等价。
  if (!Array.isArray(out.authoritativeStatuses)) {
    out.authoritativeStatuses = Array.isArray(out.status) && out.status.includes('active') ? ['active'] : [];
  }
  out.schemaVersion = LATEST_SCHEMA_VERSION;
  return out;
}

/** 文档是否占用“当前权威”名额。门禁与 STATUS 生成器必须共用，避免再次语义分叉。 */
export function isCurrentAuthority(config, data) {
  return data?.authoritative === 'true'
    && (config.authoritativeStatuses || []).includes(data.status);
}

/**
 * schema 表达不了的语义约束。JSON Schema 管得住形状(类型/必填/枚举/未知键),
 * 管不住:版本是否被**本工具版本**支持、跨条目唯一性、条件必填、路径是否越仓。
 * 这些不塞进 schema 是因为 draft-07 表达它们要用 if/then 与投影唯一性——
 * schema 会变成一台需要自己的测试的机器,得不偿失。
 */
function validateSemantics(cfg, root) {
  const errors = [];
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return [`配置顶层须为对象(收到:${cfg === null ? 'null' : Array.isArray(cfg) ? 'array' : typeof cfg})`];
  }
  // schemaVersion:upgrade/migration registry 按它逐级迁移。schema 只断言它是整数;
  // 「这个整数本工具认不认」是版本契约,须在此判——否则未来版本的配置会被当合法
  // 输入喂给旧引擎,得到一个基于错误 schema 的判定。
  if (Number.isInteger(cfg.schemaVersion) && !SUPPORTED_SCHEMA_VERSIONS.includes(cfg.schemaVersion)) {
    errors.push(`schemaVersion ${cfg.schemaVersion} 不受本工具版本支持(支持:${SUPPORTED_SCHEMA_VERSIONS.join('/')});请升级 worklog-kit,或用旧版跑 worklog-kit upgrade`);
  }
  if (typeof cfg.docsDir === 'string' && !isSafeRelPath(cfg.docsDir)) {
    errors.push(`docsDir 须为仓内相对路径(收到:${cfg.docsDir})`);
  } else if (typeof cfg.docsDir === 'string') {
    const checked = resolveRepoPath(root, cfg.docsDir);
    if (!checked.ok) errors.push(`docsDir 须真实解析在仓内(收到:${cfg.docsDir};${checked.reason})`);
  }
  // R7-05:dirs 驱动 init 写盘(join(root, docsDir, dir) + .gitkeep)与索引门三方一致,
  // 是路径类键里唯一没接 isSafeRelPath 的——`../../x` 曾让 init exit 0 且 .gitkeep 落仓外。
  // 另锁单段:索引门拿 dirs 与 docsDir 顶层 readdir 双向比,多段条目结构上永不可满足。
  if (Array.isArray(cfg.dirs)) {
    for (const d of cfg.dirs) {
      if (typeof d !== 'string') continue; // 形状错 schema 已报
      if (!isSafeRelPath(d) || d.includes('/')) errors.push(`dirs 条目须为单段目录名(收到:${d})`);
      else if (typeof cfg.docsDir === 'string' && isSafeRelPath(cfg.docsDir)) {
        const checked = resolveRepoPath(root, `${cfg.docsDir}/${d}`);
        if (!checked.ok) errors.push(`dirs 条目须真实解析在仓内(收到:${d};${checked.reason})`);
      }
    }
  }
  if (Array.isArray(cfg.sourceRoots)) {
    for (const sourceRoot of cfg.sourceRoots) {
      if (typeof sourceRoot !== 'string') continue; // 形状错由 schema 报
      // 缺失目录仍合法：不少仓会先声明条件生成/后续创建的源码根，walker 对缺失根本就
      // 安全返回空。存在时才要求目录；无论存在与否，最近既有祖先均须 realpath 留在仓内。
      const checked = resolveRepoPath(root, sourceRoot, { allowRoot: true });
      if (!checked.ok) errors.push(`sourceRoots 条目须为仓根内实际目录(收到:${sourceRoot};${checked.reason})`);
      else if (existsSync(checked.path) && !lstatSync(checked.path).isDirectory()) {
        errors.push(`sourceRoots 条目存在时须为目录(收到:${sourceRoot};不是目录)`);
      }
    }
  }
  // R7-06:核心数组空置时 init 照常 exit 0,check/index 门必红——配置合法性须蕴含
  // 「产出的仓能过自己的门」。不入 schema minItems 是因为五本历史 schema 得同批改,
  // 语义层一处覆盖全部受支持版本(与本函数存在理由一致:单点、跨版本)。
  for (const k of ['dirs', 'status', 'types', 'dispositions']) {
    if (Array.isArray(cfg[k]) && cfg[k].length === 0) {
      errors.push(`${k} 不得为空数组(init 会照常成功,但 check/index 必红)`);
    }
  }
  if (Array.isArray(cfg.types)) {
    const seen = new Set();
    for (const x of cfg.types) {
      const name = typeof x === 'string' ? x : x?.name;
      if (typeof name !== 'string') continue; // 形状错 schema 已报
      if (seen.has(name)) errors.push(`type ${name} 重复声明(name 是 type 主键)`);
      seen.add(name);
    }
  }
  if (cfg.index && typeof cfg.index === 'object' && cfg.index.outDir !== undefined) {
    const od = cfg.index.outDir;
    if (typeof od !== 'string' || !isSafeRelPath(od)) {
      errors.push(`index.outDir 须为仓内相对路径(收到:${JSON.stringify(od)})`);
    } else if (typeof cfg.docsDir === 'string' && (od === cfg.docsDir || od.startsWith(`${cfg.docsDir}/`))) {
      // 生成物没有合法 frontmatter,放进受治理目录 = build 完当场被自己的门判红
      errors.push(`index.outDir 不得位于 docsDir 之内(收到:${od});生成物不受 frontmatter 治理,建议仓根 .worklog/generated`);
    } else {
      const checked = resolveRepoPath(root, od);
      if (!checked.ok) errors.push(`index.outDir 须真实解析在仓内(收到:${od};${checked.reason})`);
    }
  }
  if (Array.isArray(cfg.dispositions)) {
    const seen = new Set();
    for (const d of cfg.dispositions) {
      if (!d || typeof d.name !== 'string') continue; // 形状错 schema 已报,不重复
      if (seen.has(d.name)) errors.push(`disposition ${d.name} 重复声明(name 是处置规则主键,重复则后者静默遮蔽前者)`);
      seen.add(d.name);
      // 条件必填 + 路径安全:schema 的 additionalProperties 管得住「有没有这个键」,
      // 管不住「这个 kind 该不该有这个键」。
      if (d.targetKind === 'fixed') {
        if (typeof d.target !== 'string') errors.push(`disposition ${d.name}(fixed)缺 target`);
        else if (!isSafeRelPath(d.target)) errors.push(`disposition ${d.name} 的 target 须为仓内相对路径(收到:${d.target})`);
        else {
          const checked = resolveRepoPath(root, d.target);
          if (!checked.ok) errors.push(`disposition ${d.name} 的 target 须真实解析在仓内(收到:${d.target};${checked.reason})`);
        }
      } else if (d.target !== undefined) {
        errors.push(`disposition ${d.name}(targetKind=${d.targetKind})不应有 target——它不会被读,是死配置`);
      }
      if (d.targetKind === 'line-status') {
        if (typeof d.statusDir !== 'string') errors.push(`disposition ${d.name}(line-status)缺 statusDir`);
        else if (!isSafeRelPath(d.statusDir)) errors.push(`disposition ${d.name} 的 statusDir 须为仓内相对路径(收到:${d.statusDir})`);
        else {
          const checked = resolveRepoPath(root, d.statusDir);
          if (!checked.ok) errors.push(`disposition ${d.name} 的 statusDir 须真实解析在仓内(收到:${d.statusDir};${checked.reason})`);
        }
      } else if (d.statusDir !== undefined) {
        errors.push(`disposition ${d.name}(targetKind=${d.targetKind})不应有 statusDir——它不会被读,是死配置`);
      }
      // v6 才把 none⇒reasonRequired=true 升为元模型契约。v1-v5 的历史配置允许缺省,
      // 由 v5→v6 migration 自动补齐；否则 upgrade 的安全预检会把合法旧配置锁死。
      if (cfg.schemaVersion >= 6 && d.targetKind === 'none' && d.reasonRequired !== true) {
        errors.push(`disposition ${d.name}(targetKind=none)的 reasonRequired 必须为 true`);
      }
    }
  }
  if (Array.isArray(cfg.authoritativeStatuses)) {
    const status = new Set(Array.isArray(cfg.status) ? cfg.status : []);
    const deprecated = new Set(Array.isArray(cfg.deprecatedStatuses) ? cfg.deprecatedStatuses : []);
    const seen = new Set();
    for (const s of cfg.authoritativeStatuses) {
      if (typeof s !== 'string') continue; // 形状错由 schema 报
      if (seen.has(s)) errors.push(`authoritativeStatuses 条目不得重复(收到:${s})`);
      seen.add(s);
      if (!status.has(s)) errors.push(`authoritativeStatuses 条目须同时存在于 status(收到:${s})`);
      if (deprecated.has(s)) errors.push(`authoritativeStatuses 不得包含 deprecatedStatuses 的终态值(收到:${s})`);
    }
  }
  return errors;
}

/**
 * 加载项目配置。找不到配置文件则返回 DEFAULTS(允许零配置起步,但推荐 init 生成)。
 *
 * ⚠️ 校验对象是**磁盘上的原文**(parsed),不是与 DEFAULTS 合并后的结果(R5-M2)——
 * 先合并再校验会让 DEFAULTS 替用户补齐必需键,「缺必需键」这条规则永远报不出来:
 * 那正是原 validateShape 声称在查、实际查不到的东西。
 *
 * 返回的 `config` 恒为**最新内部形态**(见 normalizeConfig);`fileVersion` 是磁盘上
 * 声明的版本,`doctor`/`upgrade` 据它判断该不该催升级。
 *
 * @param {string} cwd 项目根
 * @returns {{ config: object, path: string|null, errors: string[], fileVersion: number|null, raw: object|null }}
 */
export function loadConfig(cwd) {
  const path = join(cwd, CONFIG_NAME);
  if (!existsSync(path)) return { config: { ...DEFAULTS }, path: null, errors: [], fileVersion: null, raw: null };
  let parsed;
  try {
    parsed = parseJsonc(readFileSync(path, 'utf8'));
  } catch (e) {
    return { config: { ...DEFAULTS }, path, errors: [`配置解析失败:${e.message}`], fileVersion: null, raw: null };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: { ...DEFAULTS }, path, errors: validateSemantics(parsed, cwd), fileVersion: null, raw: parsed };
  }
  // 版本先定,才知道拿哪本 schema 去量。版本本身不合法则无从校验其余部分——
  // 拿 v2 的尺子量一份 v1 配置,报出来的会是一串似是而非的假错。
  const v = parsed?.schemaVersion;
  const semanticErrors = validateSemantics(parsed, cwd);
  const versionErrors = semanticErrors.filter((e) => e.startsWith('schemaVersion'));
  if (!Number.isInteger(v) || !SUPPORTED_SCHEMA_VERSIONS.includes(v)) {
    const errs = versionErrors.length ? versionErrors : [`schemaVersion 缺失或非整数(收到:${JSON.stringify(v)});须为 ${SUPPORTED_SCHEMA_VERSIONS.join('/')} 之一`];
    return { config: { ...DEFAULTS }, path, errors: errs, fileVersion: null, raw: parsed };
  }
  const errors = [
    ...validateJsonSchema(configSchema(v), parsed, CONFIG_NAME),
    ...semanticErrors,
  ];
  return { config: { ...DEFAULTS, ...normalizeConfig(parsed) }, path, errors, fileVersion: v, raw: parsed };
}

// ── selftest:JSONC 解析保真 + schema 运行期兑现 ───────────────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-config: ${name}`); if (!cond) failed++; };

  // 1. JSONC 解析:注释与尾随逗号要剥,**字符串值一个字节都不许动**
  const parses = [
    // R4-04 回归钉:原实现剥完注释后跑 /,(\s*[}\]])/g,把字符串里的 `,}` 也吃了
    ['{"a": "x,}" }', { a: 'x,}' }, 'R4-04:字符串值内的 `,}` 不被当尾随逗号吃掉'],
    ['{"a": "x,]" }', { a: 'x,]' }, '字符串值内的 `,]` 不被吃掉'],
    ['{"a": "http://x"}', { a: 'http://x' }, '字符串值内的 `//` 不被当行注释'],
    ['{"a": "/* not a comment */"}', { a: '/* not a comment */' }, '字符串值内的块注释标记不被剥'],
    ['{"a": "say \\"hi,}\\"" }', { a: 'say "hi,}"' }, '转义引号内的 `,}` 不被吃掉'],
    ['{"a": 1, // c\n "b": 2}', { a: 1, b: 2 }, '行注释被剥'],
    ['{"a": 1, /* c */ "b": 2}', { a: 1, b: 2 }, '块注释被剥'],
    ['{"a": 1,\n}', { a: 1 }, '对象尾随逗号被剥'],
    ['{"a": [1, 2,]}', { a: [1, 2] }, '数组尾随逗号被剥'],
    ['{"a": [1, 2, // c\n]}', { a: [1, 2] }, '注释后的尾随逗号被剥'],
    ['{"a": {"b": 1,},}', { a: { b: 1 } }, '嵌套尾随逗号被剥'],
  ];
  for (const [src, want, name] of parses) {
    let got;
    try { got = parseJsonc(src); } catch (e) { got = `抛错:${e.message}`; }
    assert(JSON.stringify(got) === JSON.stringify(want), `${name}(得:${JSON.stringify(got)})`);
  }

  // 2. schema 运行期兑现:下列配置都应报错,原实现一律 errors=[]
  const base = {
    schemaVersion: 2, docsDir: 'docs', dirs: ['designs'], status: ['active'],
    types: [{ name: 'design', canBeAuthoritative: true }],
    dispositions: [{ name: 'experience', targetKind: 'docs' }],
  };
  const v1base = {
    schemaVersion: 1, docsDir: 'docs', dirs: ['designs'], status: ['active'],
    types: ['design'], dispositions: [{ name: 'experience', targetKind: 'docs' }],
  };
  const v6base = { ...base, schemaVersion: 6, authoritativeStatuses: ['active'] };
  const cases = [
    ['ok-最小合法配置(v2)', base, false],
    ['ok-最小合法配置(v1;旧版仍可读——梯子先于门)', v1base, false],
    ['ok-包内模板配置', JSON.parse(stripJsonc(readFileSync(join(PKG_ROOT, 'templates', 'worklogrc.jsonc'), 'utf8'))), false],
    ['ok-line-status 声明 statusDir(D-014)', { ...base, dispositions: [{ name: 'todo', targetKind: 'line-status', statusDir: 'docs/status' }] }, false],
    ['bad-schemaVersion 非整数(R5-M2 原证据)', { ...base, schemaVersion: 'bad' }, true],
    ['bad-未知键(R5-M2 原证据)', { ...base, unknownKey: true }, true],
    ['bad-缺必需键 dispositions(不得被 DEFAULTS 遮住)', (() => { const c = { ...base }; delete c.dispositions; return c; })(), true],
    ['bad-缺必需键 schemaVersion', (() => { const c = { ...base }; delete c.schemaVersion; return c; })(), true],
    ['bad-schemaVersion 未来版本不受支持', { ...base, schemaVersion: 99 }, true],
    // 版本决定拿哪本 schema 去量:v2 的形态放进 v1 配置里,须被 v1 的 schema 拦下
    ['bad-v1 配置用了 v2 的 types 形态', { ...v1base, types: [{ name: 'design', canBeAuthoritative: true }] }, true],
    ['bad-v1 配置用了 v2 才有的 line-status', { ...v1base, dispositions: [{ name: 'todo', targetKind: 'line-status', statusDir: 'docs/status' }] }, true],
    ['bad-v2 配置仍用 v1 的字符串 types', { ...base, types: ['design'] }, true],
    ['bad-type 缺 canBeAuthoritative(v2 必填)', { ...base, types: [{ name: 'design' }] }, true],
    ['bad-type 重名', { ...base, types: [{ name: 'design', canBeAuthoritative: true }, { name: 'design', canBeAuthoritative: false }] }, true],
    ['bad-profile 非两档之一(D-002)', { ...base, profile: 'advisory' }, true],
    ['bad-targetKind 非法', { ...base, dispositions: [{ name: 'x', targetKind: 'bogus' }] }, true],
    ['bad-disposition 重名', { ...base, dispositions: [{ name: 'x', targetKind: 'docs' }, { name: 'x', targetKind: 'none' }] }, true],
    ['ok-v2 历史 none 可缺 reasonRequired(由 upgrade 补梯子)', { ...base, dispositions: [{ name: 'x', targetKind: 'none' }] }, false],
    ['ok-v5 历史 none 可缺 reasonRequired(由 v5→v6 upgrade 补梯子)', { ...base, schemaVersion: 5, dispositions: [{ name: 'x', targetKind: 'none' }] }, false],
    ['ok-v5 历史 none 可显式 false(由 v5→v6 upgrade 修正)', { ...base, schemaVersion: 5, dispositions: [{ name: 'x', targetKind: 'none', reasonRequired: false }] }, false],
    ['ok-v5 none 显式 reasonRequired=true', { ...base, schemaVersion: 5, dispositions: [{ name: 'x', targetKind: 'none', reasonRequired: true }] }, false],
    ['bad-v6 none 缺 reasonRequired=true', { ...v6base, dispositions: [{ name: 'x', targetKind: 'none' }] }, true],
    ['bad-v6 none 显式 reasonRequired=false', { ...v6base, dispositions: [{ name: 'x', targetKind: 'none', reasonRequired: false }] }, true],
    ['ok-v6 none 显式 reasonRequired=true', { ...v6base, dispositions: [{ name: 'x', targetKind: 'none', reasonRequired: true }] }, false],
    ['ok-v6 自定义当前权威状态', { ...v6base, status: ['施工中'], authoritativeStatuses: ['施工中'] }, false],
    ['bad-v6 当前权威状态不在 status', { ...v6base, authoritativeStatuses: ['施工中'] }, true],
    ['bad-v6 当前权威状态同时 deprecated', { ...v6base, status: ['active', '旧'], deprecatedStatuses: ['旧'], authoritativeStatuses: ['旧'] }, true],
    ['bad-fixed 缺 target', { ...base, dispositions: [{ name: 'todo', targetKind: 'fixed' }] }, true],
    ['bad-fixed target 越仓', { ...base, dispositions: [{ name: 'todo', targetKind: 'fixed', target: '../evil.md' }] }, true],
    ['bad-line-status 缺 statusDir', { ...base, dispositions: [{ name: 'todo', targetKind: 'line-status' }] }, true],
    ['bad-line-status 的 statusDir 越仓', { ...base, dispositions: [{ name: 'todo', targetKind: 'line-status', statusDir: '../evil' }] }, true],
    ['bad-非 line-status 却带 statusDir(死配置)', { ...base, dispositions: [{ name: 'x', targetKind: 'docs', statusDir: 'docs/status' }] }, true],
    ['bad-非 fixed 却带 target(死配置)', { ...base, dispositions: [{ name: 'x', targetKind: 'docs', target: 'docs/x.md' }] }, true],
    // ── v5:索引形态档(阶段 4)──
    ['ok-v5 声明 index.mode/outDir', { ...base, schemaVersion: 5, index: { mode: 'generated', outDir: '.worklog/generated' } }, false],
    ['bad-v4 配置用 v5 才有的 index.mode(版本决定拿哪本 schema 量)', { ...base, schemaVersion: 4, index: { mode: 'generated' } }, true],
    ['bad-index.mode 非法值', { ...base, schemaVersion: 5, index: { mode: 'bogus' } }, true],
    ['bad-index.outDir 越仓', { ...base, schemaVersion: 5, index: { outDir: '../evil' } }, true],
    ['bad-index.outDir 在 docsDir 内(生成物会被 frontmatter 门判红)', { ...base, schemaVersion: 5, index: { outDir: 'docs/generated' } }, true],
    // R6-10:机器面锁 `/`——反斜杠曾过 isSafeRelPath,Windows 上真落进 docsDir,守卫被绕过
    ['bad-R6-10:index.outDir 反斜杠路径(可绕过 docsDir 守卫)', { ...base, schemaVersion: 5, index: { outDir: 'docs\\generated' } }, true],
    ['bad-R6-10:docsDir 反斜杠路径', { ...base, docsDir: 'docs\\sub' }, true],
    ['bad-disposition 含未知键', { ...base, dispositions: [{ name: 'x', targetKind: 'docs', bogus: 1 }] }, true],
    ['bad-docsDir 越仓', { ...base, docsDir: '../evil' }, true],
    ['bad-dirs 非数组', { ...base, dirs: 'designs' }, true],
    // ── R7-05/R7-06(第七轮复核 §4.2):dirs 越仓/多段;核心数组禁空 ──
    ['bad-R7-05:dirs 条目越仓(init 曾在仓外写 .gitkeep)', { ...base, dirs: ['designs', '../../escape'] }, true],
    ['bad-R7-05:dirs 条目多段路径(索引门三方一致永不可满足)', { ...base, dirs: ['a/b'] }, true],
    ['bad-R7-05:dirs 条目反斜杠(R6-10 同判)', { ...base, dirs: ['a\\b'] }, true],
    ['bad-R7-06:dirs 空数组(init 成功但门必红)', { ...base, dirs: [] }, true],
    ['bad-R7-06:status 空数组', { ...base, status: [] }, true],
    ['bad-R7-06:types 空数组', { ...base, types: [] }, true],
    ['bad-R7-06:dispositions 空数组', { ...base, dispositions: [] }, true],
    ['bad-index 含未知键', { ...base, index: { bogus: 'x' } }, true],
  ];
  for (const [name, cfg, expectBad] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'wk-config-selftest-'));
    try {
      writeFileSync(join(root, CONFIG_NAME), JSON.stringify(cfg, null, 2));
      const { errors } = loadConfig(root);
      const pass = expectBad ? errors.length > 0 : errors.length === 0;
      console.log(`${pass ? '✓' : '✗'} selftest-config: ${name}${pass ? '' : `(errors=${JSON.stringify(errors)})`}`);
      if (!pass) failed++;
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  {
    const none = (reasonRequired) => ({
      ...base,
      schemaVersion: 6,
      authoritativeStatuses: ['active'],
      dispositions: [{ name: 'x', targetKind: 'none', ...(reasonRequired === undefined ? {} : { reasonRequired }) }],
    });
    assert(validateJsonSchema(configSchema(5), { ...base, schemaVersion: 5, dispositions: [{ name: 'x', targetKind: 'none' }] }, CONFIG_NAME).length === 0,
      'v5 schema 保持已发布契约，仍接受 none 缺 reasonRequired');
    assert(validateJsonSchema(configSchema(6), none(undefined), CONFIG_NAME).length > 0,
      'v6 schema 自身拒绝 none 缺 reasonRequired');
    assert(validateJsonSchema(configSchema(6), none(false), CONFIG_NAME).length > 0,
      'v6 schema 自身拒绝 none 的 reasonRequired=false');
    assert(validateJsonSchema(configSchema(6), none(true), CONFIG_NAME).length === 0,
      'v6 schema 自身接受 none 的 reasonRequired=true');
  }

  // 3. DEFAULTS ≡ 包内模板配置。init 在**无配置的新仓**里按 DEFAULTS 造目录、同时
  //    stamp 模板配置文件;两者一旦分家,init 会 stamp 出「目录按 DEFAULTS、配置声明
  //    另一套」的仓,索引门三方一致(R5-M4)当场红——自己造的仓自己判不合法。
  {
    const t = JSON.parse(stripJsonc(readFileSync(join(PKG_ROOT, 'templates', 'worklogrc.jsonc'), 'utf8')));
    delete t.$schema; // 只在模板里,供编辑器补全,非运行期配置
    const diff = Object.keys(t).filter((k) => JSON.stringify(t[k]) !== JSON.stringify(DEFAULTS[k]));
    assert(diff.length === 0, `DEFAULTS 与包内模板配置一致${diff.length ? `(分歧键:${diff.join(', ')})` : ''}`);
    const missing = Object.keys(DEFAULTS).filter((k) => !(k in t));
    assert(missing.length === 0, `DEFAULTS 的每个键模板都有声明${missing.length ? `(模板缺:${missing.join(', ')})` : ''}`);
  }

  // 4. 零配置起步仍可用(允许无配置文件,走 DEFAULTS 且不报错)
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-config-selftest-'));
    try {
      const { config, path, errors } = loadConfig(root);
      assert(errors.length === 0 && path === null && config.docsDir === DEFAULTS.docsDir, '无配置文件时走 DEFAULTS 且零错误');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // 5. 语法坏的 JSONC 报解析失败而非静默吞掉
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-config-selftest-'));
    try {
      writeFileSync(join(root, CONFIG_NAME), '{"a": ');
      assert(loadConfig(root).errors.length > 0, '语法坏的配置报解析失败');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // 5b. 合法 JSON 但顶层不是对象:受控配置错误,CLI config 必须 exit 2 而非 TypeError 栈崩。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-config-selftest-'));
    try {
      writeFileSync(join(root, CONFIG_NAME), 'null\n');
      const loaded = loadConfig(root);
      const cli = spawnSync(process.execPath, [join(PKG_ROOT, 'bin', 'worklog.mjs'), 'config'], { cwd: root, encoding: 'utf8' });
      assert(loaded.errors.some((e) => e.includes('顶层须为对象')), '合法 JSON 顶层 null 返回受控配置错误');
      assert(cli.status === 2 && !`${cli.stdout}${cli.stderr}`.includes('TypeError'), 'CLI config 对顶层 null exit 2 且不崩栈');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // 5c. 显式 sourceRoots 是会被递归读取的边界:存在时须为仓内真实目录；缺失目录
  //     允许预声明（条件生成目录/新仓先配后建），walker 会安全返回空。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-config-selftest-'));
    try {
      mkdirSync(join(root, 'code'));
      writeFileSync(join(root, 'plain.txt'), 'not a dir');
      const probe = (sourceRoots) => {
        writeFileSync(join(root, CONFIG_NAME), JSON.stringify({ ...base, sourceRoots }));
        return loadConfig(root).errors;
      };
      assert(probe(['code']).length === 0, 'sourceRoots 接受仓内实际目录');
      assert(probe(['../']).some((e) => e.includes('sourceRoots')), 'sourceRoots 拒绝 ../ 越仓');
      assert(probe(['plain.txt']).some((e) => e.includes('不是目录')), 'sourceRoots 拒绝普通文件(不把 ENOTDIR 留给 walker)');
      assert(probe(['missing']).length === 0, 'sourceRoots 接受尚未创建的仓内目录（walker 安全跳过）');
      writeFileSync(join(root, CONFIG_NAME), JSON.stringify({ ...base, sourceRoots: ['plain.txt'] }));
      let cli = spawnSync(process.execPath, [join(PKG_ROOT, 'bin', 'worklog.mjs'), 'config'], { cwd: root, encoding: 'utf8' });
      assert(cli.status === 2 && !`${cli.stdout}${cli.stderr}`.includes('ENOTDIR'), 'CLI config 对普通文件 sourceRoot 受控 exit 2');
      writeFileSync(join(root, CONFIG_NAME), JSON.stringify({ ...base, sourceRoots: ['../'] }));
      cli = spawnSync(process.execPath, [join(PKG_ROOT, 'bin', 'worklog.mjs'), 'config'], { cwd: root, encoding: 'utf8' });
      assert(cli.status === 2 && !`${cli.stdout}${cli.stderr}`.includes('TypeError'), 'CLI config 对 ../ sourceRoot 受控 exit 2');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // 6. R6-08:带 BOM 的配置照常载入(PowerShell 5.1 Out-File utf8 默认形态——主平台常态;
  //    此前 BOM 让解析必败、配置静默回落 DEFAULTS)
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-config-selftest-'));
    try {
      writeFileSync(join(root, CONFIG_NAME), '﻿' + JSON.stringify(base, null, 2));
      const { errors, config } = loadConfig(root);
      assert(errors.length === 0 && config.docsDir === 'docs', 'R6-08:带 BOM 的配置零错误载入(不回落 DEFAULTS)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  console.log(failed ? `\n✗ config selftest 失败 ${failed} 项` : '\n✓ config selftest 全部通过');
  return failed ? 1 : 0;
}
