---
status: snapshot
type: working-memory
line: P2生成式索引与契约收敛
created: 2026-07-16
---

# 任务计划:P2 生成式索引与契约收敛

## 目标

交付方案 §12 P2 全量范围:生成式索引 + 契约收敛。**用户裁 D-001(2026-07-16)全量 go**,不等 P1.5 信号(三指标 2/3 结构性无效,详见 `worklogs/2026-07-16-建仓与v0.3基线/`),建完直接进 P3 多人试点实测。

**完成判据(§12 P2 行,原文)**:生成器幂等;结构负例(双权威/引用缺失)selftest 可拦;artifact 发布可复现;升档迁移 e2e 过。

## 当前阶段

**七阶段全部 done,P2 完成判据 4/4 已达**(2026-07-16):生成器幂等 ✓、结构负例(双权威/引用缺失)selftest 可拦 ✓、升档迁移 e2e ✓、**artifact 发布可复现 ✓**(阶段 7:同 commit `51a5876` 两次独立 self-hosted run,产物 sha256 与本机 Windows/WSL 四环境全部逐字节一致)。**收口待用户明示**(F-012 授权契约:AI 只提议不执行);待收口时逐行处置 F-001~F-017。Actions hosted 集成按 D-006 留在 P2 外,billing 恢复(预计 2026-08)后补验。

**已完成**:G0(六 commit)+ **阶段 0**(三 commit)+ **阶段 1**(2026-07-16,`30003f7`)+ **阶段 1 Review 三缺陷修复**(`ca68f33`)+ **收口授权契约**(`7d76ca9`)+ **阶段 2**(2026-07-16,两 commit:上半 `275bd56` 线实体 + 引用门 + schema v4 三合一对账;下半 `4484f29` 字母登记表归并/退役 + 三类失配报告 + todo 分节退役 + 六类形态 fixture)+ **阶段 3**(2026-07-16,`dfea18f`:图不变量五门 + F-014 共享扫描器,无需 schema v5)+ **阶段 4**(2026-07-16,三 commit:上半 `8c4c434` 生成器 + schema v5 索引形态档;下半 A `f0a5edf` status 分片迁入 + todo 退役;下半 B `7e4e118` 路径全参数化)+ **阶段 5**(2026-07-16,`f17a9a7`:全链路升档 e2e,v1 存量仓一路升 v5 generated、自定义 docsDir 全程零回落)+ **阶段 7**(2026-07-16,`51a5876`:repro workflow(self-hosted)+ WSL runner 注册 + 跨环境 hash 复验;hosted 集成按 D-006 在 P2 外)。测试 37 例/4 套 → **442 例/8 套**。以下为历史记录:

**施工门 G0:P1 契约硬化 + 自动 e2e——已开工(2026-07-16)**。第五轮二审落 `docs/reviews/2026-07-16-P1契约复核与P2施工方案二审.md`/方案 §20;其 §6 待裁六项经用户**全部采纳建议**(→ D-012~D-017,见决策表),**写码批准同日下达**(用户原话「开始施工」)。方案卷首红线随之更新:写码已批,**建远程仓 / 发布仍待另行批准**。G0 出口绿前不得把工具装进 Scrollery 靶场。

## 阶段

> **排序理由**:下列顺序**不是** §12 的列举顺序,而是依赖顺序。第五轮二审补出五条硬约束:①**先修 P1 契约 false negative + 建自动 e2e**——不能在会漏判的门上继续叠 P2;②**schema bump 与 migration/upgrade 同批**——元数据/配置门不得先于梯子;③**profile/baseline 随 schema v2 基座最先落**(D-002),否则存量仓后续每阶段都在满屏红上加红;④元数据/实体 schema 是生成式索引与图不变量共同地基;⑤**任何新门与迁移命令同批**(F-001),包括 line 引用门与 todo→status。

### 施工门 G0:P1 契约硬化 + 自动 e2e(第五轮新增,阶段 0 前)
- [x] 全量源码/方案/首轮报告复核;最小 fixture 坐实 R5-C1~C6、R5-M1~M7;报告与方案 §20 落盘
- [x] **六项裁决**:用户 2026-07-16 全采纳建议 → **D-012~D-017**,已回写方案 §4.1/§6/§7.1/§7.2/§7.4/§7.5/§9/§20
- [x] 修 closeout false negative(`17f8683`):verified 移出 per-kind 分派;`validateRepoRef()` 仓根 containment;`CLOSEOUT_COLUMNS` 固定列 schema;cardinality 按 D-012(实现本就按 ID 去重,补注释锚定);trio 三件齐。补 12 项 repoRef 直证 + 9 项负例,八项经探针核对**实际消息**
- [x] 修归档结构门(`37e6e07`):worklogs 存在即要求 README;config.dirs↔README↔actual 三方一致;零配置起步不验 config 腿(R5-M1/M4)
- [x] 修运行期配置(`e2fd3eb`):R4-04 JSONC 篡改(尾随逗号移进状态机)/ R4-08+R5-M2(新增 `lib/schema.mjs`,校验**由 schema 文件驱动**、对象改为磁盘原文);新增 `worklog selftest` 聚合器 + `worklog config`
- [x] 修消费路径(`e548919`):R4-10 init 读配置 / R4-01 fixed 靶点由配置驱动 stamp / R4-02 模板与手册 stamp 进 `.worklog/templates/` 与 `docs/runbooks/` 并改指 / D-017 `.worklog/manifest.json` + CI 钉精确版本去 `npm ci` / R4-09 skills `--check` 双向
- [x] **先建 e2e 再加功能**(`e548919`):`src/e2e.mjs` 登记进聚合器(不可选)。temp **非 Node** 仓 init → 双门绿 → 幂等 → 消费仓可达路径 → fixed 靶点已造 → manifest/CI 版本钉 → 照仓内模板收口**中文名**任务 → 五类违规逐条先红后绿 → 自定义 docsDir 全程 → 配置非法零写入
- **可测性(L12)**:是——全部用合成 temp repo;新增负例须在修前复现红、修后全绿,不依赖 Scrollery/CI。**实测**:37 例/4 套 → 120+ 例/5 套,全绿
- **未在 G0 修(诚实缺口,勿读作全清;详见方案 §20.2)**:R5-M5 后半(skill/runbook 的 `docs/` 全参数化 → P2 阶段 4)、R4-11(仓根文件 1a/1b 盲区 → P2 阶段 1 的 source universe 表)、F-004(`.worklog/templates/` 副本漂移未管)
- **状态:** done(2026-07-16;出口台账见方案 §20.2)

### 阶段 0:schema v2 + upgrade 基座 + profile/baseline(D-002;R5-C3)
- [x] **G0 出口已绿**(2026-07-16):R4-01/02 已修、消费仓 e2e 已在 → **Scrollery `dev` 靶场装入解锁**
- [ ] 承接 G0 的三处诚实缺口:R4-11(仓根盲区)并入本阶段 source universe 表;R5-M5 后半留阶段 4;F-004 模板漂移随 upgrade/doctor 一并处理
- [ ] 正规 JSONC parser + JSON Schema 运行期校验;配置不存在可用 defaults,配置存在则按版本 schema 严格校验;config 错误 exit=2,不受 baseline/`--warn-only` 豁免
- [ ] `schemaVersion` 1→2、tool manifest、migration registry、`upgrade --dry-run` + 原子 apply/备份/回滚**同批交付**;不再只落 registry 骨架
- [ ] 元模型 v2:types 条目带 `name`/`canBeAuthoritative`;`targetKind` 枚举加 `line-status`(D-014);实例仍可配(D-003)
- [ ] `strict` / `brownfield` 两档落地(`greenfield`/`advisory` 已砍,见 §7.5 D-002)
- [ ] `--warn-only` 全局标志(承接原 `advisory`;只改变违规展示/退出,不吞配置/内部错误)及优先级矩阵
- [ ] `brownfield`:独立 `.worklog-baseline.json` 入库;`worklog baseline --update` 显式再生成,check 永不自动吸收。**适用域已裁(D-013)**:仅豁免可稳定定位的 per-file 存量规则;双权威/重复 ID/断 supersedes/归档线引用等图不变量**永远 enforce,不可豁免**
- [ ] `init --profile` 显式可选;自动选档的“存量仓”判据固定并可测试,不得靠模糊目录存在性猜测
- [x] **验证靶场**(2026-07-16 实测,只读副本):`brownfield` + `baseline --update` 立账后 `check`/`index` **双 exit=0**;新增一处违规 → **exit=1**;`--warn-only` → **exit=0`。三条判据全达成
- **⚠️ 原实测基线(已翻)**:`profile` 曾是空壳——`grep profile src/` 全仓仅 1 次命中(DEFAULTS 赋值),无代码读取;声明 `brownfield` 仍全量报红。**本阶段从零实现,非打开开关** → 已实现(`31007af`)
- **靶场实测三条结论**(详见 findings「阶段 0 验收」):①真实存量债仅 **3 条断链**(165 md/8 目录/3 个月);②**118 → 15 → 3 的差全部来自本人配置**,靶场没变——猜配 taxonomy 两次把「我少声明了」记成「它欠债」,已立为方法论并写进 §7.5 采纳步骤;③**偏置警告**:靶场是不变量的抽取源,是最好情况而非代表性存量仓,「3 条」证明抽取忠实、不证明能处理随机仓
- **可测性(L12)**:是——本地(selftest 正负例 + Scrollery `dev` 靶场实跑),不依赖 CI
- **状态:** done(2026-07-16)

### 阶段 1:frontmatter 元数据 + line/status 实体 schema
- [x] 文档 schema 扩 `id`/`line`/`title`/`authoritative`/`authorityScope`/`summary`/`supersedes`/`supersededBy`/`owner`;字段必填/可选、类型与适用 type **成表**(方案 §4.1 item1;机器真源 = `src/lib/docmeta.mjs` 的 `DOC_FIELDS`)。`summary`/`title` **裁为可选**(D-021)
- [x] `lines/<slug>.md` / `status/<slug>.md` 实体 schema **定案**(方案 §4.1 item2 ⑥):二者是手写入库文档、走**同一张字段表**,不需要第二套 schema,各占一个 `canBeAuthoritative: false` 的 type;两个 type 与各自落地阶段(2 / 4)同批进 DEFAULTS,不预先塞入(否则是死配置)
- [x] **source universe 成表并落码**(方案 §7.2 表 ≡ `classifyFile`);**R4-11 结案**:`auto` 并扫仓根文件,显式数组用 `"."` 点名。archive 取「声明了 `id` 才参与图」(D-020)
- [x] check-docs 校验新字段:`id` 非空/NFC/无空白与 `|/\`/**全局唯一**;`authoritative` 资格按 types 元模型判;`authorityScope` 无 `authoritative` 即死配置
- [x] **schema v3 + 梯子同批**(R5-C3):配置形状不变、文档数据布局变 → 仍升版仍给梯子;`upgrade` 语义修正为**数据布局对账**(D-019)
- [x] 本仓现役文档补齐新 frontmatter(dogfood 自迁移;实扫 13 篇 → 6 trio 豁免 / **受检 7 篇**,由真 `worklog upgrade` 播种;预测的 `README` 撞号如期发生并消歧)
- **可测性(L12)**:是——已兑现:selftest **170+/7 套 → 285/7 套**全绿;本仓 `check`(13 文档 + 2 仓根文件)/`index` 双 0
- **实测挖出三处**(详见 findings「阶段 1 实测」):①R4-11 的盲区里藏着**三样**东西(漏扫 + 它掩护的 1b 正则 bug F-008 + 1a/1b 对反引号的两种读法 F-009)——**被关掉的检查会掩护它自己的 bug**;②`upgrade` 只推版本号 ⇒ 存量仓两把梯子都够不着、**Scrollery 无法采纳 v3**(D-019 修之);③「41 篇缺 line」是跨 commit 跨口径的减法,实测真值 **10**——同型错误第三次(未遂)
- **状态:** done(2026-07-16)

### 阶段 2:`lines/<slug>.md` 线实体 + 引用门 + 迁移命令(F-001)
- [x] `lines/<slug>.md` 实体(一句话使命 + 可选 owner);`docs/README` 目录职责表加 `lines/`(表行由对账**机械补**——索引门三方一致的三条腿各给一把梯子);实体 schema 落地:type `line` 恒非权威、`line` 指向自身 slug(实体自检两规则)
- [x] 引用门:文档 `line` 必须存在对应实体文件(§4.1 item2 ②);`lineUnresolved` 走 upgrade 梯子不入 baseline,`lineBadSlug`(全非法字符)入 baseline(D-018 判据,D-022)
- [x] **schema v4 + 梯子同批**(F-001/R5-C3):`MIGRATIONS[3→4]`(实例层补 type `line`/dirs `lines`)+ `RECONCILERS[4]` 三合一对账(id + 线实体 + README 行),id 与实体**共用占号集合**(F-014 就地兑现);`--dry-run`/原子 apply/备份/回滚沿用既有基座
  - [x] ①解析 distinct `line` 值 → 剥 `(X)` 字母尾 → slugify → 生成占位实体(**语义已在值里,slug 自动派生**;人工只复核不发明)。**slug 规则已裁(D-007,§4.1 item2 ⑤)**:中文原样保留,剔非法字符 + 空格→`-` + NFC 归一;引用门断言 `lines/` 文件名 NFC、引用比对先归一 —— **上半已交付**
  - [x] ②字母登记表按工作线名(slug 化)匹配归并:立项日 → 实体 `created`(id 随之带真实日期),立项/权威文档写进实体**正文**(D-003 不私加字段);归并后登记表节改**退役横幅**保留标题(幂等来源);实体已存在的行不自动归并、注记人工核对
  - [x] ③三类失配以 upgrade notes 上报:死号(表有字母无 line 引用)/ 野号(字母在野未登记)/ 表外线(无字母无登记,实测多数)——机器判不了,必须人看
  - [x] ④`todo.md` 分节号退役(`## A. xxx` → `## xxx`)——只改登记表里真有的字母,别的 `X.` 前缀是普通编号,机器不猜;与同批 id 播种**叠加**不互相覆盖(有专门断言)
- [x] `line` 由自由文本收紧为实体引用(引用门即悬崖,已与梯子同批上线)
- [x] 负例 selftest:引用缺失可拦 / NFC 负例(NFD 文件名、NFD 引用值)/ 字母尾剥离与归并 / 非法字符清空 / id 撞号消歧 / dry-run 零写入 / README 补行幂等 / §8 D-004 **六类形态**合成 fixture(①假登记表 ②中文+下划线语义值 ③混合 ④野号 ⑤死号 ⑥表外线)/ 退役后幂等 / 同文件双笔变更叠加
- **可测性(L12)**:是——已兑现:合成 fixture 全覆盖(字母剥离与 NFC 分支本仓 dogfood 测不到,已由 fixture 补位);本仓 **3** 线实体化后双门绿(原估「4 线」含 trio 自身的 line,三件套豁免不需要实体)
- **状态:** done(2026-07-16;上半 `275bd56`,下半见次一 commit)

### 阶段 3:权威 / 生命周期不变量(R2-C3,§7.2)
- [x] **P2 门只验当前仓快照不变量(已裁 D-015)**:状态合法组合(`supersededButAlive`:声明 supersededBy 与 draft/active 互斥)与终态字段(`supersededNoRef`:superseded 必携 supersededBy);不读 git history,转换图留给写命令
- [x] `supersedes`/`supersededBy` 成对且双向一致(`supersedesUnpaired`);另拦悬垂(`idrefDangling`,§7.2 表下注点名)与自环(`supersedesSelf`)
- [x] **权威唯一**(`authorityDuplicate`):每 `(line, authorityScope)` 至多一个 active+authoritative;键 = slugify(line)+scope **精确相等**(「整线 ⊇ 某 scope」的包含语义 §7.2 没许诺,机器不猜),scope 缺省=整线、可细分
- [x] `canBeAuthoritative` 按 types v2 元模型判(阶段 1 已落 `authoritativeNotAllowed`);扫描域 = **`collectGraphDocs`**(F-014 兑现:governed+archive if-id+lines 单一真源,check 占号/upgrade 双播种/双复验五处扫描全部改读它)
- [x] 拆线/并线:**关线墓碑教义**(实体改 `status: archived` 留原地,git mv 走会断老 snapshot 引用门、丢撞名保护;并线 `supersededBy` 指去向,门验成对)入 runbook;归档线不得再被现役(draft/active)文档引用(`lineArchivedRef`;snapshot 冻结件豁免)
- [x] 负例 selftest:**双权威**可拦(§12 判据点名)+16 例(scope 细分绿/跨字母尾同键/成对双向各缺一边/双活/archive 参与图两例/墓碑三态)+ 教义直证(七条图规则不可 baseline、supersededNoRef 可)
- **可测性(L12)**:是——已兑现:selftest 342 → **361 断言/7 套**全绿;本仓双门 0、upgrade 幂等
- **无需 schema v5(D-024)**:新门只作用于可选字段与状态组合,存量仓零新红,门与悬崖不同时存在,F-001 无从违反;唯一有存量形态的 `supersededNoRef` 按 D-018 入 baseline
- **状态:** done(2026-07-16)

### 阶段 4:`index build` 生成式索引 + status 分片(§7.2,C-3)
- [x] `index build` 扫 source universe → `INDEX.md` / `STATUS.md`;排序 = `cmpCodePoints` **可执行字节契约**(码点序 ≡ UTF-8 字节序;fixture 钉住增补平面负例——UTF-16 `<` 会把 U+1F600 排 U+FFFD 前);恒 LF/无 BOM/无时间戳入 fixture。顺带修 `classifyFile` 潜伏漂移:closeout 的 index 格设计⬜、代码曾 true——生成器上线才有人读这一格
- [x] **CLI 面(D-009)**:`index build` / `index check` 显式子命令;裸 `worklog index` 按 `index.mode` 别名并打印所指;invariant 档拒绝 build(改档是数据布局迁移,R3-3)。schema **v5**:`index` 增 `mode`/`outDir` 两可选键,缺省 invariant 存量零影响,一次升版覆盖上下半
- [x] `status/<slug>.md` 分片(每线一文件,D-016;type `rolling-status` 恒非权威);todo 同阶段一次性迁入 = `RECONCILERS[5]` generated 腿六步(配置腿/closeout 台账改写/分片/todo 分节迁入+退役横幅/README 行/.gitignore),全幂等;分片实体门三规则(type/自身 slug/NFC)与梯同批
- [x] todo disposition 改 `line-status`(D-014)由对账机械 flip;**closeout 旧 todo 行由工具改写**至新靶点——台账是本工具契约(D-023),契约迁移随迁台账,不留满仓硬红;skill/runbook/templates 路径全按配置派生(init stamp 时 `docs/`→docsDir;滚动状态措辞改档位无关),e2e 断言自定义 docsDir 零残留
- [x] artifact contract(R5-M7):`index.outDir` 配置化(不得位于 docsDir 内,配置校验拦)+ marker 首行 + manifest sha256;全部临时件成功后统一 rename,失败保留旧产物;同名无 marker 文件**整体拒绝零写入**
- [x] 产物入 `.gitignore` 不入库(init 缺席时 stamp + 对账补行);无 drift gate、无 pre-commit hook(明裁维持)
- [x] **生成器幂等** selftest(两次构建逐字节一致,§12 判据)
- **可测性(L12)**:是——已兑现:selftest 361 → **424 例/8 套**(新 build-index 套);本仓 dogfood 真升 generated 档(3 分片 + closeout 两行改写 + todo 退役),双门 0、upgrade/build 双幂等。**诚实缺口**:Windows/WSL 字节 hash 一致未实测(本机 WSL 无 node)→ 并入阶段 7(WSL runner 本就是其交付物);字节契约当前由构造保证(恒 LF/码点序/无 locale)+ fixture
- **状态:** done(2026-07-16;上半 `8c4c434`、下半 A `f0a5edf`、下半 B `7e4e118`)

### 阶段 5:全链路升档 e2e + 消费者自包含(R3-3 / R2-M3)
- [x] 不变量门档 → 生成式档一次性迁移:e2e §D 三程链——v1 存量仓(字母登记表/无 id/自由 line/单文件 todo/旧契约 closeout)第一程真 upgrade 至 v5(中心登记 → 线实体 frontmatter,立项日随迁)双门绿;第二程用户显式改 `index.mode=generated` 再 upgrade(todo → `status/*` 内容随迁、旧台账改写)双门绿;第三程幂等零变更
- [x] 全程复用阶段 0 upgrade 基座(planUpgrade/MIGRATIONS/RECONCILERS),本阶段零新增迁移机器
- [x] fresh temp 消费仓自包含(e2e §A 既有)+ **自定义 docsDir 全生命周期**:§D 全程 `documentation/`,播种/分片/台账/产物零 `docs/` 回落;顺手修 e2e 揭出的 `config.index` 浅合并崩溃(整对象兜底失效 → `indexHeadings` 逐键兜底)
- [x] **升档迁移 e2e**(§12 判据点名);生成器幂等在消费仓路径上复证(两次构建逐字节一致)
- **可测性(L12)**:是——已兑现:selftest 424 → **442 例/8 套**全绿
- **状态:** done(2026-07-16,`f17a9a7`)

### 阶段 6:~~profile 全家~~ → **已前移为阶段 0**(D-002)
四档砍两档;能力并入阶段 0。第五轮建议收口后删除此空编号、改用阶段名引用;当前暂保留只为不在待裁期改写历史引用。

### 阶段 7:发布管线(R3-2;判据已拆,D-006)
- [x] `.github/workflows/repro.yml`(独立于 billing 阻断的 hosted ci.yml,互不牵连):checkout + setup-node 24 + **全量 selftest** + 双门 + 同 run 两次 `index build` 字节 diff + hash 摘要入 step summary + artifact 上传;ci.yml 三条分项 selftest 同批并成 `worklog selftest` 全量入口(SUITES 注册制防漏跑)
- [x] **同 commit 两次独立 run 产物 hash 一致**(§12「artifact 发布可复现」):commit `51a5876` 上 run `29504006877`(push 触发)与 `29504282498`(dispatch)均绿,双方 artifact 下载后 sha256 逐字节一致,且与本机 Windows(node v26.2.0)/WSL(v24.18.0)构建**四环境同值**:INDEX `dae7efb3…`、STATUS `d03b432a…`、manifest `cbb007c6…`
- [x] WSL 装 node(nvm v24.18.0,免 sudo;`~/.profile` 补加载——`.bashrc` 非交互早退不生效)+ 阶段 4 缺口关闭:Windows/WSL 字节 hash 交叉复验全中
- [x] 自托管 runner `dev-box-wsl-worklog` 注册进本仓(runner 仓级作用域,须独立于 Scrollery 实例另建 `~/actions-runner-worklog`);当前 nohup 裸跑,**持久化缺口登记 F-016**(svc.sh 要 sudo 密码,重启即死当日已实证一次)
- [x] ~~GitHub Actions 集成可用~~ → **移出 P2**(D-006):hosted 矩阵 push 触发后 5s 红(billing,预期内);待 billing 恢复(预计 2026-08)后补验
- **可测性(L12)**:半——「幂等+产物可复现」已实测计入判据;「Actions 集成」当前不可测(已移出,不计入 go/no-go)
- **状态:** done(2026-07-16,`51a5876`;中途遭遇 D 盘损坏迁 C 盘,取证与教训见 F-017)

## 第五轮六项(2026-07-16 已裁:全采纳建议 → D-012~D-017)

| # | 关联 | 裁决 | 决策 ID | 正文落点 |
|---|---|---|---|---|
| 1 | R5-C2 | 一候选恰好一处置行;多落点拆原子候选 | D-012 | 方案 §7.1 cardinality |
| 2 | R5-C5 | baseline 不豁免图不变量;仅豁免可稳定定位的 per-file 旧债 | D-013 | 方案 §7.5 baseline 承载 · 适用域 |
| 3 | R5-C4 | 新增专用 `targetKind: line-status`(配置只声明 `statusDir`) | D-014 | 方案 §7.4 |
| 4 | R5-C6 | P2 门只验当前快照,不读 git history | D-015 | 方案 §7.2 权威/生命周期 |
| 5 | R5-C6 | status 每工作线恰好一文件,「或每任务」作废 | D-016 | 方案 §4.1 item3 |
| 6 | R5-M3 | init stamp `.worklog-manifest.json` + CI 钉 `npx --yes worklog-kit@<ver>` | D-017 | 方案 §6 消费仓版本钉 · §9 门禁步 |

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 阶段排序按依赖而非 §12 列举顺序;第五轮后改为 G0 契约硬化 → schema v2/upgrade/profile/baseline → 实体/引用 → 图不变量 → 生成/迁移 → 发布 | ①现行门有 false negative,须先修地基并建 e2e;②schema bump 与 upgrade 同批;③存量仓 baseline 仍须早于新门;④F-001「不得只上门不给梯子」扩到全部迁移 | |
| profile 四档砍为 `strict`/`brownfield` 两档,`advisory` 降为 `--warn-only` 标志 | 用户裁 2026-07-16(清单选 1)。①实测 profile 是空壳(`grep profile src/` 仅 1 次命中即 DEFAULTS 赋值,无代码读;对 Scrollery dev 声明 brownfield 仍 exit=1 全红);②`greenfield` 与 `strict` 在新仓行为同一、`advisory` 是输出级别非档位——**两档是概念冗余**;③L11 裁 Scrollery(存量仓)为主消费者 → brownfield 是主路径非可选档。两档覆盖 100% 已知需求,工作量减半 | D-002 |
| M-6「保持可配」与 P2「契约收敛」边界 = **元模型收敛,实例保持可配** | 用户裁 2026-07-16。一个字段不可能同时「随便改」和「改了要迁移」;解法平移 R2-C5 已在 disposition 上用过的元模型/实例二分,不发明第二套心智。`schemaVersion` 只给元模型编号,用户增删 `types` 条目不触发升版 | D-003 |
| Scrollery 内容**一律不入仓**;只作本地一次性靶场,fixture 用合成假数据 | 用户裁 2026-07-16(A)。L11 裁 Scrollery 为主消费者后开出第二条泄露通道——worklog-kit 将来转公开(L3/P5),Scrollery 字母表/54 个 line 语义值是 §8.1 点名必清私料,做成 fixture 提交即等于转公开当日全泄 | D-004 |
| 判据元规则:每条完成判据须自带「此阶段是否可测」标注 | 用户裁 2026-07-16(C 采纳建议)。P1.5 三指标 2/3 无效却与"良好"同形致误读;同病已复发第二次(阶段 7 判据)。空读数与好读数在表上同形是机理 | D-005 |
| 阶段 7 判据拆两半:「生成器幂等+产物可复现」走 WSL 本地 runner 计入 P2;「Actions 集成可用」移出 P2 待 billing 恢复 | 用户裁 2026-07-16(D)。本地 runner 绿 ≠ hosted 绿(镜像/权限/`merge_group` 注册均不同),不得混为一谈 | D-006 |
| **中文文件名一等公民**:`lines/<slug>.md` 等文件名归使用者内容面,不锁 ASCII;slug 规则 = 剥字母尾 + 剔非法字符 + 空格→`-` + **NFC 归一**,门禁断言 NFC、引用比对先归一;排序改 UTF-8 码点序 | 用户裁 2026-07-16(第四轮裁 1):「中文文件名必须支持,是现行项目第一需求;真失灵再修」,具体方案授权定案。消解 R4-15 的 R3-1⟂F-001 互斥——R3-1 适用范围修正(文件名划出机器面),F-001 自动派生对中文值继续成立;残余 NFD 平台风险已知接受 | D-007 |
| brownfield baseline 承载:独立 `.worklog-baseline.json` 入库受治理;钥匙 = 相对路径 + 规则 key(改名即失配按新增);`worklog baseline --update` 显式再生成,check 永不自动吸收 | 用户裁 2026-07-16(第四轮裁 2,采纳建议)。baseline 改变门禁判定,须可 review 可 blame;自动吸收会退化为「自动豁免一切」 | D-008 |
| index CLI:`index build`/`index check` 显式子命令;裸 `worklog index` 按档别名并打印所指 | 用户裁 2026-07-16(第四轮裁 3,采纳建议)。现役脚本/CI/README 已固化裸 `index`,别名保兼容,打印防 R2-C1 式语义分叉在 CLI 层重演 | D-009 |
| D-004 边界修订:计数/形态可入仓;真实值样例**限额**(现存 6 处为上限,不再新增);P5 fresh-export 断历史时替换合成值,不现在重写历史 | 用户裁 2026-07-16(第四轮裁 4,采纳建议)。私仓阶段样例助施工理解;清除成本留给本就要断档的 P5 出口 | D-010 |
| R4 修码批准:🟠 R4-01/02 先行(Scrollery 靶场装入前必须在,第五轮归入 G0);🟡 九项(R4-03~11)须按依赖映射,不再笼统“顺手修” | 用户裁 2026-07-16(第四轮裁 5,采纳建议)。第五轮只调整已批工作的依赖落点:R4-04/09/10 亦进入 G0,其余明确映射到 schema/line/doctor 阶段;批准 ≠ 当前写码批准 | D-011 |
| B 类残留清剿即时执行(D-002 三处残留 / config dirs / task_plan 口径 / 七阶段可测性标注) | 用户裁 2026-07-16(第四轮裁 6,采纳建议)。纯执行已裁项无新决策;当日随回写 commit 落地 | |
| **closeout cardinality = 一候选恰好一处置行**;ID 即行主键,覆盖判定与去重判定共用同一把钥匙;多落点拆原子候选并互链 | 用户裁 2026-07-16(第五轮裁 1,采纳建议)。R5-C2 是 contract split 非 bug:§7.1 允许同 ID 多行,实现 `seen` 按 ID 去重,skill/template/README 三处均写「每候选恰好一行」——三套契约两个答案,裁向多数侧,元模型不为罕见形态引入组合键 | D-012 |
| **baseline 不豁免图不变量**;只豁免可稳定定位的 per-file 存量规则,双权威/重复 ID/断 supersedes/归档线引用永远 enforce | 用户裁 2026-07-16(第五轮裁 2,采纳建议)。图违规主语是文档集合/ID/line 而非单一路径:挑一个参与文件当钥匙会因顺序/改名漂移,每文件各记一条会在删一端后残留假豁免,消息 hash 会因文案/i18n 改动全量失配。将来若确需豁免图违规,须逐规则定义 canonical subject | D-013 |
| **schema v2 新增 `targetKind: line-status`**;配置只声明 `statusDir`,validator 从归档任务 `line` 求解唯一靶点并验存 | 用户裁 2026-07-16(第五轮裁 3,采纳建议)。`fixed` 的 target 是死字符串,表达不了随线变化的靶点;通用模板引擎会把元模型扩成 DSL、把可判定性外包给字符串插值;降级 `docs` 则任何文档都能冒充状态源、丢失固定靶点强度 | D-014 |
| **P2 门只验当前快照,不读 git history**;状态转换图是写命令的约束,不是 CI 的校验对象 | 用户裁 2026-07-16(第五轮裁 4,采纳建议)。快照里没有「上个 commit 是什么状态」,验转换必须引入 diff/history 输入;而 diff-aware 校验的答案会随 fetch depth/squash/rebase 变化——把「文档是否自洽」变成「CI 怎么 clone 的」。快照不变量幂等、可在任意 checkout 重跑 | D-015 |
| **status 每工作线恰好一文件**;设计「或每任务一文件」二义作废 | 用户裁 2026-07-16(第五轮裁 5,采纳建议)。①冲突隔离单位就是线,每任务分片不多隔离一分;②读者问的是「这条线到哪」;③`line-status` 要求靶点唯一,每任务一文件会让同线多任务给出多个候选靶点 | D-016 |
| **消费仓版本钉**:init stamp `.worklog-manifest.json`(版本/schemaVersion/profile/日期)入库;CI 钉 `npx --yes worklog-kit@<精确版本>`;不写 `package.json`、不假设消费者是 Node 项目 | 用户裁 2026-07-16(第五轮裁 6,采纳建议)。thin-runner 的代价 = 引擎不在消费仓,「跑的哪个版本」消费仓自己答不出;裸 `npx` 无本地 bin 时抓最新版,且同名 bin 冲突静默跑别人的。Scrollery 是 Rust/Tauri 仓,故 manifest 独立成文件而非 `package.json` 字段 | D-017 |
| **两把梯子**:新字段转必填即是新门(F-001 适用),但梯子有两把,判据 = **机器能否派生该字段的值**——能则 `upgrade` 自动补(`id`),不能则 `baseline` 立账挂起(`line`) | 阶段 1 定案。①判据不是「字段重不重要」而是「推不推得出来」,故可机械判定、不靠品味;②`BASELINE_ELIGIBLE` 的收录判据据此补第②条(原只有「主语是单个文件」),`docs.idMissing` 结构上被挡在允许清单外——给它开豁免等于用「记账挂起」替掉一条一个命令就能真修好的路;③实测支撑:靶场 85 篇受检文档缺 `created` **0** 篇 ⇒ `id` 全可派生,缺 `line` 10 篇 ⇒ 立账即清。§7.5 采纳步骤随之四步→五步 | D-018 |
| **`upgrade` = 让数据布局与所声明的 `schemaVersion` 相符(幂等对账),不是推进版本号**;`MIGRATIONS[n]`(跨版一次性)与 `RECONCILERS[n]`(当前版每次跑)分工 | 阶段 1 定案,**由 gate fixture 实测挖出**。原实现 `v === LATEST` 即早退;而存量仓 `init` 出来配置**就是最新版**(一次迁移都不需要)、旧文档却一个 `id` 都没有 ⇒ 播种代码永不执行,`baseline` 又按 D-013 豁免不了 `idMissing` ⇒ **两把梯子都够不着,Scrollery 无法采纳 v3**,直接推翻阶段 0 的靶场验收。版本号对了 ≠ 数据到位 | D-019 |
| **source universe 成表并落单一函数**(`classifyFile`);`archive/` 取「**声明了 `id` 才参与**图与唯一性」;仓根文件在 `auto` 档并扫、显式数组用 `"."` 点名(R4-11 结案) | 阶段 1 定案。①表须先于阶段 3/4 存在:图不变量与生成器都要问扫描域,各问各的必漂移——原实现已散成 `inArchive`/`isTrio` 两个各自为政的谓词;②archive 取 if-id 而非「一律补全 frontmatter」:**零迁移**(实测靶场 32 篇归档件仅 4 篇有 fm,其价值恰在冻结不动)+ **自然正确**(归档是 git mv,fm 随文件走 ⇒ 正常归档的文档自带 id)+ 不变量自愿加强;已知空洞(删 id 行即可退出图)小且可检出,按 D-015 门本就无法知道「它以前有 id」 | D-020 |
| **`summary`/`title` 不设必填**;`title` 缺省回落正文 H1 且**门不校验二者一致** | 阶段 1 定案。①门对 `summary` 只断言得了**非空**、断言不了**有用**,必填在存量仓只会产出一屏满足门禁而不告诉任何人任何事的占位符——**门亲手制造出它本该防的东西**,正是 Phase 3 拒绝生成式索引的原话「把人工蒸馏降级为机器倾倒」,与 D-005「空读数与好读数在表上同形」同构;生成式索引里的**空单元格**比写着 TODO 的绿灯更有压力;②`title` 与 H1 重复,必填即造出一对**必然漂移**的双写,而 R2-C1 已把 drift 语义从全文清剿过一次,不在此处重新引入 | D-021 |
| **引用门与对账的边界四则**(阶段 2 上半):①`lineUnresolved` 走 upgrade 梯子、不入 baseline,`lineBadSlug` 入 baseline;②空 slug **跳过并注记**不整体拒绝;③`RECONCILERS` 只保留最新版条目(v4 对账**包含** v3 的 id 播种);④`lines` 目录名固定不入配置 | 阶段 2 定案。①判据即 D-018「机器能否派生」——实体可从 line 值机械播种,坏值只能人改;②与「缺 created 整体拒绝」不同:坏 line 值不污染他人命名空间,拒绝整场 = 把能自动修的扣成人质;③planUpgrade 恒先推到最新版再对账,旧版对账条目永不被读即死配置(§7.4 判据);④它是 v4 数据布局的一部分,可配则 upgrade/引用门/生成器三处要各自跟着猜,引用语义随配置漂 | D-022 |
| **登记表列按名匹配、closeout 列按位置校验**——同为「表怎么读」,判据 = **谁拥有这张表**;实体已存在时登记表行不自动归并 | 阶段 2 定案。字母登记表是**用户的存量数据**:列换序不该让归并静默错位,故宽容读取(字母/工作线两列在即可)+ 失配上报;closeout 处置表是**本工具的契约**:固定列序才能按位置解构,列漂移必须硬红(R5-C1 原案)。归并不重写用户手建的实体文件,注记请人工核对——迁移的写入权止于自己造的东西 | D-023 |
| **阶段 3 图不变量四则**:①无 schema v5 无迁移——新门只作用于可选字段与状态组合;②`supersededNoRef` 是图规则里**唯一** baseline 例外,其余七条(idDuplicate/authorityDuplicate/idrefDangling/supersedesUnpaired/supersedesSelf/supersededButAlive/lineArchivedRef)结构上不可豁免且有 selftest 钉清单;③**关线墓碑教义**:归档线实体改 `status: archived` 留在 `lines/` 原地,不 git mv 不删除;④权威唯一键 = slugify(line)+scope **精确相等**,组合不变量只对状态机既知词汇说话 | 阶段 3 定案。①存量仓没声明 `supersedes`/`authoritative` 就零新红——门与悬崖不同时存在,F-001 无从违反,升版即死配置;②接任者是谁机器派生不出(A.supersedes=B 时机器虽能推 B 的 supersededBy,但替 B 落笔=机器替人裁决 A 的取代主张成立,方向性判断属人 ⇒ D-018 归 baseline);其余全是**自相矛盾的声明**而非缺失的元数据,矛盾没有「立账挂起」一说;③老 snapshot 文档的 `line` 引用与 slug 撞名保护都靠原地实体,`deprecatedStatuses` 不含 `archived` 恰是承重墙;④「整线 ⊇ 某 scope」的包含语义 §7.2 未许诺,机器不猜 scope 语义,自定义状态的生死同样不猜 | D-024 |
| **阶段 4 边界四则**:①schema v5 只加 `index.mode`/`outDir` 两可选键,缺省 invariant 存量零影响,MIGRATIONS[4→5] 不替用户发明键;②**closeout 台账由工具改写**(旧 todo 行改指新靶点)——D-023「谁拥有表谁定读法」的延伸:契约迁移时**工具拥有的台账随迁**,用户手建实体仍不碰;③todo 退役横幅 flip 当次**无条件**插,与「有没有分节被自动迁走」无关;④STATUS 嵌入分片正文时剥 H1、其余标题降两级 | 阶段 4 定案。①改档是数据布局迁移不是配置开关(R3-3),开关归用户、布局归对账,一次升版覆盖上下半;②不改写的话 flip 之日全部历史 closeout 同日硬红且按 D-013 不可 baseline——门亲手制造自己修不了的违规(阶段 1 已有同型教训);③dogfood 实测暴露:本仓 todo 三分节全是孤儿,原实现不插横幅 ⇒ 旧状态源看着仍现役而契约已换地方;④dogfood 首次真产物实测暴露:分片 `## 待办` 与 per-line `## <线>` 同级,大纲当场断 | D-025 |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
