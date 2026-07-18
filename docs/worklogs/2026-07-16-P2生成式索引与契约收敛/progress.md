---
status: snapshot
type: working-memory
line: P2生成式索引与契约收敛
created: 2026-07-16
---

# 进度日志:P2 生成式索引与契约收敛

## 会话:2026-07-16(开线 + 范围排序)
- 做了:上一任务「建仓与v0.3基线」收口(`4e25bdf`)后按方案 §12 line 406「每阶段落新仓后按 `/planning` skill 建三件套跟踪」开本线;把 §12 P2 九件范围**按依赖重排**为七阶段(元数据下沉 → 线实体+迁移命令 → 权威/生命周期 → 生成式索引+分片 → 档间迁移+upgrade → profile 全家 → 发布管线),排序理由记 task_plan 决策表。
- 验证:开线本身无可验之物;`worklog check`/`index` 两门在建完三件套后应仍绿(三件套受 `isTrio` 豁免 frontmatter 校验,但 `docs/planning/` 目录须仍在职责表内——上一任务归档后该目录曾一度为空)。
- 关键发现(三条,均记 findings):①**阶段 7 判据与 CI billing 现状冲突**——「artifact 发布可复现」须 CI 产出,而 CI 4s failure 且用户已裁暂不管,判据当前不可满足;②`profile` 四档是**空壳**(schema 有枚举、check-docs 不读),阶段 6 是从零实现;③本仓 8 文档 `line` 值**全是语义 slug 无一字母**,故 F-001 迁移命令的人工重命名分支**本仓 dogfood 测不到**,须 fixture 负例覆盖——与 P1.5 盲区同型。
- 遗留:**待用户批准开工**。D-001 裁的是「P2 做不做」,方案卷首红线「写码须另行批准」未解除。阶段 7 的判据冲突建议开工前一并裁。

## 会话:2026-07-16(Scrollery dev 实测 → 六条裁决回写)
- 做了:用户裁六条(A no-leak 不入仓 / B Scrollery 是首要消费者 / C 元判据采纳 / D 本地 runner 先行 / profile 清单选 1 / M-6 边界=元模型收敛实例可配),全部回写方案:§0 新增 **L11**(首要消费者)+ **L12**(判据元规则);§7.4 新增 **D-003**(元模型/实例二分表);§7.5 **D-002**(四档砍两档 + 排期前移);§8 新增 **D-004**(no-leak 双向表 + 合成 fixture 六类形态清单);§9 **D-006**(阶段 7 判据拆半);§12 P3 行标注元判据未过;§4.1 item2 ④ **按实测重写**;§8.1 A–Q → A–S。P2 task_plan 阶段 6 前移为阶段 0。
- 验证(实测,非估算):**先犯错后纠正**——初次按用户给的私有仓 clone 默认分支(`main`),据其形态断言「§8.1 写错了」「F-001 输入假设错了」;用户给出 `dev` 分支 + 本地 `/d/workspace/scrollery` 后复查,**两条断言均证伪**:`main` 是 2026-07-06 旧貌(`plan-docs/`、无 `check_docs.mjs`、零 frontmatter),`dev`(`cd0443c`,今日)才是真身,§8.1 描述与之相符。`dev` 实测:165 md;字母登记表 **A–S 19 行**+ `(T)` 在野 = 20/26;`line:` **124 文档 / 54 distinct 值**;混合形态 12 个;O 行原注「原误取 I 撞号,2026-07-10 改 O」。profile 空壳两次实证(合成 fixture 声明 `advisory` → exit=1;Scrollery 声明 `brownfield` → exit=1)。
- 关键决策:六条全部落地,见 task_plan 决策表 D-002~D-006(D-001 属上一任务已冻结)。
- 遗留:**D-001 押注的 P3 验证场无第二人**(见 findings 待裁);仍待用户批准开工阶段 0。

## 会话:2026-07-16(第四轮审查:P1 实现对照 + P2 施工前把关)
- 做了:对 P1 全部实现(src/bin/skills/templates/schema/locales)+ 方案 v0.3 + 本三件套做首轮带码审查;报告落 `docs/reviews/2026-07-16-P1实现与P2施工前审查.md`(本仓新建 `reviews/` 目录并同步 README 目录职责表);方案文末登记 §19(19 项,1🔴+6🟠+12🟡,全部 pending);todo 工作线表补 `worklog-kit-oss` 行。
- 验证:审查前后 `npm run selftest`(37 例)+ `worklog check` + `worklog index` 全绿;两项可疑行为做最小复现坐实——`parseJsonc('{"a": "x,}" }')` 返回 `"x}"`(R4-04);`grep todo.md src/init.mjs` 零命中(R4-01)。
- 关键发现:①R4-15 slug 字符集——R3-1 与 F-001 两条已裁原则在中文 line 值上互斥,阻塞阶段 2;②dogfood 遮蔽类缺口两枚(R4-01 init 缺 todo.md、R4-02 skill 引包内路径),「包=仓」测不出,Scrollery 装入第一天即撞;③D-002/D-004 各有贯彻残留(R4-12/R4-18)。
- 遗留:六项待用户裁决(方案 §19 待裁焦点);裁后按红线回写正文 + 修码。

## 会话:2026-07-16(第四轮六项裁决回写)
- 做了:用户裁六条(裁 1 中文文件名一等公民「真失灵再修」、裁 2~6 全采纳建议),全部回写:方案 §4.1 item2 新增 ⑤(slug 字符集四则)、§4.1 item4(CLI 别名)、§5(R3-1 范围修正:文件名划出机器面)、§7.2(M-10 改 UTF-8 码点序)、§7.5(baseline 承载四则)、§8(D-004 边界修订)、§14 glossary、§19 全表翻状态 + 裁决记录、头注;残留清剿:仓根 README profile 行、schema profile enum 四值→两值、`.worklogrc.jsonc` dirs 映实际(去幽灵 archive、补 reviews)、模板注释;报告翻 snapshot 加裁决横幅;本 task_plan 决策表登 D-007~D-011、阶段 0 加前置项(R4-01/02)、七阶段补可测性标注、阶段 1「8 个文档」改实扫口径。
- 验证:回写后 `worklog check` + `worklog index` 双绿(见下次 commit 前实跑)。
- 关键决策:D-007~D-011,见 task_plan 决策表。
- 遗留:**P2 写码未开工**(用户明示另起会话);开工第一件事 = 阶段 0 前置项 R4-01/02。

## 会话:2026-07-16(第五轮二审:P1 契约复核 + P2 施工方案重排)
- 做了:精读全部实现/设计/第四轮报告/P2 三件套;新报告落 `docs/reviews/2026-07-16-P1契约复核与P2施工方案二审.md`,方案追加 §20(14 项:6🔴+7🟠+1🟡);按既有裁决清掉 L9/Q5/§8.3/glossary/§19/P2 profile/P4 upgrade 残留;task_plan 新增 G0 施工门并把 schema v2+upgrade+profile/baseline 合并为原子阶段,补实体 schema/source universe/status target/artifact/e2e 要求;findings 登 F-001~F-003。
- 验证(审查前):`npm.cmd run selftest` exit 0(37 例);`node bin/worklog.mjs check` exit 0(12 文档/0 代码);`node bin/worklog.mjs index` exit 0;`doctor` exit 0 且提示 Codex skill 漂移。
- 验证(回写后):`npm.cmd run selftest` exit 0(37 例);`node bin/worklog.mjs check` exit 0(13 文档/0 代码);`node bin/worklog.mjs index` exit 0;`git diff --check` exit 0(仅既有 LF→CRLF 提示)。
- 反证 fixture(全部 temp 后清理):①`no-promotion verified=no` → violations=0;②`repo:../仓外文件` → 0;③同候选两 target → `closeout.reDisposed`;④缺 findings/progress 的 worklog → 0;⑤缺 `worklogs/README.md` → 0;⑥skill 目标多余文件 → check exit 0;⑦`schemaVersion:"bad"`+未知键 → `errors=[]`;⑧fresh init 无 todo/trio 消费仓落点/版本 manifest。
- 关键结论:第四轮末「阻塞已清」被新证据推翻;P2 方向不变,但须先裁 closeout cardinality、baseline 图不变量、line-status kind、状态门 history、status 粒度、消费仓版本钉,并完成 G0 P1 契约硬化/自动 e2e。
- 遗留:**未改代码、未替用户裁六项**。下一步 = 用户裁第五轮六项 + 新的写码批准;之后从 G0 开工,不是直接写 profile/baseline。

## 会话:2026-07-16(第五轮六项裁决回写 + G0 开工)
- 做了:用户对二审 §6 六项**全采纳建议**并同时下达写码批准(原话「开始施工」)。裁决落 **D-012~D-017**,按规范文本回写红线改写方案正文:§7.1(cardinality 改一候选一行 + 新增仓根 containment/固定列 schema/verified 无条件三条契约)、§7.5(baseline 适用域:图不变量不可豁免)、§7.4(新增 `targetKind: line-status` + 为何不上模板 DSL/不降级 docs)、§7.2(只验快照不读 git history + 理由)、§4.1 item3(status 每线一文件 + 三条理由)、§6(消费仓版本钉三则)、§9 门禁步(钉精确版本)、§20 全表翻状态 + §20.1 裁决记录、卷首红线(写码已批)。二审报告翻 snapshot 加裁决横幅;task_plan 待裁表 → 已裁表 + 决策表登 D-012~D-017 + G0 状态 in_progress;findings/todo 同步。
- 验证:回写后 `worklog check` + `worklog index` 复验(见本会话 commit 前实跑记录)。
- 关键决策:D-012~D-017,见 task_plan 决策表。
- 遗留:G0 施工中。

## 会话:2026-07-16(G0 施工:P1 契约硬化 + e2e 安全网)
- 做了(六 commit,每个自带先红后绿负例):**G0-1** `17f8683` closeout 硬化——verified 移出 per-kind 分派(原 `none` 分支 continue 前跳过它)、新增 `validateRepoRef()` 仓根 containment(target/frozen/fixed/去重证据四处共用)、`CLOSEOUT_COLUMNS` 固定列 schema、trio 三件齐;**G0-2** `37e6e07` 索引门——worklogs 存在即要求 README、config.dirs↔README↔actual 三方一致(零配置起步不验 config 腿);**G0-3** `e2fd3eb` 配置——R4-04 尾随逗号移进状态机、新增 `lib/schema.mjs` 让校验**由 schema 文件驱动**、校验对象改磁盘原文、新增 `worklog selftest`/`config`;**G0-4/5/6** `e548919` 消费路径——init 读配置、fixed 靶点由配置驱动 stamp、模板/手册 stamp 进 `.worklog/templates/`+`docs/runbooks/`、`.worklog/manifest.json`、CI 钉精确版本去 `npm ci`、skills `--check` 双向、**新增 src/e2e.mjs**;末 commit 回写方案 §6/§9/§20.2 + 三件套。
- 验证(实测):`npm run selftest` **37 例/4 套 → 120+ 例/5 套全绿**;`worklog check`(13 文档)+ `index` + `doctor` 全绿;temp 非 Node 仓 init 手工实跑双门 exit 0。八项新负例经一次性探针**逐条核对实际消息**,确认「红对了原因」而非仅红。
- 关键发现:①**fixture 结构债**——trio 三件齐门一上,现役 closeout fixture(多只写两件)会集体变红,bad 用例将因非预期原因通过 = 假绿;故先补 `trio()` helper 写齐三件,再测「不齐」。②**测试自己抓到断言写错**——e2e 断言 CI 无裸 `npx worklog`/`npm ci` 时误匹配到模板**注释里解释为什么不这么做**的文字,改为只看 `- run:` 行。③R4-01 的正解不是硬编码 todo.md,而是**由配置驱动 stamp 每个 fixed 靶点**,从根上消掉「配置声明门验存、init 不造」这一类。④`.worklog/` 须进 sourceExclude,理由同 `.claude`/`.github`:模板里的 target 样例是示范不是引用。
- 关键决策:模板走「stamp 副本」而非「内联进 SKILL.md」——与 skill 分发同形(副本 + 漂移检查 + `--force` + upgrade),内联要为同一问题发明第二套心智,且把 drift 从路径挪到内容。代价 = F-004(副本漂移未管),已登记。
- 遗留:**三处诚实缺口,勿读作「G0 全清」**(方案 §20.2):R5-M5 后半(skill/runbook `docs/` 全参数化 → 阶段 4)、R4-11(仓根 1a/1b 盲区 → 阶段 1 source universe)、F-004。下一步 = **阶段 0**(schema v2 + upgrade 基座 + profile/baseline 原子交付);Scrollery `dev` 靶场装入已解锁。

## 会话:2026-07-16(阶段 0:schema v2 + upgrade 基座 + profile/baseline + 靶场验收)
- 做了(三 commit):`6a41b02` 违规改数据记录 `{file,line,rule,params}`(baseline 要按规则匹配,而 rule key 原本关在闭包里;line 与 file 拆开是因 D-013 的钥匙不含行号);`5f77e3e` schema v1 冻结 + v2(types 带 `canBeAuthoritative`、targetKind 加 `line-status`)+ migration registry + `upgrade --dry-run/apply/备份/写后复验/回滚`,**同批**(R5-C3);另建 `lib/slug.mjs`(D-007 四步,阶段 2 复用)与 `line-status` validator——只加枚举不实现 validator 就是「schema 说了话代码没听」;`31007af` profile 两档 + baseline 棘轮 + `--warn-only` + `init --profile` + 存量仓判据 + `lib/gate.mjs` 共用判定层。
- 验证:selftest **4 套/37 例 → 7 套/170+ 例**全绿;本仓 dogfood 跑了真 upgrade(v1→v2 落盘/备份/双门复验);靶场三条判据全达成。
- 关键发现(四条,均记 findings):①**NFC 门原本是死代码**——NFD target 先撞 lineStatusMismatch,永远走不到 NFC 检查;D-007 原文写了「先归一再比对」,实现时漏了。②**D-007 的理由是想当然的**(F-006)——「中文名跨平台会是两个字节串」对纯中文不成立(CJK 无正则分解映射);会分解的是谚文/浊点假名/变音拉丁。拿纯中文测 NFC 门 = 测恒真命题,全绿而什么都没证。③**e2e 挣到饭钱**——types 形态一改,`init.mjs` 回落取到对象、插值成 `[object Object]` 写进 frontmatter;五套单元全绿,只有 e2e 红。④**靶场 118→15→3 的差全部来自本人配置**,同型错误第二次,已立为方法论写进 §7.5 采纳步骤。
- 关键决策:baseline 条目带 **count 做棘轮**(钥匙折叠同文件同规则的多条违规,不带 count 则新债自动豁免 = D-008 警告的退化);可豁免规则用**允许清单**(阶段 3 图不变量由此结构上默认不可豁免,不靠记性);模板走 stamp 副本而非内联(与 skill 分发同形)。
- 遗留:F-005(upgrade 丢 JSONC 注释,本仓升级时亲历、手工补回)、F-006(NFC 理由更正)。**下一步 = 阶段 1**(frontmatter 元数据 + line/status 实体 schema + source universe 三张表;R4-11 仓根盲区并入)。

## 会话:2026-07-16(阶段 1:frontmatter 字段表 + source universe + schema v3 梯子)
- 做了(`30003f7`,一 commit):`lib/docmeta.mjs` 落 `DOC_FIELDS` 字段表 + `classifyFile`(source universe 单一真源)+ `deriveId`/`insertIdLine`;check-docs 接管新字段 + id 全局唯一;schema v3 + `MIGRATIONS`/`RECONCILERS` 分工;init 与 upgrade **共用同一套发号**;R4-11 结案(`auto` 并扫仓根文件,显式数组用 `"."`)。本仓 7 篇受检文档由**真 upgrade** 播种 id。
- 验证:selftest **170+/7 套 → 285/7 套**全绿;本仓 `check`(13 文档 + **2 仓根文件**,此前 0)/`index` 双 0;`upgrade` 幂等。
- 关键发现(四条,均记 findings):①**R4-11 的盲区里藏着三样东西**——漏扫本身、它掩护的 1b 正则 bug(F-008:漏排 `]`,`[docs/x.md](docs/x.md)` 会被贪婪吞成拼接假路径)、以及 1a/1b 对反引号的两种读法(F-009,拿本工具**自己的 README** 试的第一发就是假红)。**被关掉的检查会掩护它自己的 bug**:本仓 `sourceRoots: []` 关了 1b 十次提交,那条正则一直「全绿」。②**`upgrade` 只推版本号 ⇒ Scrollery 无法采纳 v3**(D-019)——存量仓 init 出来配置就是最新版、一次迁移都不需要,却满仓没有 id;早退一行就让播种代码永不执行,而 baseline 按 D-013 又豁免不了 idMissing = **两把梯子都够不着**,会直接推翻阶段 0 的靶场验收。由 gate fixture 挖出。③**「41 篇缺 line」是我算的不是量的**——165 − 124 跨 commit 跨口径,且 165 含 48 trio + 32 archive(本就不需要 line);实测真值 **10**,差 4 倍。**同型错误第三次(未遂)**,病换了形态:从「猜配置」变成「把两个量不同东西的数相减」。④**`upgrade --selftest` 会跑真迁移**(F-010)——bin 漏了 isSelftest 分支,当场抹掉本仓配置全部 14 行注释(F-005 第二次由我承担)。
- 关键决策:**两把梯子**(D-018,判据 = 机器能否派生该值;`id`→upgrade / `line`→baseline);**upgrade = 数据布局对账而非版本号推进**(D-019);source universe 成表 + archive「有 id 才参与图」(D-020);**`summary`/`title` 不设必填**(D-021——门对 summary 只断言得了非空、断言不了有用,必填只会产出一屏占位符,即门亲手造出它本该防的东西)。
- 意外:「R4-11 只是补个扫描域」的估计**错得离谱**——它是本阶段挖出真 bug 最多的一条线;而真正的风险不在它没修,在**它被关着的这十次提交里,没人知道 1b 是坏的**。
- 遗留:F-007(未知 frontmatter 字段不拒收 → 拼错的 `authorative` 会让权威唯一不变量静默失效,按 L8 等信号)、F-011(缺 created 时能否从 git log 派生,实测零信号)。**下一步 = 阶段 2**(`lines/` 线实体 + 引用门 + F-001 迁移命令,门与梯子同批)。

## 会话:2026-07-16(阶段 1 整体 Review + 三缺陷修复 + 收口授权契约)
- 做了(两 commit):`ca68f33` Review 坐实的三缺陷全修——①`seedDocIds`/`verifyIdsSeeded` 纳入归档件 if-id 声明的 id(D-020 翻案漏传导到 upgrade 侧的缝:梯子可播出与归档件撞号的 id 且复验放行,随后 `docs.idDuplicate` 按 D-013 不可豁免 = 梯子制造自己修不了的违规);②`insertIdLine` 混合行尾(首行 LF 正文 CRLF)把 id 插进正文,改按**首行自己的行尾**判;③`parseTables` 不跳 code fence,围栏示例候选表成幻影声明。`7d76ca9` 收口授权——消费仓实测事故(用户说「回写文档」被推断为收口指令),SKILL.md/runbook 加授权前置(仅限用户明示 + 负面清单 + 提议权/执行权分离)+ 误收口回滚节;findings 登 F-012/F-013。
- 验证:293 → 300 断言全绿;探针复跑三缺陷全消;双门 0。
- 关键发现:**翻案本身没错,错在翻案的下游一致性**——D-020 改了 check 侧,没跟到 upgrade 侧;「谁占了号」三处各扫一遍(check/seed/verify),已登记收敛候选(F-014)。三缺陷共性 = 同一语义两处各自实现,修复即对齐到已有真源。
- 遗留:F-013(`worklog closeout` 专用命令,阶段 2+)。

## 会话:2026-07-16(阶段 2 上半:lines/ 线实体 + 引用门 + schema v4 播种梯子)
- 做了(一 commit):schema **v4**(配置形状不变,变的是 `line` 数据布局:自由文本 → `lines/<slug>.md` 实体引用)+ `MIGRATIONS[3→4]`(实例层顺带补 type `line`、dirs `lines`)+ **RECONCILERS[4] 三合一对账**(id 播种 + 线实体播种 + README 职责表补 `lines/` 行——索引门三方一致的三条腿各给一把梯子);check-docs 引用门(`lineUnresolved`/`lineBadSlug`)+ 实体自检(`lineEntityType`/`lineEntityMismatch`)+ 文件名 NFC 断言(`lineFileNotNFC`);init stamp `lines/文档治理.md` 实体(否则 fresh init 当场红,R4-01 同病);id 播种与实体播种**共用同一占号集合**(F-014 教训就地兑现:实体 id 与同日文档 id 撞号时父目录消歧,有测试钉住);runbook 补「开线 = 新建实体」步与引用门条目。
- 验证:selftest **300 → 324 断言/7 套全绿**;本仓 dogfood 真 `upgrade` 落盘(13 → 16 文档:3 条线实体 `文档治理`/`worklog-kit-oss`/`建仓与v0.3基线` + README 补行外科命中),`check`/`index` 双 0,幂等复跑零变更;dry-run 零写入含「不建实体目录」断言。
- 关键决策:①两条新规则的**梯子分配**沿 D-018 判据——`lineUnresolved` 走 upgrade(实体可机械播种)不入 baseline;`lineBadSlug`(值全非法字符)是人判债,入 baseline 允许清单;②空 slug **跳过并注记**而非整体拒绝(与缺 created 不同:坏值不污染他人命名空间,拒绝整场 = 把能自动修的扣成人质);③`RECONCILERS` 只保留最新版条目(旧版条目永不被读即死配置),v4 对账**包含** v3 的 id 播种;④`lines` 目录名**固定不入配置**(它是 v4 数据布局的一部分,可配则引用语义随配置漂)。
- 遗留:阶段 2 下半 = 迁移四件事的 ②登记表归并 ③三类失配报告 ④todo 分节号改写 + D-004 六类形态合成 fixture;本仓「4 线」预测实测为 **3**(第 4 条是 trio 自身的 line,三件套豁免不需要实体)。

## 会话:2026-07-16(阶段 2 下半:字母登记表归并/退役 + 三类失配报告 + todo 分节退役)
- 做了(一 commit):迁移四件事 ②③④ 全落 `reconcileV4`——`parseLetterRegistry`(表头契约 `| 字母 | 工作线 | 立项 | 权威文档 |`,列**按名**匹配不按位置:它是用户的存量数据不是我们的 schema,与 closeout 固定列的判据相反而同理);②归并 = 立项日成为实体 `created`(id 随之带真实日期)、立项/权威文档写进实体**正文**(字段集属元模型 D-003,不为迁移私加字段),归并后登记表节改**退役横幅**保留标题(幂等性来源:退役后 parse 找不到表 = 全程 no-op);③死号/野号/表外线三类失配以 notes 上报(机器判不了,必须人看);④todo `## X. 标题` → `## 标题`,只改登记表里真有的字母(别的 `X.` 可能是普通编号,机器不猜)。`slug.mjs` 加 `letterTail`。
- 验证:selftest **324 → 342 断言/7 套全绿**;六类形态合成 fixture(D-004:假字母表+假语义名)逐项断言:五条被引用线建实体、死号不建、混合 `乙线(D)` 剥尾仍归并、三类失配全上报、退役横幅落位、todo 只动 A 不动 Z、退役后幂等、dry-run 零写入;**同文件双笔变更叠加**(README/todo 同批既播 id 又被改写)有专门断言——变更集按 path 去重后者覆盖前者,第二笔必须叠在第一笔内容之上,否则冲掉 id 播种、复验回滚整场。本仓双门 0、upgrade 幂等「无需迁移」。
- 关键决策:登记表列按名匹配(用户数据宽容)vs closeout 列按位置(自家契约严格)——同一张「表怎么读」的问题两个相反答案,判据是**谁拥有这张表**;实体已存在时登记表行**不自动归并**(迁移不重写用户手建文件),注记请人工核对。
- 遗留:阶段 2 收尾判据已齐(引用门可拦、六类形态覆盖、迁移幂等);下一步 = **阶段 3**(权威/生命周期不变量:supersedes 成对、权威唯一、归档线不得被 active 引用——届时兑现 F-014 抽共享 `collectIds`)。

## 会话:2026-07-16(阶段 3:权威/生命周期图不变量 + F-014 共享扫描器)
- 做了(一 commit):**先收敛再加门**——F-014 兑现:`docmeta.mjs` 落 `collectGraphDocs`(source universe「id/取代图」列的机器兑现:governed 带 fm + archive if-id)+ `collectIds`(占号图唯一实现,带撞号回调);check 的占号循环、upgrade 的 `seedDocIds`/`seedLineEntities`/`verifyIdsSeeded`/`verifyLinesResolved` **五处扫描全部改读同一函数**(图不变量本要成为第五份各自实现)。新门 `checkGraphInvariants`(check-docs):①`supersedes`/`supersededBy` 悬垂(`idrefDangling`)/自环(`supersedesSelf`)/不成对(`supersedesUnpaired`,双向互指才绿);②终态字段 `superseded` 必携 `supersededBy`(`supersededNoRef`);③双活组合 `supersededBy`+draft/active 互斥(`supersededButAlive`);④**权威唯一**(`authorityDuplicate`,键 = slugify(line)+scope 精确相等,scope 缺省=整线可细分,只数 active+authoritative);⑤归档线引用禁令(`lineArchivedRef`,现役 draft/active 文档不得引用 status∈{archived,superseded} 的线实体;snapshot 冻结件豁免——历史事实不迫改写)。runbook 补**关线墓碑教义**:关线 = 实体改 `status: archived` **留原地**(git mv 走会断老 snapshot 的引用门、丢撞名保护),并线可 `supersededBy` 指去向。
- 验证:selftest **342 → 361 断言/7 套全绿**(+17 fixture:双权威(§12 点名)/scope 细分/跨字母尾同键/悬垂/自环/双向各缺一边/双活/终态字段缺失与齐备/归档线被 active 引用红、被 snapshot 引用绿/墓碑独存绿/archive 参与成对与悬垂两例;+2 教义直证:七条图规则**不在** BASELINE_ELIGIBLE、`supersededNoRef` 在);本仓 `check`(16 文档)/`index` 双 0;`upgrade --dry-run` 幂等「无需迁移」。
- 关键决策(D-024):阶段 3 **不需要 schema v5 也不需要迁移**——全部新门只作用于可选字段与状态组合,存量仓没声明这些字段就零新红,门与悬崖不同时存在,F-001 无从违反;唯一有存量形态的 `supersededNoRef` 按 D-018 入 baseline(接任者是谁机器派生不出:A.supersedes=B 时机器虽**能**推 B 的 supersededBy,但替 B 落笔=机器替人裁决 A 的取代主张成立,方向性判断属人);其余七条图规则按 D-013 结构上不可豁免,并有 selftest 钉住清单本身。组合不变量只对状态机**既知词汇**(draft/active/snapshot/superseded/archived)说话,自定义状态的生死语义机器不猜。
- 关键发现:`deprecatedStatuses` 默认只含 `superseded` 不含 `archived` 在阶段 3 **恰好成为承重墙**——墓碑教义(归档线实体留原地)依赖「`status: archived` 在活区合法」;若当初把 archived 也列为已死状态,关线就无处安放。负例隔离亦因此有讲究:`superseded` 相关用例须 `deprecatedStatuses: []` 隔离,否则 bad 用例因旧规则红(假绿)、ok 用例根本绿不了。
- 遗留:下一步 = **阶段 4**(`index build` 生成式索引 + `status/<slug>.md` 分片 + todo 一次性迁入 + `targetKind: line-status` 全链启用 + artifact contract;生成器幂等为 §12 点名判据)。
## 会话:2026-07-16(阶段 4:生成式索引 + status 分片 + 路径参数化,三 commit)
- 做了:**上半 `8c4c434`**——schema v5(`index.mode`/`outDir` 两可选键,缺省 invariant 存量零影响)+ `src/build-index.mjs`(`cmpCodePoints` 可执行字节契约、恒 LF 无时间戳、marker 所有权、全临时件后统一 rename、manifest sha256)+ CLI 分口(D-009:显式 build/check,裸 index 按档别名打印所指,invariant 档拒 build)+ init stamp .gitignore;顺带修 `classifyFile` 潜伏漂移(closeout 的 index 格)。**下半 A `f0a5edf`**——`RECONCILERS[5]` generated 腿六步(配置 flip/closeout 台账改写/每线一分片/todo 分节迁入+退役横幅/README 行/.gitignore),分片实体门三规则,STATUS 聚合分片正文(剥 H1 降两级);本仓 dogfood **真升 generated 档**(3 分片、closeout 两行改写、todo 退役 + 人工归并)。**下半 B `7e4e118`**——R5-M5 后半:init stamp 时 `docs/`→docsDir 全参数化(SKILL/runbook/四模板),滚动状态措辞改档位无关,e2e 断言自定义 docsDir 零残留。
- 验证:selftest **361 → 424 断言/8 套全绿**;本仓双门 0;`upgrade`/`index build` 双幂等(重跑零变更/逐字节一致);产物被 .gitignore 收编(git status 干净)。
- 关键发现(均记 findings/决策表):①**「设计表 ≡ 代码表」的直证 probe 自己也会照着错的代码写**(F-015)——closeout 的 index 格三处一致地错到生成器上线才暴露,没人读的格直证也证不了;②dogfood 真跑连暴两处仅靠 fixture 测不出的缺陷:全孤儿分节仓不插退役横幅、分片 `##` 与 per-line H2 抢大纲——**fixture 覆盖设计好的形态,真仓覆盖没设计过的**;③WSL 无 node,跨平台 hash 复验并入阶段 7。
- 关键决策:D-025 阶段 4 边界四则(v5 双可选键/台账随契约迁移由工具改写/退役横幅无条件/嵌入降级),见决策表。
- 遗留:下一步 = **阶段 5**(全链路升档 e2e:旧 schemaVersion fixture 一路升到 v5 generated、fresh temp 消费仓自包含复验、§12「升档迁移 e2e」判据)。

## 会话:2026-07-16(阶段 5:全链路升档 e2e,`f17a9a7`)
- 做了:e2e 新增 §D「全链路升档」——v1 时代存量仓(字母登记表 + 无 id + 自由 line + 单文件 todo + 旧契约 closeout)三程走完:①真 upgrade v1→v5(id 播种/登记表归并退役/README 补行/todo 分节号退役)双门绿;②用户显式改 `index.mode=generated`(R3-3 开关归人)再 upgrade(处置 flip/todo→status 内容随迁/旧台账改写/退役横幅)双门绿含 line-status 验存;③幂等零变更。生成器在该消费仓两次构建逐字节一致;**全程 docsDir=documentation**,零 `docs/` 回落。全部复用阶段 0 基座,零新增迁移机器。
- 验证:selftest **424 → 442 断言/8 套全绿**;本仓双门 0。
- 关键发现:e2e 首跑即揭出**浅合并陷阱**——`config.index` 与 DEFAULTS 是浅合并,用户只声明 `{mode}` 时 `config.index || DEFAULTS.index` 的**整对象**兜底失效(对象 truthy、键却缺),`dirTableHeading` undefined 直接崩在 escRe;修法 = `indexHeadings()` **逐键**兜底并集中一处(upgrade/check-index 两处改用)。与阶段 4 的两处同款:**fixture 覆盖设计好的形态,真链路覆盖没设计过的**。
- 遗留:**P2 完成判据 3/4 已达**(生成器幂等 ✓ / 结构负例可拦 ✓ / 升档迁移 e2e ✓);剩「artifact 发布可复现」= **阶段 7**,其前置(WSL 装 node、自托管 runner 注册)是系统级变更与外部注册,**须用户执行/批准**——无人值守到此为界。

## 会话:2026-07-16(阶段 7:发布管线——repro workflow + 自托管 runner,P2 判据 4/4,`51a5876`)
- 做了:用户批准两项前置(①WSL 装 node ②runner 注册及 GitHub 侧操作)后施工:nvm 装 node v24.18.0(`.bashrc` 非交互早退,补 `~/.profile` 加载);Windows(v26.2.0)/WSL 交叉构建 sha256 复验**全中**(阶段 4 缺口关闭);注册本仓专属 runner `dev-box-wsl-worklog`(runner 仓级作用域,独立目录 `~/actions-runner-worklog`,与 Scrollery 实例并存;svc.sh 要 sudo 密码 → nohup 裸跑,持久化缺口登记 F-016);新增 `.github/workflows/repro.yml`(self-hosted 独立 workflow:全量 selftest + 双门 + 同 run 两次 build 字节 diff + hash 摘要 + artifact 上传),ci.yml 三条分项 selftest 并成 `worklog selftest` 全量入口;push main(用户单独明批——「批准 1 2」经分类器裁定不含 push,CLAUDE.md 要求逐次授权)。
- 验证:repro 两次独立 run(`29504006877` push 触发 / `29504282498` dispatch)同 commit `51a5876` 全绿,artifact 下载比对 sha256 逐字节一致,且与本机双环境同值(INDEX `dae7efb3…` / STATUS `d03b432a…` / manifest `cbb007c6…`)——**四环境一份字节**;workflow 步骤先在 WSL 预演(8 套 442 例 + 双次构建 diff)再上 CI;hosted ci 矩阵 push 后 5s 红 = billing 阻断,D-006 预期内。
- 关键发现(F-017 三则):**中途 D 盘损坏、系统重启、仓库迁 C 盘**。①迁移后 `manifest.json` 成 244 字节全 NUL(坏盘写残),**R5-M7 所有权门首次实战开张**——缺 marker 拒绝覆盖,硬拦住静默吞坏文件;②生成物不入库 ⇒ git 完整性检查覆盖不到,「删掉重建」即正确策略,重建 hash 与迁移前逐字节一致(跨盘决定论顺手复证);③坏盘期两次 push 报 sideband disconnect「失败」**实则服务端已生效**——事后 `ls-remote` 才发现 31 commit 早已上行;push 失败先 ls-remote 复核再重试。另:盘坏前的 EUNKNOWN/ENOSYS/幽灵 garbage 告警全是前兆,当时误判为杀软瞬时锁。
- 遗留:**P2 判据 4/4 全达,七阶段全 done;收口待用户明示**(F-012 契约)。F-016(runner 持久化)、F-013(closeout 命令)、F-007/F-011(等信号)、F-004/F-005 随收口逐行处置;hosted CI 补验待 billing 恢复(D-006,预计 2026-08)。

## 回顾(2026-07-16 收口)
- 亮点:①单日走完 G0 + 七阶段,判据 4/4,selftest 37 例/4 套 → 442 例/8 套,每阶段负例先红后绿;②字节契约从「构造上应当决定论」升级为**四环境实测同 hash**(Windows node26 / WSL node24 / CI 两次独立 run);③门禁实战开张——R5-M7 所有权门在真实坏盘事故里首咬 NUL 残件;④「门与梯子同批」全程未破例:v3/v4/v5 三次升版各自带 MIGRATIONS/RECONCILERS,本仓 dogfood 全部走真 upgrade。
- 教训:①**同型错误反复换形态**——猜配 taxonomy(两次)、跨口径减数(第三次未遂)、直证 probe 照实现抄(F-015),共病是「把自己的假设记成对方的事实」,均已方法论化写进 §7.5/experience;②**fixture 覆盖设计好的形态,真仓/真链路覆盖没设计过的**(阶段 4 两处 + 阶段 5 浅合并崩溃,三案同款);③被关掉的检查会掩护它自己的 bug(F-008/F-009,R4-11 放行第一秒照出);④push 客户端报错 ≠ 远端没动,先 `ls-remote` 再重试(F-017)。
- 意外:①施工中途 D 盘物理损坏、系统重启、仓库迁 C——反而成了所有权门与「生成物重建即完整性」的实战验收(F-017);②「31 commit 已上行」系事后 `ls-remote` 发现,坏盘期两次「失败」push 实则服务端已生效;③`wsl -u root` 免密绕开 sudo,让 runner 服务化无需用户到场(F-016);④阶段 3 发现 `deprecatedStatuses` 不含 `archived` 恰是墓碑教义的承重墙——一个 P1 的「没做」在 P2 变成「做对了」。
