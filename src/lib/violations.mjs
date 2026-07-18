// 违规记录的形状与共享判定/打印。
//
// 为什么违规要是**数据**而不是一个渲染好的字符串:原实现 `report(loc, (t) => t('rule.key', p))`
// 把规则标识关在闭包里,外部只看得到最终文案。而三件事都要求规则标识可被程序读到——
//   ①`brownfield` 的 baseline 按「路径 + 规则 key」匹配(D-013);
//   ②`--warn-only` 与将来的「每类门可配 off|warn|enforce」(§7.5)要按规则分类;
//   ③豁免命中须**单列计数报告、不静默**(§7.5)。
// 文案则留到打印那一刻再经 catalog 渲染(R3-1:机器面 ⟂ 展示面)。
//
// `line` 刻意与 `file` 分开:baseline 的钥匙**不含行号**——行号进钥匙的话,在上面插一行
// 就会失配、把一条旧债误报成新违规(D-013 取「路径 + 规则」正是为此)。

/** @typedef {{file: string, rule: string, params?: object, line?: number}} Violation */

/** 展示用定位串:有行号则 `path:line`,否则 `path` */
export const locOf = (v) => (v.line ? `${v.file}:${v.line}` : v.file);

/** baseline 钥匙:路径 + 规则 key(D-013;**不含行号**,见文件头注释) */
export const keyOf = (v) => `${v.file} ${v.rule}`;

/**
 * baseline 可豁免的规则(D-013)。**允许清单,不是排除清单**——这是刻意的:
 * 阶段 3 的图不变量(双权威 authorityDuplicate、重复 idDuplicate、断 supersedes 的
 * idrefDangling/supersedesUnpaired/supersedesSelf、归档线被现役引用 lineArchivedRef、
 * 双活 supersededButAlive)由此**结构上**默认不可豁免,不依赖「我下次记得把它排除掉」。
 * 安全的默认是拦,不是放。它们的主语是 id/(line,scope)/文档对,不是单个文件路径,
 * 「路径 + 规则」的钥匙表达不了(D-013 原论证);且它们全是**自相矛盾的声明**,
 * 不是缺失的元数据——矛盾没有「立账挂起」一说,只有改对。
 *
 * 收录判据**两条,须同时成立**:①违规的主语是**单个文件**;②机器**派生不出**正确的值,
 * 故只能由人补——即它是「装工具之前就有、且工具修不了」的那类存量债。
 *
 * 第②条是阶段 1 补的(方案 §4.1 item1「两把梯子」):梯子有两把,baseline 只是其中一把。
 * 机器能派生的缺口该走**另一把**梯子(`worklog upgrade` 自动补全),给它开豁免等于
 * 用「记账挂起」替换掉一条**一个命令就能真修好**的路——账会一直挂在那里。
 *
 * 刻意**未**收录:
 * - `docs.idMissing` / `docs.idInvalid` —— 违反第②条:`id` 可由 `<created>-<文件名 slug>`
 *   机械派生,`worklog upgrade` 全自动补全。
 * - `docs.lineUnresolved` —— 同上违反第②条:实体文件可由 line 值机械播种(slug 自动派生,
 *   D-007),`worklog upgrade` 的对账步骤全自动建。值本身缺失才是人判债(lineMissing,已收录)。
 * - `docs.lineEntityType` / `docs.lineEntityMismatch` / `docs.lineFileNotNFC` —— 线实体是
 *   阶段 2 才有的**新**文件,不存在「装工具之前就有」的存量债,不满足收录动机。
 * - `docs.idDuplicate` —— 违反第①条:主语是 **id**,不是文件。撞号的双方各记一条,
 *   删掉一端后另一端会留下假豁免(D-013 的原论证,此处第一次有了具体实例)。
 * - `index.*` —— 主语是**目录集合**(config.dirs ↔ 职责表 ↔ 实际目录),不是某个文件;
 *   且修它只是加一行表格,没有理由给历史豁免。
 * - `closeout.*` —— 收口契约是本产品的核心承诺,豁免它约等于豁免产品本身。存量仓是否
 *   真有值得豁免的旧 closeout 债,等 Scrollery 靶场的**实测数**说话再定(L8「据信号扩」),
 *   不靠猜先把口子开了。
 * - `docs.boolInvalid` / `docs.authoritativeNotAllowed` / `docs.deadField` / `docs.fieldEmpty`
 *   —— 均为**新写**的可选字段出错(存量仓根本没有这些字段,不会撞),不是存量债。
 */
export const BASELINE_ELIGIBLE = new Set([
  'docs.brokenLink',
  'docs.refUnreachable',
  'docs.missingFrontmatter',
  'docs.statusInvalid',
  'docs.statusDeprecated',
  'docs.missingType',
  'docs.typeInvalid',
  'docs.missingCreated',
  'docs.archiveNoBanner',
  // 机器不知道一篇存量文档属于哪条工作线。这正是第②条要的那种「只能人填」——
  // 故它走 baseline 而非 upgrade。实测(Scrollery `dev` @ 13a3192,只读):受检 85 篇中
  // **10 篇**缺 line;同批测得 **0 篇**缺 created ⇒ id 派生对全部 85 篇可行,两把梯子
  // 各自覆盖得住,不会退化成「一半自动一半人工」。
  'docs.lineMissing',
  // line 值全为非法字符 ⇒ slug 派生为空,实体无从机械播种(upgrade 亦跳过并注记),
  // 只能人改值——满足两条判据(主语单文件 + 机器修不了),属存量债形态。
  'docs.lineBadSlug',
  // 阶段 3 图不变量中的**唯一**例外:`status: superseded` 缺 supersededBy。它其实是
  // per-file 终态字段要求,不是跨文档图违规——主语是单个文件(①成立),而「接任者是谁」
  // 机器派生不出(反向不成立:A.supersedes=B 时机器**能**推 B 的 supersededBy,但替 B 落笔
  // 等于机器替人裁决 A 的取代主张成立,方向性判断属人;②成立)。存量仓真有此形态:
  // 手工标了 superseded 却没记接任者的旧文档,与它同现的 statusDeprecated 本就可 baseline,
  // 若本条不可豁免,brownfield 的旧债会从「可立账」硬化成「当场红」——凭空造悬崖。
  'docs.supersededNoRef',
]);
