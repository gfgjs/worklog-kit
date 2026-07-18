---
status: snapshot
type: working-memory
line: 建仓与v0.3基线
created: 2026-07-13
---

# 进度日志:建仓与 v0.3 基线

## 会话:2026-07-13(建仓 + v0.3 回写)
- 做了:git init 建仓;导入 founding 设计(`cd8275a`);28 项裁决红线回写出 v0.3(`7c090e2`,+206/−98);Scrollery 侧副本加横幅移 archive/(Scrollery `418eeb9`);写本三件套。
- 验证:Scrollery `node tools/check_docs.mjs` exit=0(104 文档/425 代码文件)、`node tools/check_docs_index.mjs` exit=0;残留 grep 确认 drift/忘记重生成/索引不新鲜等已退役概念仅存于引号内提及与 §15–§17 历史快照区;`| pending |` 零残留。

## 会话:2026-07-13(P1 MVP 施工 + 远程仓)
- 做了:用户批准准备工作后施工——①一次性校验器 6 项全绿;②`gh` 建**私有**远程仓 `github.com/gfgjs/worklog-kit`(L3),推初始 3 提交;③P1 MVP 五阶段全交付(`accb4bf` 包骨架/lib/i18n → `46fc0b9` check-docs+24 selftest → `cb0fd11` check-index+install-skills+13 selftest → `28cd55a` CLI/init/templates/skill → 本提交 dogfood+CI+README)。
- 关键设计落地:check-index **退役字母登记表**(§4.1);closeout **结构化 disposition**(targetKind 分派,R2-C5);机器面 ASCII 枚举(R3-1);thin-runner + doctor/stale-trio(R2-M3/R3-9);无 AI 收口 runbook(R2-M2);1b `.claude`/`.github` 排除防 skill/ci 示例路径误报。
- 验证(本地,非 CI):三门 selftest 全绿(check 24 / index 6 / skills 7);e2e `init`→`check`→`index` fresh 仓全绿;dogfood 本仓 `check`(6 文档)+`index` 全绿;founding 设计 frontmatter 迁 ASCII 枚举。
- 遗留:推送 P1 提交到远程后看 CI 首跑结果;仓名 Q1 待定案(rename);LICENSE 已补 MIT;发布/转公开待批。
- **CI 首跑=billing 阻断**(非代码):四 job 调度即拒(「account payments failed / spending limit」),worklog-kit 零注册 runner + gfgjs 是 user 非 org(自托管 runner 不可跨仓)。**用户裁 2026-07-13:暂不管 CI**——保留 GitHub-hosted 现状(billing 恢复自动绿),本地 selftest 为证据标准。
- **P1 MVP 里程碑 landed**(本地全绿:37 selftest + e2e + dogfood);P2 属单独 go(设计 L8:P1.5 dogfood 验证后再定 P2 取舍),不自动开工。

## 会话:2026-07-13(P1 打包冒烟测试 + Claude 侧实测触发)
- 做了:①`npm pack` 打 tarball → 独立空白仓 `D:\photoapp\worklog-kit-smoketest`(`npm install` 该 tarball,不 link 源码目录)→ `npx worklog init`/`check`/`index` 全绿,验证 `package.json` `files` 字段无遗漏、thin-runner 拓扑脱离源仓也能独立工作;②用户在该目录另起真实 Claude Code 会话,给一个 7 步天气抓取任务(未点名 skill/三件套字样、未指示收口)——`/planning` skill 主动触发建出三件套,agent **自主走完整个生命周期**:7 步查天气落盘 → 自行判定候选无耐久价值(disposition=no-promotion)→ 自行归档至 `docs/worklogs/`、写 `closeout.md`、登记 `worklogs/README.md` → 按 skill 文档指示的「显式 pathspec」自行 commit(`0dcb7c8`,未 `git add -A`)。
- 验证:打包安装链路(pack→install→init→check→index)5 步命令全部 exit=0;Claude Code 侧主动触发+自主收口是**真实会话行为实测**,非静态校验——补上了此前 e2e 测试没走完的最后一环(源码直跑测不出 npm 打包缺文件,也测不出 skill 在真实 agent 里到底会不会触发、会不会正确收口)。事后独立复核:agent 自主写出的 `closeout.md` 机械校验一次过(`worklog check`/`index` 均 exit=0,未见迭代修正痕迹)——skill 文档对未受专门提示的 agent 也足够自解释。**遗留**:该 commit 只覆盖任务本身产物,`init` stamp 出的骨架(`.claude/`/`.github/`/`.worklogrc.jsonc`/`docs/README.md`/等)仍未提交,是否提交待用户决定。
- 副产品发现:`skills --check`/`doctor` 报本机 `~/.codex/skills/planning/SKILL.md` 与包内通用化新版有字节级漂移(仍是 Scrollery 专属旧版措辞)——与本次冒烟测试范围无关(该检查天生只查本机 home,不查被测项目本身)。用户裁定 2026-07-13:本轮只测 Claude 侧,Codex 侧同步(`worklog skills --force`)暂不处理。

## 会话:2026-07-16(brownfield 取号追问 → P2 迁移悬崖登记)
- 做了:用户连问两轮——①「大型项目 A-Z 工作线号够不够」;②「工具用于旧项目还会触发取号怎么办」。逐条查证后**澄清前提**:工具零取号,`line` 全程自由文本(schema 无此字段 / check-docs 只校验 status+type / init 模板写 `line: 文档治理`)。旧项目的取号触发源在其自身(README 字母表=数据、旧 skill 文本=行为),`install-skills` 覆盖 skill 即断掉唯一执行者。据此登记 F-001 + task_plan 阶段 3(**未启动,待单独 go**——不违 2026-07-13「P2 不自动开工」裁决)。
- 验证:三处事实均查证到行——`schema/worklogrc.schema.json`(`additionalProperties: false`,字段列尽无 line)、`src/check-docs.mjs:176-184`(只取 status/type)、`src/init.mjs:27`(`line: 文档治理`);`grep line src/check-docs.mjs` 全部命中为 JS 变量 `lines`(文件行数组),非 frontmatter 字段。
- 关键发现:**A-Z 容量不是主伤**——真正的病是中心分配(`下一空闲=max+1` 要全局共识),扩位到 AA/A1 只推迟撞车不消除瓶颈;`lines/<slug>` 的价值在免分配 + 撞名左移到 git add/add 合并时刻,容量无限只是副产品。反向风险见 F-001:今日的字母/slug 混存兼容是零校验副产物,P2 引用门上线即成悬崖。
- 遗留:F-001 待收口时按 disposition=design 回写方案 §4.1(把「迁移非配置开关」从索引档位扩到工作线命名空间);Scrollery 存量 A–Q 现状建议「不动」,重命名并入 P2 与引用门同批做。

## 会话:2026-07-16(P1.5 三指标实测 → D-001 P2 全量 go → 收口)
- 做了:①用户问「本项目进度如何」,盘点后我称「P1.5 验证门槛已过」;②用户要决策简报,查 §12 line 400 发现**该断言是错的**——把 P1 的交付证据(pack 冒烟 / agent 实测)当成了 P1.5 的验证证据(三指标 + 一段时间真实治理),当场纠正并实测;③出决策简报(三指标真读数 + 门禁从未通电 + 路线图循环依赖 + 四选项 A/B/C/D,建议 B);④用户裁 **C 全量 go**,理由「建完直接测多人,以免耽误时间」——该理由直接破了简报指出的循环(信号结构上产不出,那就别等信号);⑤F-001/D-001 回写方案(§4.1 item2 加④迁移悬崖块 + 取号澄清引用块;§12 P1.5 行补实测结论;§12 P2 行改全量 go;§0 新增 L10);⑥建 `docs/todo.md` 修死配置并承接遗留;⑦收口归档。
- 验证(实测非估算):`git branch -a` = 仅 main;`git log --merges | wc -l` = **0**;`ls docs/worklogs/` = 仅 README(收口前 closeout 完成率 **0/1**);`ls .git/hooks/` 无活跃 hook;`gh run list` = run `29209040905` **4s failure**(billing);dogfood 时长 2026-07-13→07-16 = **3 天**。收口后 `worklog check`/`index` 全绿。
- 关键决策:**D-001 P2 全量 go**(见 task_plan 决策表 + 方案 L10)。诚实代价已记入 L10:契约零信号冻结,P3 若判形态错须自迁契约。
- 遗留:两条已裁暂缓项(CI billing / Codex skill 漂移)移交 `docs/todo.md`(F-002);F-003 死配置发现同去(`init` 应 stamp todo 靶点)。

## 回顾
- **亮点**:支柱一(两层记忆架构)拿到了**最硬的一类证据**——`npm pack` 装进独立空白仓后,一个未受任何提示的真实 Claude Code 会话主动触发 `/planning`、自主走完 7 步任务全生命周期、自行判定候选无耐久价值(no-promotion)、自行归档登记并按文档指示用显式 pathspec 提交;事后独立复核其 `closeout.md` 机械校验一次过、无迭代修正痕迹。这不是静态校验能产出的证据:源码直跑测不出 npm 打包缺文件,也测不出 skill 在真实 agent 里到底会不会触发。
- **教训(两条,均为本人失误)**:①**把交付证据当成验证证据**——P1 的 pack 冒烟/agent 实测证明「东西建对了」,P1.5 的三指标问的是「东西有用吗」,我据前者宣布后者门槛已过,若非用户要简报会直接把错误结论推进 P2 取舍。②**先答后查**——第一轮答「A-Z 够不够」时若先读 §4.1 就会知道字母早已退役(Q7,2026-07-13),而非把它当开放问题讨论。共性:**结论跑在证据前面**。
- **意外**:①`todo` disposition 是死配置(F-003)——本仓 dogfood 三天、门禁跑了十几次,竟无一次触发,因为**从没有候选用过它**;`fixed` 类靶点缺失在用到之前零信号,这是 `fixed` 与 `docs` 两类失效时机的结构差异。②本仓 dogfood 恰好屏蔽了三支柱里的两个(单人→无多人、无 hook + CI 挂→无强制),**验证覆盖面的盲区是自己造的**,且盲的正是 P2 决策最需要的那面。③路线图的循环依赖(P2 要 P1.5 信号 / P1.5 结构上产不出该信号)在写 §12 时无人察觉——括号里其实写了「结构性产不出」,但没人把它和「据此定 P2 取舍」这句话对撞。
