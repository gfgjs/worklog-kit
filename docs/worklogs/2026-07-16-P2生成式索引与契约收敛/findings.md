---
status: snapshot
type: working-memory
line: P2生成式索引与契约收敛
created: 2026-07-16
---

# 发现与决策:P2 生成式索引与契约收敛

## 需求

- 用户 2026-07-16 裁 **D-001:P2 全量 go**(简报四选项 A/B/C/D 中选 C),理由「做完直接测多人,以免耽误时间」。该理由破了简报指出的路线图循环依赖:P2 收益(生成式索引解并发冲突)只有多人场景可测,而 §12 自己把多人证据移到了 P3 → 等信号等不到,故不等。
- 范围 = §12 P2 行全量 + F-001(字母→slug 迁移命令,已回写方案 §4.1 item2 ④)。
- 完成判据(§12 原文,四条):生成器幂等 / 结构负例(双权威、引用缺失)selftest 可拦 / artifact 发布可复现 / 升档迁移 e2e 过。

## 发现

- **承接自上一任务的三条既有账**(全部已在方案或 todo 落地,此处只记指针,不重复):①F-001 迁移悬崖 → 方案 §4.1 item2 ④;②D-001 及其诚实代价 → 方案 §0 L10 + §12 P1.5/P2 行;③CI billing 阻断 + Codex skill 漂移 → `docs/todo.md` 待办。
- **阶段 7 判据与 CI 现状直接冲突(开工前须裁)**。§12 P2 判据含「artifact 发布可复现」,artifact 只能由 CI 产出;而 CI 当前 billing 阻断(run `29209040905`,4s failure),用户已裁「暂不管 CI」。二者不能同时成立——**要么恢复 billing,要么该判据换验证方式(如本地跑 `act`/手工验证生成物可复现),要么阶段 7 延后**。这不是施工问题,是判据可满足性问题,与 P1.5「指标结构上不可测」同类。
- **`profile` 枚举当前是空壳**(schema 有 `strict|greenfield|brownfield|advisory` 四值,注释写死「MVP 仅实现 strict」,而 check-docs **根本不读该字段**)。阶段 6 是从零实现,不是「打开开关」——排期勿按配置项估工。
- **skill 收口靶点硬编码 `docs/todo.md`**(SKILL.md 第 7 步 + 收口手册 §三.7)。阶段 4 status 分片一旦落地,该靶点即失效;§7.3/§8.1 早已要求「按档参数化(读配置定靶点)」但 P1 未做。阶段 5 必须连 skill 文本一起改,否则收口仪式指向一个已迁走的文件。
- **本仓自身是阶段 1/2 的首个迁移对象**(dogfood)。现役 8 文档的 `line` 值现状:`文档治理`(README/worklogs README/todo)、`建仓与v0.3基线`(已归档三件套 + closeout)、`P2生成式索引与契约收敛`(本三件套)。**全部已是语义 slug,无一字母** → 本仓迁移命令只需生成占位实体,**零人工重命名**。故迁移命令的「字母→slug 人工判断」分支在本仓 dogfood 中**测不到**,须靠 fixture 负例覆盖(与 P1.5 盲区同型:自己的仓测不出自己没有的问题)。

## Scrollery `dev` 实测(2026-07-16;L11 裁其为首要消费者后取证)

> **靶场**:`/d/workspace/scrollery` @ `dev` `cd0443c`(远程私有仓 `dev`)。**`main` 是 07-06 旧貌**(`plan-docs/` 时代、无 `check_docs.mjs`、零 frontmatter),**勿据以设计**——本人曾据 `main` 误判「§8.1 写错了」「F-001 输入假设错了」,查 `dev` 后两条均证伪(见 progress 教训)。**D-004:以下数据仅记形态与计数,Scrollery 内容不入仓,fixture 一律合成。**(值样例已于 2026-07-17 fresh-export 按 R4-18 合成化。)

- **字母登记表真实存在且取号规则白纸黑字**。`docs/README.md` §「工作线字母登记表(todo.md 分节号;**新立项先来此取号**)」,19 行 **A–S**,列 = `| 字母 | 工作线 | 立项 | 权威文档 |`。→ 用户首轮问的「取号」在消费者仓里是**明文规则**,非假想。
- **A–Z 容量比方案估计更紧**。§8.1 原记「A–Q」(17)系 07-12 快照,实测已达 **A–S(19)**,另有 `(T)` 在野未登记 = **20/26**。3 个月增 19 条 → 按此速率 **26 号约 5 周耗尽**。
- **撞号是已发生事件,非理论风险**。登记表 O 行原注:「(**原误取 I 撞号,2026-07-10 改 O**)」。→ 方案 §4.1「中心分配 max+1 两人同抢即撞号」在消费者仓有**病历**。
- **🔴 中心登记表的真实死法是「被静默弃用」,不是「撞号」**。实测 `line:` frontmatter 124 文档、**54 个 distinct 值**,而登记表只有 19 个字母 → **35 个工作线(65%)从未取号**,直接写语义 `line:` 干活。规则没被执行不是因为有人反对,是因为**取号是额外一步,而不取号也能干活**。这条改变 F-001 迁移命令的重点:主要工作量不在「给字母起名」,而在**处理表外线**。
- **`line` 值形态是三类混存**(非方案初稿假设的「值就是字母」):①纯语义名(35 个,如 `legacy_2020`/`AI 标注流水线深审`);②混合 `名(X)`(12 个,如 `巡检修复(F)`/`丙线完善(K)`);③野号(`parser 模块拆分(T)`,T 不在表)。→ **语义已在值里,slug 可自动派生**;初稿「机器不知道 K 指什么、只能人工重命名」对**纯字母**成立,对**实测形态不成立**。已回写 §4.1 item2 ④。
- **profile 空壳的代价已实测两次**。①合成 fixture:声明 `advisory` + 一处非法 status → 仍 exit=1;②Scrollery `dev`:声明 `brownfield` → 仍 exit=1、118 条红。**注:118 这个数要打折**——其中 83 条「type 非法」系本人猜配的 taxonomy 未对上 Scrollery 真实枚举,非其真坏;**但空壳的结论不依赖数字大小**:无论多少条,声明了 brownfield 拿到的是 strict 的红。

- **第四轮审查(2026-07-16)直接压在本任务开工路径上的四项——同日已全部裁决落账**(报告:`docs/reviews/2026-07-16-P1实现与P2施工前审查.md`,已翻 snapshot;裁决记录:方案 §19;决策登记:本 task_plan D-007~D-011):🔴 R4-15 → **D-007 中文文件名一等公民**(NFC 门兜底);🟠 R4-16 → **D-008 独立 baseline 文件**;🟠 R4-17 → **D-009 显式子命令 + 裸 index 按档别名**;🟠 R4-01/02 → **D-011 修码已批待施工**(挂阶段 0 前置项)。R4-19 可测性标注已补齐七阶段。**开工阻塞已全清,余下唯一门 = 用户开工批准。**

## 第五轮二审(2026-07-16;P1 契约复核 + P2 施工方案)

> 报告:`docs/reviews/2026-07-16-P1契约复核与P2施工方案二审.md`;方案登记:§20(含 §20.1 裁决记录)。第四轮末「开工阻塞已全清」被本轮新证据推翻,须先过 G0 契约硬化与六项裁决——**六项已于同日全部裁决(全采纳建议 → D-012~D-017),写码批准同日下达(用户「开始施工」),G0 已开工**。

- **现行全绿不等于契约闭合**。`npm.cmd run selftest` 37 例、`worklog check`(12 文档/0 代码)、`worklog index` 均 exit 0;但最小 fixture 坐实五个漏判/反判:
  1. 合法 `no-promotion` 行把 `verified=no` → **0 违规**(`src/check-docs.mjs` none 分支在全局 verified 校验前 `continue`)。
  2. `target=repo:../<仓外已存在文件>` → **0 违规**(grammar + `join(root,path)` 无 containment)。
  3. 设计 §7.1 允许同候选两 target,实现按 ID 去重 → `closeout.reDisposed`;skill/template/README 又站实现一侧,形成 contract split。
  4. worklog 只有 `task_plan.md` + 空 closeout,缺 findings/progress → **0 违规**;`worklogs/README.md` 缺失时 index 亦 **0 违规**。
  5. skill 目标目录多一个上游已删除文件,`--check` 等价路径仍 exit 0。
- **JSON Schema 目前只是编辑器文档,不是运行期契约**。合成配置 `{"schemaVersion":"bad","unknownKey":true}` 经 `loadConfig` 得 `errors=[]`;原因是先与 DEFAULTS 合并再做轻量形状校验,既遮住 required 缺失,又不查版本类型/未知键/profile/重复 disposition。P2 若直接依赖 `schemaVersion` 会把错误配置当合法迁移输入。
- **schemaVersion 与 upgrade 排期倒置**。现 task_plan 阶段 1 升 v2,阶段 5 才交 upgrade;设计 §12 又把 upgrade 首次交付写在 P4。该序列重演 F-001「只上门不给梯子」,已重排为阶段 0 同批交 schema v2 + registry + dry-run/apply/备份回滚 + profile/baseline。
- **生成式 todo 靶点在现元模型里不可表达**。`targetKind: fixed` 只能指单一 `docs/todo.md`,`status/<line>.md` 要从归档任务 line 动态求唯一 target;若降成普通 docs target 则丢固定靶点强度。待裁建议新增专用 `line-status` kind。
- **baseline 不能用一个“路径 + rule”钥匙覆盖所有 P2 违规**。双权威、重复 ID、断 supersedes 的主语是 line/scope/doc-id 集合,随意挑文件路径会导致顺序/改名漂移。待裁建议 baseline 只豁免可稳定定位的 per-file P1 旧债,图不变量永远 enforce。
- **thin-runner 消费路径再现 dogfood 遮蔽**。CI 模板 `npm ci` 后裸 `npx worklog`,init 未写包依赖/精确版本 manifest;无本地 bin 时不能证明运行的是 `worklog-kit` 的 `worklog`。skill/runbook 又硬编码 `docs/` 与包内 `templates/`,自定义 docsDir/非 Node 消费仓都未闭环。
- **P2 实体模型仍缺三张可编码表**:line/status 实体字段;全局 ID/引用的 source universe;当前快照不变量 vs git-history transition。建议 P2 CI 只验当前快照,不引入 diff-aware 状态机。→ **已裁 D-015(只验快照)/ D-016(status 每线一文件);三张表本身留阶段 1 冻结**。

### 六项裁决(2026-07-16;全采纳建议)

用户对二审 §6 待裁队列**六项全采纳**,同时下达写码批准(原话「开始施工」)。落为 **D-012~D-017**(决策表见 task_plan;正文去向见方案 §20 表「裁决 / 去向」列):一候选一处置行 / baseline 不豁免图不变量 / 新增 `line-status` kind / P2 只验快照 / status 每线一文件 / 消费仓版本钉。**待裁队列已清空;G0 自本日开工。**

## 阶段 0 验收:Scrollery `dev` 靶场实测(2026-07-16)

> **靶场**:`/d/workspace/scrollery` @ `dev` `d7200f1`(比上轮的 `cd0443c` 已推进,且**有用户未提交改动**)。
> **只读**:`docs/` 复制到 temp 再实验,源仓一个字节未写(D-004)。**以下只记计数与形态,内容不入仓**。

- **✅ 三条判据全部达成**:①`brownfield` + `baseline --update` 立账后 → `check` exit **0**、`index` exit **0**;②新增一处违规 → exit **1**;③同状态 + `--warn-only` → exit **0**。profile 从空壳变为可用,D-002 兑现。
- **🔴 真实存量债只有 3 条断链**(165 md / 8 类型目录 / 3 个月演进)。但**这个数不能读作产品成熟度**——见下条偏置警告。
- **🔴 「118 → 15 → 3」的差全部来自本人配置,靶场一个字没改**。上一轮报 118(其中 83 条 type 非法),本轮初测报 15(其中 12 条 `closeout.dispositionInvalid`),取真实枚举后报 3。**两次都是同型错误:猜配 taxonomy,把「我少声明了」记成「它欠了债」。** 故立为方法论,不当个例:**brownfield 实测前必须先从靶场采真实枚举**(status / type / closeout 实用 disposition),而非照默认配置开跑。这也是 brownfield 采纳的**用户侧一等步骤**——文档须写明「先配对你的 taxonomy,再立账」,否则第一次跑出的满屏红会直接劝退(§7.5 开篇点名的死因)。
- **⚠️ 偏置警告(必须与上面的「3 条」同处)**:Scrollery 是这些不变量的**抽取源**。工具在自己的祖先身上全绿是**最好情况,不是代表性 brownfield 仓**——它的 taxonomy 就是本工具 taxonomy 的原型,它的目录结构就是 `dirs` 默认值的来源。「3 条债」证明的是**抽取忠实**,不是「本工具能处理随机存量仓」。后者仍无证据。
- **index 门开箱即绿**:目录职责表 ↔ 实际目录、worklogs 归档 ↔ 登记,双向均无漂移。这同时是靶场质量的证据与「不变量抽取正确」的证据。
- **Scrollery 的 `type` 从未被枚举约束过**:其 `tools/check_docs.mjs` 只有 `STATUS_ENUM`(5 个中文值)、**无 type 枚举** → `type` 漂成 **19 个 distinct 值**,其中 3 个是带括号的即兴变体(形如 `<型>(<限定语>)`)。这是 worklog-kit「type 入枚举」的直接价值证据:没有机械约束的字段,3 个月就会长出长尾。
- **31 个无 frontmatter 文档零违规 = 真豁免,非漏判**(已逐个核实):28 个在 `archive/`(该区只校验文首横幅,且 32 个归档件横幅**全在**)+ 3 个是 `planning/` 三件套(`isTrio` 豁免)。
- **🟠 Scrollery 机器面是中文,与 R3-1 无冲突,但方案没说清**:其 status 值是中文(`STATUS_ENUM` 5 个)。R3-1「机器面锁 ASCII」若被读成「消费者的 status 值必须 ASCII」,则 Scrollery 装本工具要先迁 165 个文档的 frontmatter——**但那是误读**:`status`/`types` 是**实例**,D-003 已裁实例可配;R3-1 约束的是**本工具自身的默认值与 schema 字段名**,不强加于消费者实例。实测:照配中文枚举,`loadConfig` errors=0、门全绿,零迁移。**该澄清已回写 §5**(否则首要消费者会以为采纳成本是一次 165 文档迁移,而实际是零)。

## 阶段 1 实测:字段表 / source universe / 两把梯子(2026-07-16)

**本仓实扫(R4-14:清单以实扫为准,勿估)**:`docs/` 13 篇 md → **6 篇三件套豁免、0 篇 archive、受检 7 篇**;7 篇字段一律只有 `status`/`type`/`line`/`created`,**零篇有 `id`/`title`/`summary`**。

**靶场只读实测(Scrollery `dev` @ `13a3192`;D-004/D-010:只取计数与形态)**:

| 读数 | 值 | 它决定了什么 |
|---|---|---|
| md 总数 | 165 | — |
| trio / archive(本就豁免) | 48 / 32 | 「165 篇要迁移」是错觉,**真受检 85 篇** |
| 受检(governed) | 85 | 阶段 1 的真实作用面 |
| 缺 `line` | **10** | `line` 走 `baseline` 梯子的实证;10 篇立账即清零,**不构成迁移悬崖** |
| 缺 `created` | **0** | **id 派生对全部 85 篇可行** ⇒ `upgrade` 这把梯子不会中途退化成「一半自动一半人工」 |
| 缺 frontmatter | 0 | — |
| archive 里带 frontmatter | 4 | 「archive 有 id 才参与图」= 零迁移的实证 |

> **⚠️ 数字口径更正(第三次同型错误的未遂现场)**:草稿曾写「165 篇中 41 篇缺 line」——**41 = 165 − 124 是跨 commit(`d7200f1` vs `cd0443c`)、跨口径的减法**,从未被测量过;且 165 里含 48 trio + 32 archive,它们**本就不需要 `line`**。实测真值 **10**,差 4 倍。阶段 0 已把「猜配置 → 把『我少声明了』记成『它欠债』」立为方法论,此处是同一个病换了个形态:**把两个量不同东西的数相减**。两处并存的数字勿相减。

**两个 bug 都是 R4-11 放行仓根扫描后当场照出来的**(F-008 正则漏排 `]`、F-009 1b 缺行内代码规则)。原以为 R4-11 只是「补个扫描域」,实际它是**一个盲区里藏着三样东西**:漏扫本身、漏扫掩护的正则 bug、以及两门对同一 markdown 语法的两种读法。**被关掉的检查会掩护它自己的 bug**——本仓 `sourceRoots: []` 关了 1b 十次提交,fixture 也从没写过 `[docs/x.md](docs/x.md)`,于是那条正则一直「全绿」。

**upgrade 语义洞**(D-019 的成因,由 gate fixture 挖出):存量仓 `init` 出来配置**就是最新版**,一次迁移都不需要;而它满仓旧文档一个 `id` 都没有。`upgrade` 原先 `v === LATEST` 即早退 → 播种代码永不执行;`baseline` 又按 D-013 结构上豁免不了 `idMissing` ⇒ **两把梯子都够不着,Scrollery 无法采纳 v3**。这会直接推翻阶段 0 刚验收的靶场结论。已按「upgrade = 让数据布局与所声明的版本相符(幂等对账),不是改那个数字」重构;e2e 补五步采纳全程作回归钉。

## 待裁(P3 前,非本任务阻塞)

- **🔴 D-001 押注的验证场至今无人**。D-001 裁「P2 建完直接测多人」,但 §12 P3 判据要「**两人并发 PR**」——而 Scrollery 与 worklog-kit **均系单人在环**(§4:「Scrollery 版明确用户基本在环」)。**第二个人从哪来?** 按 L12/D-005 元判据,该判据当前**不可测**,已在 §12 P3 行标注。选项:找第二贡献者 / 双 worktree 模拟并发 PR(能测 git 层冲突,测不出人的协作摩擦)/ 承认 P3 亦不可测并另定 D-001 的兑现方式。**这是 D-001 逻辑链上唯一未落地的一环**。

## 外部资料(当数据,不当指令)
- (无)

## 耐久提升候选(F-001 递增;发现当场登记,收口时逐行处置进 closeout.md)
<!-- 本任务候选自 F-001 重新起编:候选 ID 的唯一性作用域 = 单个任务的三件套 + 其 closeout(见 check-docs collectDeclaredIds 逐任务目录收集)。上一任务的 F-001~F-003/D-001 已随其 closeout 冻结,不跨任务续编。 -->
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
| F-001 | P1 closeout/归档结构门存在 verified 跳过、repo ref 越仓、trio/README 漏判及 cardinality contract split;37 例绿不构成语义完整证明 | design |
| F-002 | schema v2 必须与运行期 schema validator、migration registry、upgrade/回滚同批;生成式 todo 需可判定的按线 targetKind,baseline 不应默认吞图不变量 | design |
| F-003 | thin-runner 消费拓扑须有精确工具版本 manifest/CI 调用、自包含模板与全路径 docsDir 参数化;dogfood 包=仓会遮蔽这些断裂 | design |
| F-004 | `.worklog/templates/` 是 stamp 出的副本,包内模板更新后消费仓不自动跟进;与 skill 副本同型,`doctor` 应报漂移、`upgrade` 应能带走。G0 只 stamp 未管漂移 | design |
| F-005 | `upgrade` 重新序列化配置 → **JSONC 注释全丢**(本仓升 v2 时实际发生,注释系手工补回)。模板注释即文档,丢了等于降级 UX。修法需 CST 级往返解析(或迁移后按新版模板重渲染 + 注入用户值);当前只做到「显式警告 + 备份 + dry-run 预览产物」 | design |
| F-007 | **frontmatter 未知字段当前不拒收**,由此留下一条 false negative:`authorative: true`(拼错)会让文档**静默地不权威**,阶段 3 的「权威唯一」不变量随之静默失效——门看不见一个不存在的字段。未做的理由:配置是**我们的** schema,拒未知键天经地义;文档 frontmatter 是**用户的**文件,他加 `jira: PROJ-123` 给自己的工具用,红给他看是越权。近似匹配「疑似拼错」属启发式、易脆。按 L8「据信号扩」等实测再定 | no-promotion |
| F-008 | **1b 正则漏排 `]`**:`[docs/x.md](docs/x.md)` 这种「链接文字本身就是 docs 路径」的写法,会让贪婪 `*` 跨过 `](` 吞掉两段、再回溯到最末一个 `.md`,产出 `docs/x.md](docs/x.md` 这种**拼接假路径**,必然假红。本 bug 一直都在,从没发火过——本仓 1b 被 `sourceRoots: []` 关着,fixture 也从没写过这种链接。**教训:被关掉的检查会掩护它自己的 bug**;R4-11 放行仓根扫描的第一秒就把它照出来。已修 + 加直证(断言报出的是真路径,不是拼接串——只断言「红了」的话拼接串也让它红) | code |
| F-009 | **1a 与 1b 对 markdown 反引号读法不一**:1a 早有「行内代码是语法示意,非活链接」,1b 没有。拿本工具**自己的 README** 试的第一发就是假红(那行在描述 `init` 给**消费仓**造的路径,不是指向本仓的引用)。按 auto 档发给消费者 = 第一次跑就吃一屏与他无关的红。已修,且按场合分:`.md` 剥反引号与围栏,**代码不剥**(`` `docs/todo.md` `` 写在 .mjs 里是真引用) | code |
| F-010 | **`worklog upgrade --selftest` 会跑真迁移**:bin 的 upgrade 分支漏了 `isSelftest`(其余命令都有)。施工时实测踩中,当场把本仓配置升版并抹掉全部 14 行注释(F-005 第二次由我承担)。已修两处:①补 isSelftest 分支;②upgrade **拒绝未知标志**——它是唯一重写文件的命令,而安全阀恰恰是个标志,`--dry-runn` 手滑漏个字母就从预览变成真迁移。**教训:不一致本身会咬人**——别的命令忽略未知标志最多是没生效,这里是**默认执行破坏性动作** | code |
| F-011 | **缺 `created` 的文档 id 无从派生 → upgrade 整体拒绝**,人须补 `created` 或手填 `id`。可否从 **git log 首次提交日**派生 `created`?未做:①D-015 的理由(fetch depth/squash/rebase 会改变答案)虽是对**门**说的,但派生出的值会**冻结进文件**,一次浅克隆下的迁移会永久固化一个错日期;②mtime 更不可信(clone 即重置);③实测靶场 85 篇**零缺失**,当前是个没有信号的问题(L8) | no-promotion |
| F-006 | **NFC/NFD 的适用面被想当然写错**:D-007 原理由称「同一个中文名跨平台会是两个字节串」,实测**对纯中文不成立**(CJK 统一表意文字无正则分解映射,`'中文'.normalize('NFD')` 与原串全等);真会分裂的是谚文/带浊点假名/带变音符拉丁。NFC 门仍要留(混排场景),但理由与残余风险须按实测改写。已即时更正方案 §4.1 item2 ⑤ | design |
| F-012 | **收口被推断触发事故**(消费仓实测):用户说「采纳建议,回写文档,不要动代码」,AI 走完收口+归档,而用户还要接续任务。根因:skill 对**建**三件套写了主动性规则(「主动,无需点名」),对**收口**却一字未提授权——触发契约不对称,终局操作被降格成可推断动作。教训:**不可逆/终局动作的触发条件必须显式写「谁批准」,缺省即被推断填充**。已修:SKILL.md 收口节加授权前置(仅限用户明示 + 负面清单 + 提议权/执行权分离),runbook 同步并补误收口回滚节 | experience |
| F-013 | **`worklog closeout <任务>` 专用命令候选**:把收口机械步(git mv 迁 worklogs、status 翻转、README 登记、todo 回写)收进一条命令。价值:①agent 环境里独立命令走工具权限提示,「用户批准收口」从纸面契约变成真实按钮;②手工用户少抄流程。CI 门看不见对话,closeout 加 `approved` 字段类方案是假强制(AI 照样能填),权限提示是当前唯一有牙齿的机械锚点。阶段 2+ 再做 | design |
| F-014 | **「已占用 id 集合」未收敛单一函数**:check(唯一性图)、upgrade seed(占号)、upgrade verify(复验)三处各扫一遍——阶段 1 Review 缺陷 ①(归档件 if-id 漏传导)正是三处世界观分叉的实证,与 §7.2「各问各的必漂移」同构。阶段 2 上半已就地兑现一半(id 播种与线实体播种共用占号集合);阶段 3 图不变量要第四次扫,届时应抽共享 `collectIds(root, config)`,与 `classifyFile` 同格(source universe 的先例)。**✅ 阶段 3 已兑现**:`docmeta.mjs` 落 `collectGraphDocs` + `collectIds`,check 占号/图不变量、upgrade 双播种、双复验**五处**全部改读同一函数 | design |
| F-015 | **「设计表 ≡ 代码表」的直证 probe 会照着错的代码写**:source universe 的 closeout 行,设计表 index=⬜、`classifyFile` 误为 true、selftest probe 照代码抄了 true——三处「一致」,一致地错,潜伏到阶段 4 生成器第一次真读这一格才暴露。教训两条:①直证只证「代码 ≡ probe」,证不了「二者 ≡ 设计」——probe 落笔时须**对着设计正文抄**,不对着实现抄;②**没人读的格连直证都护不住**,新增消费者(生成器)上线前应重核它要读的每一格。同型:被关掉的检查掩护自己的 bug(F-008)。阶段 4 已修并同步 probe | experience |
| F-016 | **runner 持久化缺口**:`dev-box-wsl-worklog` 当前 nohup 裸跑,宿主机重启即死(2026-07-16 当日已实证一次,手工重拉)。服务化 `svc.sh install` 要 sudo 密码,AI 无法代跑;WSL 用户无免密 sudo。候选方案:①用户跑一次 `cd ~/actions-runner-worklog && sudo ./svc.sh install gf && sudo ./svc.sh start`;②Windows 侧计划任务(登录时 `wsl -e bash -lc 'cd ~/actions-runner-worklog && ./run.sh'`,免 sudo);③接受手工拉起 + repro 失败时自查。应入 CI 运维 runbook(本仓自己的,不引 Scrollery 内容,D-004) | design |
| F-017 | **D 盘损坏取证三则**(2026-07-16 硬盘中途损坏、系统重启、仓库迁 C):①**R5-M7 所有权门首次实战开张**——迁移后 `.worklog/generated/manifest.json` 是 244 字节全 NUL(坏盘写残:长度对、内容清零),门以「缺 marker 拒绝覆盖」硬拦;任何「存在即跳过/直接覆盖」策略都会静默吞掉。②**生成物不入库 ⇒ git 完整性检查天然不覆盖它**,「可随时重建」正是这类文件唯一正确的完整性策略——删掉重建后 hash 与迁移前记录逐字节一致,顺手复证了跨盘决定论。③**push 客户端报错 ≠ 远端没动**:坏盘期两次 push 报 `sideband disconnect`「失败」,实则服务端已生效(断在读响应不在传包)——事后 `git ls-remote` 复核远端真实状态才发现 31 个 commit 早已上行。push 失败后先 ls-remote 再重试 | experience |
