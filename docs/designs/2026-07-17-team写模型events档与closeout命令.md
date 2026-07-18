---
id: 2026-07-17-team写模型events档与closeout命令
status: active
type: design
line: P3多人软肋施工
created: 2026-07-17
authoritative: true
authorityScope: team 写模型(events 档)与 `worklog closeout`/`worklog team` 命令的实现契约细化;上位裁决(①混合写模型、owner 唯一收口)仍以方案 §4.3 为准
---

# team 写模型(events 档)与 closeout 命令 · 实现设计

> **定位**:方案 §4.3「同任务多人写模型」已裁①混合(R2-C7,2026-07-13),本文把该裁决细化到可施工的契约级:文件名文法、门禁规则、迁移语义、生成器聚合、命令面。**本文不重开裁决**——形态(events 档、`mode: team` 声明、作者命名空间、owner 唯一收口)全部继承;新增的是实现层决策(候选 D-027~D-029,见文末,收口时提请裁决)。
>
> **实证输入(R1 并发基线,2026-07-17 已收口,台账 `docs/worklogs/2026-07-17-P3验证场与并发基线/`)**:三人同基并发下共享三件套**整体**是冲突面(dev-B 并入 progress/findings/task_plan 各 1 处内容冲突 + 撞名 4 add/add,7/7 文件);会话块无作者字段,溯源全靠 `(dev-X)` 后缀惯例(F-004,双 agent 互不知情独立报出);任务名唯一在对照组消掉整类 add/add(dev-C 独名净并)。本文各机制均以此为 before 读数,不重考古。
>
> **承接**:F-013(P2 线遗留,`worklog closeout` 专用命令)并入本设计 §6。

## §1 模式声明与成员(task_plan frontmatter)

- **声明位置**:任务的 `task_plan.md` frontmatter。新增可选字段:
  - `mode`:枚举 `solo` | `team`;**缺省 = solo**(既有任务零迁移、零语义变化)。
  - `owner`:team 模式**必填**;作者短标识(字符集见 §2 作者段)。solo 模式可选(仅展示用,进 STATUS 汇总)。
  - `collaborators`:可选,逗号分隔的作者短标识列表(frontmatter 单行值,与现行解析器一致,不引入 YAML 数组语法)。
- **成员集合** = `{owner} ∪ collaborators`。它是 §2 事件作者段与 §3 候选 ID 作者段的**合法值域**——不在集合内的作者即门红。新协作者加入 = 先在 task_plan 里加名字再写事件,一次低频编辑,方案 §4.3 已裁 task_plan 保持共享单文件、罕见冲突值得人工审。
- **校验落点**:三件套按文件名豁免 governed 字段门(`classifyFile` 的 trio 类,过程件全域豁免),故 `mode`/`owner`/`collaborators` **不走** `validateDocMeta`,由 check-docs 新增的 **team 规则组**(§5)针对性解析 task_plan frontmatter 校验。元模型 `DOC_FIELDS` 不动(`owner` 本就在表内;`mode`/`collaborators` 只存在于豁免区),详见 §7 schemaVersion 判定。
- **模式中途切换 = 一次性显式迁移**(方案 §4.3 原文),由 `worklog team <任务>` 命令执行(§4);不做隐式混用。

## §2 events 档契约

**路径**(继承方案 §4.3 ①原文):`<docsDir>/planning/<任务>/progress/events/<文件名>.md`;归档后随 git mv 整体迁至 `<docsDir>/worklogs/<收口日>-<任务>/progress/events/`。`progress/` 中间层保留「progress」概念连续性(单文件形态 ↔ 目录形态),`progress/` 下除 `events/` 外不得有其它内容。

**文件名文法**(机器面;字典序即时间序):

```
<UTC时间戳>-<作者>-<seq>.md
^(\d{8}T\d{6}Z)-(.+)-(\d{2})\.md$
```

- **时间戳**:ISO 8601 紧凑 UTC,`YYYYMMDDTHHMMSSZ`(如 `20260717T083000Z`),定宽 16 字符——定宽是字典序=时间序的前提。
- **作者段**:成员集合内的短标识。字符集约束与 `isValidId` 同源:非空、无空白、无 `|`、无 `/` `\`,NFC 归一;**允许中文**(文件名归使用者内容面,R4-15,中文一等公民)、允许含 `-`(解析靠两端定界:定宽时间戳前缀 + 尾部 `-\d{2}.md`,中段整体为作者,无歧义)。
- **seq**:两位零填充 `01`~`99`,同一作者同一秒内多事件去歧义。**两位是字典序约束**:不定宽的话 `-10` 会排在 `-2` 前。`00` 保留给迁移引导事件(§4)。同秒跨作者的相对顺序由作者段字典序定——稳定但无时间语义,可接受(秒级并发本无先后可言)。
- **事件内容**:**零 frontmatter,自由 markdown 正文**(D-027)。理由:①过程件豁免哲学一致——三件套本身就全域豁免 frontmatter 门,事件是更细粒度的过程件,给每条事件办 id/status/line 是纯仪式;②F-004 的修复面是「作者机器可读」,文件名作者段已是机器真源,frontmatter 里再抄一遍 = 两处真源等着漂移(工具第一课:单一实现防双引擎漂移,R3-6);③正文首行建议 `# <一句话事件题>`(模板引导,门不校验——H1 与内容一致性正是 R2-C1 清剿过的 drift gate 形态)。
- **事件不可变**:事件文件一经提交**不改不删**(append-only 是 events 档消冲突的全部机理:并发只 add 新文件,git 文本层无共享行可冲突)。改口 = 追加新事件引用旧事件文件名。门禁按 D-015 只验当前快照,不读 git history,故此条与三件套「归档后正文冻结」同级——社会契约 + review 面(CODEOWNERS,阶段 5)兜底,非机器门,如实标注。
- **文档分类**:`classifyFile` 新增第四类 `event`(匹配 `(planning|worklogs)/*/progress/events/*.md`):`links: false, frontmatter: false, banner: false, graph: false, index: false`——与 trio 同为全域豁免,但**另有专属文法门**(§5 E 组)。放行顺序在 governed 兜底之前。

**模板**:`templates/event.md` 新增(仅 H1 引导注释),init stamp 到 `.worklog/templates/event.md`,skill/手册按 R4-02 引仓内路径。

## §3 候选 ID 作者命名空间

- **文法扩展**:现行 `ID_RE = /^[FD]-\d{3}$/` 扩展为:
  - solo 任务:`^[FD]-\d{3}$`(不变;**禁用**带作者段形态,保持单任务内文法单一);
  - team 任务:`^[FD]-<作者>-\d{3}$`(**强制**带作者段;裸 `F-NNN` 即门红)。作者段字符集同 §2,解析用贪婪 `^([FD])-(.+)-(\d{3})$`(尾部三位定界,作者含 `-` 无歧义)。
- **作者段 ∈ 成员集合**:声明表里出现集合外作者 = 门红。这比纯文法校验多咬一口:手滑打错自己名字的候选当场暴露,而不是等收口对不上账。
- **消竞态机理**:每作者独立编号 `F-alice-001`/`F-bob-001` 互不相撞,ID 分配无需协调(R1 实测的候选 ID 竞态即此)。NNN 仍为三位、作者内递增。
- **closeout 不变量零改动**:全覆盖判定(声明 ID 集合 ≡ 处置 ID 集合,D-012 一候选一行,ID 即行主键)按**完整 ID 字符串**相等,namespaced ID 天然适配,处置表七列 schema、per-disposition 语义、冻结边界全部原样。

## §4 solo→team 迁移:`worklog team <任务>`

一次性显式迁移(方案 §4.3「与 §4.1 档间迁移同款语义」;档间迁移在 P2 落在 upgrade 的 schema 梯内,但 mode 是**单任务**属性而非仓级 schema 属性,故另立命令而非塞进 upgrade)。步骤(全部机械,`--dry-run` 可预览):

1. 前置:`planning/<任务>/` 存在且含三件套;当前非 team 模式;`progress/events/` 不存在。
2. task_plan frontmatter 写入 `mode: team` + `owner: <值>`(`--owner` 旗标显式给;缺省回落 `git config user.name`,取不到即拒绝执行——owner 是必填语义,不许静默空值)。
3. `progress.md` 整体迁入**迁移引导事件** `progress/events/<迁移时刻>-<owner>-00.md`(正文原样搬运,顶部加一行迁移注记),删除 `progress.md`。**不按会话标题拆分**——拆分靠猜标题结构,猜错即丢史;整体搬运无损,时间线粒度从迁移时刻起才有意义。
4. **既有候选 ID 重命名**:solo 期声明的裸 `F-NNN`/`D-NNN` 全部改写为 `F-<owner>-NNN`(solo 期作者即 owner,语义无损)。改写范围 = 三件套三个文件内**已声明候选 ID 集合**的词边界出现(声明表 + 叙事提及一并改,防提及链断);不碰集合外的任意 `[FD]-\d{3}` 字面(可能是引用别的任务)。此步是 §3「team 强制命名空间」的梯子——没有它,切 team 的存量任务当场门红(F-001 教训:不得只上门不给梯子)。
5. 原子写(tmp→rename,既有惯例),完成后跑双门,报结果。

## §5 门禁规则组(check-docs 新增;阶段 4 施工)

E 组(events/team),全部 error 级、不进 baseline:**新门只咬 `mode: team` 与 `progress/events/` 路径,当前零存量声明,无存量即无梯**——「门梯同批」在此退化为门单独上,升档梯即 §4 命令,同批交付。

| # | 规则 | before 读数(R1) |
|---|---|---|
| E1 | `mode` 声明了就必须 ∈ {solo, team};`mode: team` ⇒ `owner` 必填非空;`collaborators` 声明了就逐项过作者段字符集 | — |
| E2 | `progress/events/*.md` 文件名过 §2 文法(定宽时间戳 + 作者段字符集 + 两位 seq + NFC);`progress/` 下只许 `events/` | — |
| E3 | 事件作者段 ∈ 该任务成员集合 | F-004:无作者字段,溯源靠后缀惯例 |
| E4 | 形态互斥:team 任务**无** `progress.md` 且 `progress/events/` 至少 1 事件;solo 任务**无** `progress/` 目录 | dev-B progress 内容冲突(共享单文件文末必冲突) |
| E5 | 候选 ID 文法按模式分派(§3):team 强制作者段且作者 ∈ 成员集合,solo 禁作者段 | 候选 ID 分配竞态(R2-C7 原始软肋) |
| E6 | team 任务的 closeout.md 须带 `owner` frontmatter 且 == task_plan owner(owner 唯一收口的机器可判面) | 真人流程遵从 2/3(跳步实测) |

- E6 用的 `owner` 是元模型既有可选字段,closeout.md 属 governed 类可正常校验。**如实标注边界**:CI 看不见「谁在跑命令」,E6 咬的是台账声明一致性;发起人身份的真强制在 review 面(CODEOWNERS,阶段 5)与命令面(§6 权限提示)。
- **候选账冻结免新门**:closeout.md 落盘后再声明新候选 ⇒ 处置表缺行 ⇒ 既有全覆盖不变量自动红。冻结机制 = 现有门,零新码。
- 归档路径(`worklogs/`)同规则:E2~E5 对归档 team 任务同样成立(git mv 后契约随行)。

## §6 `worklog closeout <任务>`(F-013)

**动机**(F-013 原文):把收口机械步收进一条命令。①agent 环境下独立命令走**工具权限提示**,「用户批准收口」从纸面契约(F-012)变成真实按钮——closeout 加 `approved` 字段类方案是假强制(AI 照样能填),权限提示是当前唯一有牙齿的机械锚点;②手工用户少抄流程。R1 的真人 2/3 流程遵从直证:机械步越多,跳步面越大。

**边界**:命令只做**机械步**。closeout.md 的处置表内容、滚动状态分片的现况改写、方案回写——这些是判断件,仍由人/AI 先写好;命令的前置检查会拒绝在 closeout.md 缺席时执行。solo/team 通用,team 多一道 E6 一致性检查。

**流程**(`--dry-run` 可预览;全程不 commit——收口 commit 属用户批准语义,命令只把工作树摆到「一眼可 review」状态):

1. 前置:`planning/<任务>/` 存在、三件套齐、`closeout.md` 已在任务目录内;目标 `worklogs/<今日>-<任务>/` 不存在(收口日 = 命令执行日,既有惯例);team 任务过 E6。
2. 三件套 + closeout.md frontmatter `status` 翻转 → `snapshot`(原样保留 BOM/行尾,`insertIdLine` 同款纪律)。
3. `git mv docs/planning/<任务> docs/worklogs/<今日>-<任务>`(保 rename 检测)。
4. worklogs README「已归档任务」表(`index.archivedHeading` 定位)追加登记行。
5. 打印**非机械步清单**提醒(滚动状态回写、方案回写、处置行 verified 复核),随后进程内跑双门(check + index check),按门禁结果定 exit code。

**命令面参数**:`closeout: { flags: ['--dry-run'], positionalFree: true }`、`team: { flags: ['--dry-run'], valueFlags: ['--owner'], positionalFree: true }`——cliargs 的 `positionals` 现为枚举白名单(index build/check),需扩一档「单个自由位置参数」(任务名任意、含中文),F-001 中央兜底语义不变:未知旗标照旧 exit 2。

## §7 schemaVersion 判定:P3 本设计范围内 v5 不动(D-028)

- 配置面零变更:mode/owner/collaborators 是**任务级** frontmatter 不是仓级配置;events 路径是固定约定(同 `LINES_DIR` 先例,不入配置——可配的话 E 组门、生成器、迁移命令三处要各自跟着猜)。
- 元模型零变更:`owner` 已在 `DOC_FIELDS`;`mode`/`collaborators` 仅存在于字段门豁免区(trio),不进表。
- 新文档类 `event` 与 E 组门是**引擎行为**,由包 semver 承载(minor:新增能力,既有仓零存量零破坏),不是数据 schema 迁移。
- 判据回看:D-003「字段集属元模型、变更须附迁移」——本设计恰好没动字段集。阶段 3 的任务名唯一门同理(纯门规则)。**若后续实测推翻**(如 collaborators 需进 governed 文档),再走 v6 门梯同批,本条作废重裁。

## §8 生成器聚合(index build;阶段 4 施工)

- **时间线视图**:对每个 team 任务(在施 + 归档)产 `<outDir>/timeline/<任务目录名>.md`——事件按文件名字典序拼接,每事件加 `## <时间> <作者>` 头。不入库(C-3 gitignore 铁律),本地预览/CI artifact 可见性同 INDEX/STATUS。
- **STATUS 汇总加「谁在做什么」**(方案 §4.3 软肋表第 6 行的兑现):在施任务表补 owner/mode 列;team 任务另给事件计数与最后事件时间(stale trio 信号的 team 形态,doctor 的 stale 判据同步认 events 最新文件时间,不再只看 progress.md mtime)。

## §9 阶段接口(本设计定什么、后阶段做什么)

| 阶段 | 承接本设计 |
|---|---|
| 阶段 3 | 任务名全局唯一门(独立于本设计,before 读数:撞名 4 add/add);owner/collaborators 的 E1 门可与之同批先行(纯 task_plan 解析,不依赖 events 实现) |
| 阶段 4 | E2~E6 门、`event` 文档类、`worklog team`/`worklog closeout` 命令、event 模板、timeline/STATUS 生成器;selftest 正负例按 E 组逐条配对(§10 惯例) |
| 阶段 5 | CODEOWNERS 把 E6 的社会契约半边补上(治理 schema/门禁脚本 + worklogs 归档区挂 owner 审);按 profile 生成 CI |

## 候选决策(收口时提请裁决)

| 候选 ID | 决策 | 理由 |
|---|---|---|
| D-027 | 事件文件**零 frontmatter**,契约全在文件名(定宽 UTC 时间戳-作者-两位 seq) | 过程件豁免哲学一致;文件名即作者机器真源(F-004 修复面),frontmatter 复写 = 双真源漂移;两位 seq 保字典序 |
| D-028 | P3 本设计范围 schemaVersion **v5 不动** | 配置键/元模型字段零变更;新门零存量即无梯;引擎能力走包 semver(§7) |
| D-029 | 命令面新增两条:`worklog closeout <任务>`(F-013)与 `worklog team <任务>`(solo→team 迁移,含存量候选 ID 重命名梯) | 机械步收敛 + 权限提示作收口按钮;mode 属任务级不属仓级 schema,不塞 upgrade |
