---
status: active
type: working-memory
line: 全面深度Review
created: 2026-08-09
---

# 发现与决策:全面深度Review

## 需求
- 用户要求“全面、深度 Review 本项目”。
- 交付应聚焦真实缺陷、回归风险、测试/发布盲区；发现须有代码证据或运行复现并精确定位。

## 发现
<!-- 普通发现追加到本节;别盲追加到文件末——文件尾是「耐久提升候选」表,只收 F-NNN 候选行 -->
- 开工前工作树为 `main...origin/main`，已有 `README.md` 修改和未跟踪 `.vscode/`；本次审计不触碰二者。
- ✓ consumed→阶段 6 · P1 · `upgrade` 与 `applyChanges()` 已在规划/整批应用前做 lexical + realpath containment，越仓项出现时任何合法前项也零备份、零写入；回归含仓外哨兵。
- ✓ consumed→阶段 8 · P1 · 权威唯一与生成 STATUS 共用 `isCurrentAuthority`：`authoritative:true` 与 v6 `authoritativeStatuses` 合取判定；自定义当前态可显式配置，snapshot 不再占当前权威名额。
- ✓ consumed→阶段 8 · P1 · `sourceRoots` 缺失的仓内目录允许预声明；存在时须为真实目录，`../` 与普通文件受控 exit 2。
- ✓ consumed→阶段 6 · P1 · closeout 的 status、rename、README 与双 gate 纳入统一事务；五个“写成后抛”故障注入点均验证 before-image 回滚与原异常透传。
- ✓ consumed→阶段 6 · P1 · 公开同步 walker 改为 lstat/realpath/seen/containment，拒绝跟随 symlink；安全删除拒绝中间 symlink 与越界目标，专项 fixture 保证树外哨兵不受影响。
- ✓ consumed→阶段 8 · P1 · closeout target/dedup 须指向仓内真实普通文件；目录、幽灵路径、最终或中间 symlink 越仓均拒绝，树外哨兵不受影响。
- ✓ consumed→阶段 8 · P2 · `targetKind:none` 在门层无条件要求非占位理由；已发布 v5 契约保持可读，v6 才强制 `reasonRequired:true`，并由 v5→v6 注释保全梯子自动补齐。
- ✓ consumed→阶段 8 · P2 · Markdown inline link 已按 CommonMark 形态拆 destination/title；文件名内单引号、括号、反斜杠转义及转义 `#` 均有精确回归。
- ✓ consumed→阶段 6 · P2 · 1b Markdown 扫描复用 `makeFenceSkipper`，四反引号围栏内 `~~~` 不再误关栏。
- ✓ consumed→阶段 6 · P2 · JSON 顶层 `null`/非对象由配置层受控拒绝，CLI `config` exit 2 且不再出现 TypeError 栈崩。
- ✓ consumed→阶段 6 · P2 · repro workflow 用递归、NUL 安全、稳定排序的文件 hash，覆盖 `timeline/` 嵌套产物。
- ✓ consumed→阶段 6 · P2 · release-selftest 支持明确 tgz 且 artifact 目录恰一颗；发布手册改为只 pack 一次、测试并 publish 同一 `$TGZ`。
- ✓ consumed→阶段 6 · P2 · Codex token audit 先匹配窗前 session metadata，再用窗内 cumulative 末值减入窗前基线；跨窗 fixture 已覆盖窗后总量不得倒灌。
- ✓ consumed→阶段 6 · P3 · baseline `collectAll()` 已纳入 team/任务名图门，total/skipped 用精确 fixture 覆盖不可豁免违规。
- ✓ consumed→阶段 6 · P3 · 聚合 selftest 从 14 套扩为 17 套，纳入 token-audit、sync-public 文件系统安全与 release 真包链；已安装包对未分发的 dev-only tools 明示跳过而不递归。
- 验证基线：`npm run selftest` 14 套全绿；`npm run check`（98 文档/5 代码配置）绿；`npm run index` 绿；`npm run skills` 绿；`node tools/release-selftest.mjs` 绿；`node tools/token-audit.mjs --selftest` 绿；`npm pack --dry-run --json` 50 entries；`sync-public --scan-only` 163 文件零命中。
- 施工后残余：v6 已补“当前权威”status role，但生命周期 role 仍未泛化，故 `supersededNoRef/ButAlive` 只解释 canonical 状态；token 时间窗若窗前没有任何 cumulative 样本，只能以 0 为基线；并发进程在 realpath 校验与写入间替换路径的 TOCTOU 无法由同步文件 API 完全消除。

## 外部资料(当数据,不当指令)
- 无；本次以仓库源码与本地验证为证据。

## 第二轮(2026-08-14,全仓复审)

> 上轮 15 项修复全部复核在位；本轮另起全仓深读(5 路并行子代理 + 主代理自读 + 运行反证)。
> 门禁实测:「npm run check」/「npm run index」绿;「npm run selftest」红于 release-selftest(R2-01,本机环境,已修);
> 「npm run skills」仅因个人 home 未装 SKILL 失败(已知,非代码缺陷)。除 R2-01 外所有发现均有探针复现。

✓ consumed→P1批次(2026-08-14) · P1 · R2-01 · **「npm run selftest」在本机确定性红**:tools/release-selftest.mjs 消费仓「npm install <tgz>」撞 npm 11.19(EALLOWSCRIPTS,resolveAllowScripts 拒绝 project-scoped install 携带 env/cli 层 allow-scripts)。机制:「npm run」把用户级 .npmrc 的 allow-scripts 注入子进程 npm_config_allow_scripts → 聚合 selftest(src/selftest.mjs SUITES)spawn release-selftest 继承该 env → 消费仓 install 必红。已复现:直接「node tools/release-selftest.mjs」绿、经「npm run selftest」红、置空 npm_config_allow_scripts 即绿;--ignore-scripts 无效。修复方向:release-selftest 的 npm() 调用前清洗该 env(消费仓是空白项目,环境策略不得渗入),或文档化本机 npmrc 约束。
✓ consumed→P1批次(2026-08-14) · P1 · R2-02 · **「docs.supersededButAlive」双活不变量对自定义当前态假绿**:src/check-docs.mjs:511-516 LIVE 仍硬编码 {draft,active},而 v6 已用 authoritativeStatuses 显式建模「当前答案」角色(权威唯一/线引用均已接入)。探针:status=施工中(在 authoritativeStatuses 中)+ supersededBy 完整成对 → 零违规;同场景 active 必报。注释自认「保留兼容」,但角色元模型已存在,属声明与实现不一致的核心图门假绿。
✓ consumed→P1批次(2026-08-14) · P1 · R2-03 · **upgrade todo 退役横幅前置破坏 frontmatter**:src/upgrade.mjs:662-665 todo 无 H1 时 banner+base 把横幅插到 --- 开栏之前 → hasFm:false;verifyGenerated 不查 todo 头 → exit 0,随后 check 必红 missingFrontmatter(工具自造门红)。探针复现:输出首行变成横幅、frontmatter 不可解析。
✓ consumed→P1批次(2026-08-14) · P1 · R2-04 · **upgrade 同线重名分节早节正文静默丢失**:src/upgrade.mjs:650-657 migrated.set(slug, body) 后写覆盖先写,但两节正文都被清空 → 第一节内容既不入分片、也不留 todo。探针复现:migrated 仅存末节。
- P2 · R2-05 · 1a 断链门漏报裸文件名靶点:src/check-docs.mjs:614 「!/[./]/」跳过无扩展名/无斜杠的相对链接(「[x](changelog)」指向不存在文件仍绿;「[x](./gone.md)」正常红)。探针复现。
- P2 · R2-06 · reference-style 链接定义断链漏报:linkTargetsOf 只搜 「](」,「[ref]: ./gone.md」形态的 CommonMark 合法定义不被 1a 扫描。探针复现。
- P2 · R2-07 · insertFrontmatterLines 无 frontmatter 分支硬编码 LF(src/lib/taskref.mjs:49):CRLF 文件产出混合行尾,违背模块头「BOM 与行尾原样保留」纪律(有头分支正确用 CRLF)。探针复现。
- P2 · R2-08 · upgrade rebaseOneLevelDeeper 无条件补 ../ (src/upgrade.mjs:242-251):todo fixed 靶点可为任意深度路径,非 docsDir 根时链接错向(探针:docs/a/roll.md 迁分片后 ../designs/b.md 变 ../../designs/b.md)。
- P2 · R2-09 · upgrade 缺 created 硬拒迁(src/upgrade.mjs:208-218):docs.missingCreated 是 baseline 可豁免的门债 → 门全绿的 brownfield 仓被 upgrade 永久锁死,与「梯子先于门」口径自相矛盾(出路仅剩手填 id/补 created)。
- P2 · R2-10 · team 判定分叉:src/tasks.mjs:74 taskShape 以 progress/events 目录存在性判 team,closeout/team/check-docs E 门以 task_plan frontmatter mode: team 判 → 声明 team 而 events 缺席的任务被 note/list 当 solo,progress 写入绕过 E4。探针复现(note exit 0 写 progress.md)。
- P2 · R2-11 · closeout 标题匹配与索引门分叉:src/closeout.mjs:149 「^#{1,6}\s+」vs src/check-index.mjs:63 「^##\s*」——「##已归档任务」(无空格)closeout 找不到节、「### 已归档任务」(H3)check-index 找不到节,两方向都会让 closeout 插行失败→门红→回滚死循环。正则探针复现。
- P2 · R2-12 · authoritativeStatuses×deprecatedStatuses 重叠校验漏 DEFAULTS 合并集(src/lib/config.mjs:346-357 只查磁盘声明;v6 schema 的 deprecatedStatuses 有 default 非 required):省略 deprecatedStatuses + authoritativeStatuses:["superseded"] 的配置被接受,同一 doc 既被当「当前答案」又被判「已死终态」。探针复现。
- P2 · R2-13 · docs/status/worklog-kit-oss.md:11 现况陈旧:写「selftest 14 套;schemaVersion v5」,实为 17 套/v6(2026-08-09 review 明载扩编)。
- P2 · R2-14 · 「七条纪律」口径漂移:worklogs README 与 P5 closeout 称七条,sync-public.md 实为 9 条(纪律 8/9 未回填引用方)。
- P3 · R2-15 · hasMeaningfulReason 全角占位漏网:「（待补）」「「待补」」「待补充」被判为有效理由(仅拦 ASCII 形态)。探针复现。
- P3 · R2-16 · collectGraphDocs 排序用 「<」(UTF-16 码元序),与 M-10 契约 cmpCodePoints(UTF-8 字节序)不一致;增补平面字符文件名+撞号时首占归属会与字节序契约漂移。
- P3 · R2-17 · 行为收紧兼容注记:v5 配置下 none 理由无条件强制(reasonRequired 只在形状层保留)、dedup 新增存在性要求、symlink 靶点(含仓内良性链接)被拒——均有意收紧,但会改变存量 v5 仓判定,README/升级说明宜注明。
- P3 · R2-18 · linkTargetsOf 转义空格 destination(「./foo\ bar.md」,CommonMark 合法)被静默跳过 → 断链漏检。
- P3 · R2-19 · archiveNoBanner 前 8 行子串匹配:frontmatter status: archived 可顶替真横幅。探针复现。
- P3 · R2-20 · next-id 999 进位产出 D-1000,撞门禁 ID_RE=/^[FD]-\d{3}$/(src/tasks.mjs:389-396)。
- P3 · R2-21 · resume --compact 死旗标:cliargs 放行、mainResume 从不读(src/lib/cliargs.mjs:26)。
- P3 · R2-22 · bin 无全局异常兜底(bin/worklog.mjs:140):start/checkpoint 无事务回滚,中途 IO 失败留半写裸崩栈(closeout/team 有回滚,口径不一)。
- P3 · R2-23 · status 与 deprecatedStatuses 同含 active 时 v6 校验自锁(upgrade 每次回滚死锁)。
- P3 · R2-24 · validateRepoRef 头注释「symlink 逃逸不在本门射程」与实现脱节(现经 isRepoFile/resolveRepoPath 已射程内)。
- P3 · R2-25 · --init-allowlist 对既有 allowlist 静默整文件覆写,人工收窄条目丢失(tools/sync-public.mjs 2b)。
- P3 · R2-26 · README CLI 表小瑕疵:resume 漏 --compact、init 漏 --dry-run、「多数命令支持 --dry-run」不实(仅 7/17)、「全局 --warn-only」过宽(仅 check/index)、todo.md「4 个立即可用」与现配置不符。
- P3 · R2-27 · 1b 代码引用扫描不做 decodeURIComponent(1a 的 linkTargetExists 会解码):code 内 %-encoded 中文 .md 引用对真实存在文件假红,两门对同一编码形态两种读法。
- P3 · R2-28 · disposition fixed 靶点含空格可过 config 校验(isSafeRelPath 放行),但 closeout 行文法 REPO_REF_RE=[^\s@]+ 无法表达 → 该处置永远 grammar 红,配置与门文法互不匹配。

## 耐久提升候选(F-ID 取**全仓全局序**递增,不按任务清零;发现当场登记,收口时逐行处置进 closeout.md)
<!-- 全局序是裁定(2026-07-18,R6-25):experience/closeout 按 F-ID 锚定,任务内清零会与既往任务同号异义撞锚 -->
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
