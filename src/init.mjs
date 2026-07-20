// init:在目标仓 stamp 出 docs 骨架 + 配置 + CI + skill + 自包含模板/版本 manifest。
//
// thin-runner 的边界(R2-M3):**引擎**驻包、不复制;但**人和 AI 要读的东西必须在仓里**
// ——模板、手册、skill、版本 manifest 都 stamp 进消费仓。否则消费者从自己的仓里读不到
// 它们:包内 `templates/` 在消费仓根本不存在,引它等于给出一条永远走不通的指路(R4-02)。
//
// 幂等(已存在文件默认不覆盖,报冲突);--dry-run 只打印;--skill-only 只装 skill。
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { PKG_ROOT, walk, relPath, DOCS_SKIP, writeAtomic } from './lib/fsutil.mjs';
import { todayLocal } from './lib/dates.mjs';
// indexHeadings 逐键兜底(R6-13):config.index 是浅合并,用户只声明 `{mode}` 时直读
// `config.index.dirTableHeading` 得 undefined,init 会 stamp 出 `## undefined` 的 README。
import { loadConfig, typeNames, PROFILES, generatedOutDir, CONFIG_NAME, indexHeadings } from './lib/config.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { classifyFile, deriveId, insertIdLine } from './lib/docmeta.mjs';
import { KIT_DIR, SKILL_REL, withDocsDir, renderManaged, buildManifest } from './lib/templates.mjs';

const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

// 消费仓内本工具的家(常量驻 lib/templates.mjs,F-004 起渲染/哈希/三态判定共用;
// 此处再导出保持旧引用可用)。放仓根 `.worklog/` 而非 docsDir 下:docsDir 里每个 .md
// 都要过 frontmatter 门,而模板正文带 `<任务名>` 占位符必然不合法——放进去等于 init 完当场红。
export { KIT_DIR };

// CI 模板里的版本占位符;stamp 时替换为精确包规格(D-017)。
const CI_SPEC_PLACEHOLDER = '<WORKLOG_KIT_SPEC>';

// 已知类型目录的一句话职责(展示面中文);未知目录用通用说明。
const DIR_DESC = {
  designs: '单点设计方案,`YYYY-MM-DD-主题.md`',
  reviews: '审查/复核快照',
  decisions: '决策 brief 存证,定案后不可变',
  runbooks: '操作手册,不带日期、名即主题',
  lines: '工作线实体,`<slug>.md` 一句话使命;文档 frontmatter `line` 引用其文件名(开线 = 新建实体)',
  planning: '**施工中**长任务的工作记忆三件套(活文件,非正典)',
  worklogs: '**已收口**长任务的工作记忆三件套',
  archive: '已归档 / 已废弃,文首横幅写明取代链',
  canon: '架构正典',
};

const today = () => todayLocal(); // 日期戳本地日(B12,lib/dates 单一实现)
const tpl = (name) => readFileSync(join(PKG_ROOT, 'templates', name), 'utf8');

// withDocsDir(`docs/` 路径按配置派生,R5-M5 后半)自 F-004 起驻 lib/templates.mjs,
// 与受治理副本的渲染同源——init/doctor/upgrade 三处判定用的必须是同一份渲染。

function genDocsReadme(config) {
  const rows = config.dirs.map((d) => `| \`${d}/\` | ${DIR_DESC[d] || '（填写职责）'} |`).join('\n');
  return `---
status: active
type: index
line: 文档治理
created: ${today()}
---

# ${config.docsDir} 文档索引与治理规则

> 本目录是本项目全部工程文档之家。本文是 taxonomy 与 frontmatter schema 的入口索引。
> 机器面契约(frontmatter 字段/枚举值)见 \`.worklogrc.jsonc\`;门禁由 worklog-kit 强制。

## ${indexHeadings(config).dirTableHeading}

| 目录 | 放什么 |
|---|---|
${rows}

## 维护规则

- 任何改变文档状态/位置的 commit 须同步更新本索引与相关登记。
- 新文档:入类型目录 + 文首 YAML frontmatter(status/type/line/created)。
- 收口即处置:长任务收口 commit 同步「迁 worklogs/ + 写 closeout.md + 回写滚动状态」。
- 归档不变量:archive/ 内正文冻结,仅文首横幅可追加。
- 目录增删须同步 \`.worklogrc.jsonc\` 的 \`dirs\` 与上表——三者不一致即索引门红(R5-M4)。
`;
}

function genWorklogsReadme(config) {
  return `---
status: active
type: index
line: 文档治理
created: ${today()}
---

# worklogs — 长任务工作记忆归档

存放**已收口长任务**的三件套 + \`closeout.md\`。收口契约由 \`worklog-kit check\` 机械校验。

## ${indexHeadings(config).archivedHeading}

暂无。
`;
}

/**
 * 生成 `targetKind: fixed` 的靶点文件(典型即滚动状态源 `docs/todo.md`)。
 * 门禁对 fixed 靶点**验存**:配置声明了而文件不存在 = 死配置,该 disposition 的
 * 任何候选必撞 `docsMissing`。R4-01 就是这么来的——配置里有 todo,init 不造它,
 * 于是每个新 init 的仓都复刻同一个死配置。故此处由**配置**驱动生成,不写死 todo。
 */
function genFixedTarget(d, config) {
  // types 是 v2 的 {name, canBeAuthoritative} 对象数组,取名字须过 typeNames——
  // 直接 .includes('index') 对对象数组恒假,会回落到 config.types[0] 这个**对象**、
  // 插值成 `[object Object]` 写进 frontmatter(schema v2 落地时实际踩到,由 e2e 抓出)。
  const names = typeNames(config);
  const type = names.includes('index') ? 'index' : names[0];
  const status = config.status.includes('active') ? 'active' : config.status[0];
  return `---
status: ${status}
type: ${type}
line: 文档治理
created: ${today()}
---

# 滚动状态(${d.name})

> 本文件是 \`.worklogrc.jsonc\` 声明的 **\`${d.name}\` 固定靶点**(\`dispositions[${d.name}].target = ${d.target}\`),
> 也是收口时 disposition=\`${d.name}\` 的候选落点。门禁对该靶点**验存**——删了它,
> 任何 \`${d.name}\` 候选都会撞 \`docsMissing\`。

## 工作线

| 工作线 | 状态 | 现状 |
|---|---|---|

## 待办

<!-- 收口时 disposition=${d.name} 的候选落此;每条注明来源任务 -->
`;
}

// 版本 manifest(D-017)自 F-004 起由 lib/templates.mjs 的 buildManifest 组装:
// 除版本头字段外新增 templates 哈希表(工具最后写入内容的 hash,D-030),
// 是 doctor/upgrade 判定「包前进了」还是「用户定制了」的唯一基线。

/**
 * stamp 出的文档全部挂在「文档治理」工作线上;v4 起 `line` 是实体引用(引用门验存),
 * 故 init 必须同批 stamp 这条线的实体——否则 fresh init 当场红 `lineUnresolved`,
 * 与 R4-01「配置声明了 todo、init 不造它」是同一个病(自己 stamp 的仓自己判不合法)。
 */
function genLineEntity() {
  return `---
status: active
type: line
line: 文档治理
created: ${today()}
---

# 文档治理

本仓文档治理工作线:taxonomy、frontmatter 契约、收口仪式与门禁均属此线。
`;
}

/** CI 模板的 profile 占位符(P3 阶段 5,R2-M4「按 profile 生成」;selftest 钉住存在性) */
export const CI_PROFILE_PLACEHOLDER = '<PROFILE>';
/** CI 模板的按档附加步占位行(整行替换;selftest 同钉) */
export const CI_EXTRA_LINE = '      # <PROFILE_EXTRA>';

/**
 * CI 模板按 profile 生成(R2-M4):版本占位符换精确包规格(D-017);profile 写进头注;
 * brownfield 档多一步 `worklog-kit baseline`——报存量豁免现状(报告模式恒 exit 0,不咬 CI;
 * 立账/清账是显式本地动作 `--update`,CI 永不代做)。strict 档无此步(该档无视豁免账)。
 */
function genCi(config) {
  const spec = `${PKG.name}@${PKG.version}`;
  const extra = config.profile === 'brownfield'
    ? `      # brownfield 档附加步:报告存量豁免现状(只报不改账;立账/清账走本地 \`worklog-kit baseline --update\`)\n      - run: npx --yes --package ${spec} worklog-kit baseline`
    : '      # strict 档:无 baseline 步(该档无视豁免账,违规全数 enforce)';
  return tpl('ci-github.yml')
    .replaceAll(CI_SPEC_PLACEHOLDER, spec)
    .replace(CI_PROFILE_PLACEHOLDER, config.profile)
    .replace(CI_EXTRA_LINE, extra);
}

/**
 * CODEOWNERS 脚手架(P3 阶段 5;方案 §4.3:治理 schema 与门禁挂 owner 审)。
 * 全注释 stamp:init 不知道消费者的 GitHub 账号,带假 handle 的活行是谎;
 * 注释行合法且自带填写指引,取消注释即生效。归档区一行是 E6 的 review 面半边。
 */
function genCodeowners(config) {
  const D = config.docsDir;
  return `# CODEOWNERS(由 \`worklog-kit init\` stamp;方案 §4.3:治理 schema 文件与门禁挂 owner 审)
# 用法:取消注释并把 @OWNER 换成真实 GitHub 账号/团队;配合仓库设置的
# required reviews 才有强制力。含未知账号的活行 GitHub 会标错但不阻断。
#
# 治理面(schema/配置/CI 的改动须 owner 审):
# /.worklogrc.jsonc @OWNER
# /.github/workflows/docs-governance.yml @OWNER
# /.github/CODEOWNERS @OWNER
#
# 归档区(收口台账,归档后冻结;owner 唯一收口的 review 面——E6 门咬声明一致性,这里咬「谁能批」):
# /${D}/worklogs/ @OWNER
`;
}

/** 模板配置里 profile 行的字面量。改模板格式时这里会被 selftest 当场钉住(见 RC_PROFILE_LINE 断言) */
export const RC_PROFILE_LINE = '"profile": "strict"';
/** 模板配置里 dirs 行的字面量(同上钉法;F-002 的替换点静默 no-op = 每个 brownfield 仓复刻漏收) */
export const RC_DIRS_LINE = '"dirs": ["designs", "reviews", "decisions", "runbooks", "lines", "planning", "worklogs", "archive"]';

/**
 * 配置模板:把 profile 换成本次 init 定下的档,dirs 换成实况派生结果(F-002)。
 * 用字面量替换而非占位符,是因为模板必须自身合法(config selftest 会拿它过 schema 校验),
 * 而 `"<PROFILE>"` 过不了 profile 的 enum。selftest 另有断言钉住这两行字面量存在,
 * 以免有人重排模板后此处静默 no-op、把每个 brownfield 仓都 stamp 成 strict/漏收目录。
 */
function genRc(config) {
  const src = tpl('worklogrc.jsonc');
  return src
    .replace(RC_PROFILE_LINE, `"profile": "${config.profile}"`)
    .replace(RC_DIRS_LINE, `"dirs": ${JSON.stringify(config.dirs)}`);
}

/** 收集要写的 (绝对路径, 内容) 项。--skill-only 只含 skill。 */
export function buildItems(root, config, skillOnly) {
  const items = [];
  // 受漂移治理的副本(F-004):skill + 五模板,渲染与 doctor/upgrade 同源(renderManaged)
  const managed = renderManaged(config);
  const toAbs = (rel) => join(root, ...rel.split('/'));
  items.push([toAbs(SKILL_REL), managed.find((m) => m.rel === SKILL_REL).content]);
  if (skillOnly) return items;
  // 注:文档的 `id` 不写在各 gen* 模板里,由下方 seedIds 统一补——见其注释(与 upgrade 同一套规则)

  const D = config.docsDir;
  items.push([join(root, '.worklogrc.jsonc'), genRc(config)]);
  items.push([join(root, D, 'README.md'), genDocsReadme(config)]);
  items.push([join(root, D, 'worklogs', 'README.md'), genWorklogsReadme(config)]);
  items.push([join(root, D, 'experience.md'), tpl('docs-experience.md').replace('<YYYY-MM-DD>', today())]);
  // 线实体只在配置声明了 lines 目录时 stamp(同 runbooks 的理由:R5-M4 三方一致)
  if (config.dirs.includes('lines')) {
    items.push([join(root, D, 'lines', '文档治理.md'), genLineEntity()]);
  }
  // 手册只在配置声明了 runbooks 目录时 stamp:否则 init 会造出一个 config.dirs 里没有
  // 的目录,索引门的三方一致(R5-M4)当场红——自己 stamp 的仓自己判不合法。
  if (config.dirs.includes('runbooks')) {
    items.push([join(root, D, 'runbooks', 'closeout.md'), withDocsDir(tpl('runbook-closeout.md').replace('<YYYY-MM-DD>', today()), config)]);
  }
  // 消费仓可达的模板(R4-02):skill 与手册都引 `.worklog/templates/`。
  for (const m of managed) {
    if (m.rel !== SKILL_REL) items.push([toAbs(m.rel), m.content]);
  }
  items.push([join(root, KIT_DIR, 'manifest.json'), buildManifest(root, config, today())]);
  // 产物不入库(C-3):.gitignore 只在**缺席**时 stamp(init 不改既存文件的教义不破例);
  // 已有 .gitignore 的仓由用户自行加行——`index build` 每次跑完都会提示这件事。
  items.push([join(root, '.gitignore'), `# worklog-kit 生成物不入库(C-3)\n${generatedOutDir(config)}/\n`]);
  items.push([join(root, '.github', 'workflows', 'docs-governance.yml'), genCi(config)]);
  items.push([join(root, '.github', 'CODEOWNERS'), genCodeowners(config)]);
  // fixed 靶点由配置驱动生成(见 genFixedTarget 注释:R4-01 的成因)
  for (const d of config.dispositions) {
    if (d.targetKind === 'fixed' && d.target) items.push([join(root, ...d.target.split('/')), genFixedTarget(d, config)]);
  }
  // 空类型目录用 .gitkeep 占位,使 git 追踪 + 目录职责表↔实际目录一致。
  // 既存**非空**目录不占位(F-002 顺手修):brownfield 实况目录已被 git 追踪,
  // 往有内容的目录里塞 .gitkeep 是纯噪声(靶场实测一次 init 塞了 4 个)。
  for (const dir of config.dirs) {
    if (dir === 'worklogs') continue; // 已有 README
    const abs = join(root, D, dir);
    if (existsSync(abs) && readdirSync(abs).length > 0) continue;
    items.push([join(abs, '.gitkeep'), '']);
  }
  seedIds(root, config, items);
  return items;
}

/**
 * 给 stamp 出的文档补 `id`(v3 起必填)。
 *
 * 复用 `deriveId`/`insertIdLine`,**不另起一套发号规则**:init 与 upgrade 各发各的号的话,
 * 同一个仓「先 init 再 upgrade」与「先 upgrade 再 init」会得到两套 id——而 id 一旦落盘即冻结,
 * 两套号意味着两段无法合流的历史。这里也正是撞号的现场:`docs/README.md` 与
 * `docs/worklogs/README.md` 同名同 created,deriveId 的父目录消歧就是为它们准备的。
 *
 * 原地改写 items 的 content。
 */
function seedIds(root, config, items) {
  const taken = new Set();
  const pending = [];
  // 按仓根相对路径排序:谁先占到不带前缀的号,不该取决于上面 push 的先后
  const mds = items
    .filter(([abs]) => abs.endsWith('.md'))
    .map((it) => [it, relPath(root, it[0])])
    .filter(([, rel]) => rel.startsWith(`${config.docsDir}/`) && classifyFile(config, rel).frontmatter)
    .sort((a, b) => (a[1] < b[1] ? -1 : 1));
  for (const [it, rel] of mds) {
    const { hasFm, data } = parseFrontmatter(it[1]);
    if (!hasFm) continue;
    if (data.id) { taken.add(data.id); continue; } // 模板自带的号一律尊重
    pending.push({ it, rel, created: data.created });
  }
  for (const p of pending) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.created ?? '')) continue; // 派生不出就留给 check 报,不在这儿凑号
    const r = deriveId({ rel: p.rel, created: p.created }, (id) => taken.has(id));
    if (!r.ok) continue;
    const next = insertIdLine(p.it[1], r.id);
    if (next === null) continue;
    taken.add(r.id);
    p.it[1] = next;
  }
}

/**
 * 存量仓判据(阶段 0;task_plan 明确要求「判据固定并可测试,不得靠模糊目录存在性猜测」)。
 *
 * 判据一句话:**stamp 之前 docsDir 里已经有 .md** ⇒ 存量仓 ⇒ `brownfield`;否则 `strict`。
 * 取「有没有既存文档」而非「目录在不在」:空的 `docs/` 说明不了任何事(可能是刚 mkdir 的),
 * 而一篇既存文档就意味着「这里有本工具没管过的历史」——那正是 brownfield 要处理的东西。
 *
 * 自动选 brownfield 是**安全**的:brownfield 若无 baseline,行为与 strict 完全相同
 *(什么都不豁免)。豁免只会因为有人**显式**跑了 `worklog-kit baseline --update` 才发生。
 * 所以这个自动判定最坏也就是「档位名字选得不合心意」,不会静默放松任何一条门。
 *
 * @returns {'strict'|'brownfield'}
 */
export function detectProfile(root, docsDir) {
  const dir = join(root, docsDir);
  if (!existsSync(dir)) return 'strict';
  // DOCS_SKIP(R6-01):docs 下只有 build/*.md 的仓曾被误判 strict——文档树不沿用源码跳过集
  return walk(dir, ['.md'], DOCS_SKIP).length > 0 ? 'brownfield' : 'strict';
}

/** 取 --profile 的值;未给则按判据自动选 */
function resolveProfile(root, config, args) {
  const i = args.indexOf('--profile');
  const explicit = i >= 0 ? args[i + 1] : undefined;
  if (explicit) return { profile: explicit, why: 'explicit' };
  return { profile: detectProfile(root, config.docsDir), why: 'detected' };
}

export function main({ root, t, args }) {
  // R4-10:原实现写死 `{ ...DEFAULTS }`,于是**已有配置被完全无视**——用户把 docsDir
  // 改成 documentation/ 再跑一次 init,仍然 stamp 出 docs/。配置是机器真源,init 必须读它。
  const { config, errors } = loadConfig(root);
  if (errors.length) {
    // 配置非法时 stamp 出来的东西必然与配置不符,不如不 stamp——半对的骨架比没有更难收拾。
    for (const e of errors) console.error(t('cli.configShapeError', { msg: e }));
    return 2;
  }
  const dryRun = args.includes('--dry-run');
  const skillOnly = args.includes('--skill-only');
  // profile 须在 stamp **之前**定:判据看的是「stamp 前 docsDir 里有没有既存 .md」,
  // 而 init 自己马上就要往那儿写文件——写完再判,判的是自己刚造的东西。
  const { profile, why } = skillOnly ? { profile: config.profile, why: 'n/a' } : resolveProfile(root, config, args);
  if (!skillOnly) {
    if (!PROFILES.includes(profile)) {
      console.error(t('init.badProfile', { got: profile, allowed: PROFILES.join('|') }));
      return 2;
    }
    config.profile = profile;
    if (why !== 'n/a') console.log(t(why === 'explicit' ? 'init.profileExplicit' : 'init.profileDetected', { profile }));
  }
  // F-002:dirs 从实况派生,不抄愿望清单。config.dirs 是机器真源(索引门三方一致 R5-M4),
  // init stamp 的清单若漏掉存量仓真实存在的目录,init 完 `index check` 当场红——
  // 自己 stamp 的仓自己判不合法(与 R4-01 同病)。已有配置 = 用户真源,不改,只显式告警。
  if (!skillOnly) {
    const docsAbs = join(root, config.docsDir);
    const actual = existsSync(docsAbs)
      ? readdirSync(docsAbs).filter((n) => statSync(join(docsAbs, n)).isDirectory())
      : [];
    const extras = actual.filter((d) => !config.dirs.includes(d)).sort();
    if (extras.length) {
      if (existsSync(join(root, CONFIG_NAME))) {
        console.error(t('init.dirsUncovered', { dirs: extras.join(', ') }));
      } else {
        config.dirs = [...config.dirs, ...extras];
        console.log(t('init.dirsDerived', { dirs: extras.join(', ') }));
      }
    }
  }
  const items = buildItems(root, config, skillOnly);
  for (const [abs, content] of items) {
    const rel = relative(root, abs).replaceAll('\\', '/');
    if (existsSync(abs)) { console.log(t('init.skipExists', { path: rel })); continue; }
    if (dryRun) { console.log(t('init.dryRun', { path: rel })); continue; }
    mkdirSync(dirname(abs), { recursive: true });
    // 原子写(全仓唯一曾裸 writeFileSync 的写盘面):skip-exists 语义下,半截文件
    // 一旦落盘,重跑 init 会把它当「已存在」跳过——永不自愈。
    writeAtomic(abs, content);
    console.log(t('init.wrote', { path: rel }));
  }
  if (!dryRun) console.log(t('init.done'));
  return 0;
}
