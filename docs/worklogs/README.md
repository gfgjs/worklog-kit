---
id: 2026-07-13-worklogs-README
status: active
type: index
line: 文档治理
created: 2026-07-13
---

# worklogs — 长任务工作记忆归档

存放本仓**已收口长任务**的三件套(`task_plan`/`findings`/`progress`)+ `closeout.md`。
收口契约由 `worklog check` 机械校验:声明候选全覆盖不重不漏、disposition 枚举、target 验存或冻结引用、verified=yes。

## 已归档任务

- 建仓与 v0.3 基线 — 2026-07-16 — 建独立私有仓 + 三轮 28 项裁决回写出 v0.3 + P1 MVP 全交付(三门 + skill + CLI/init + 模板,37 selftest/e2e/pack 冒烟/真实 agent 会话实测全绿);P1.5 验证测出三指标 2/3 结构性无效,据此裁 P2 全量 go(D-001) — `2026-07-16-建仓与v0.3基线/`
- P2 生成式索引与契约收敛 — 2026-07-16 — §12 P2 行判据 4/4 全达(生成器幂等 / 结构负例可拦 / artifact 发布可复现 / 升档迁移 e2e);G0 契约硬化 + 七阶段单日走完,selftest 37 例/4 套 → 442 例/8 套,schema v1→v5 门梯同批,本仓 dogfood 真升 generated 档;发布管线 = self-hosted repro workflow,四环境产物 sha256 逐字节一致;施工期定案 D-018~D-025 升方案 §21 — `2026-07-16-P2生成式索引与契约收敛/`
- P3 验证场与并发基线 — 2026-07-17 — 「两人并发 PR」判据由不可测翻模拟可测(D-026:Scrollery 本地 bare 模拟场,零远程)并当轮出数:B 并入 7/7 全冲突直证 R2-C7 且更宽(冲突面=共享三件套整体),独名对照消 add/add 整类,真人流程遵从 2/3(agent 2/2);附带 brownfield 真仓首跑通(351 红 → 双门绿)+ 工具缺陷候选 6 条 — `2026-07-17-P3验证场与并发基线/`
- P3多人软肋施工 — 2026-07-17 — 多人软肋全量落地:events 档写模型 E1~E6 + worklog team/closeout 命令 + 任务名唯一门/CODEOWNERS/按 profile CI;三指标转实践中测 — `2026-07-17-P3多人软肋施工/`
- P4分发面起手 — 2026-07-17 — F-004/F-005 清偿:upgrade 外科编辑保注释(等价断言+兜底);模板/skill 副本 manifest 哈希基线 + doctor 五态 + upgrade 对账;selftest 9→11 套 — `2026-07-17-P4分发面起手/`
- token税优化-skill指引与doctor行数护栏 — 2026-07-18 — SKILL.md 瘦身 -29% + doctor 三件套行数软护栏(第 12 套);F-021 读税砍体积经验进 experience — `2026-07-18-token税优化-skill指引与doctor行数护栏/`
- P5转公开起手-fresh-export断档与scrollery收编 — 2026-07-18 — 转公开走 fresh-export 断历史(no-leak 值合成化 + 终检零命中 98 文件)+ scrollery 正式迁移(枚举 ASCII 化 160 篇 / 54 线实体播种 / 双门绿 300 文档)+ 双源净化同步机制落地(sync-public.mjs 词表硬门 + runbook 七纪律);远端四步(私史归档/建公开仓/转公开/alpha.1)用户实证;F-020 修同型全部落点经验入 experience — `2026-07-18-P5转公开起手-fresh-export断档与scrollery收编/`
- doctor完善-EOL体检与主流程selftest — 2026-07-18 — doctor 第 6 项 EOL 体检(F-019:钉 LF + i/w 一致两层,信息级)+ main() 主流程 selftest(F-018,套件 6→30 断言)+ F-020 同型落点四处同步 — `2026-07-18-doctor完善-EOL体检与主流程selftest/`
- 第六轮tierB引擎修缮 — 2026-07-18 — 三批 15 项引擎缺陷单日全落地:parseTables CommonMark 分隔行 + makeFenceSkipper 围栏感知(五处)+ build-index 孤儿产物清理 + upgrade 回滚撤新建目录 + loadBaseline 坏账 brownfield exit 2 + todayLocal 本地日统一 + closeout 保行尾登记 + schema const/engines≥20/模板 raw URL;新增第 13 套 lib-core,F-001 正文变换 fence-blind 留后续引擎轮 — `2026-07-18-第六轮tierB引擎修缮/`
- 引擎CommonMark保真与行尾一致 — 2026-07-18 — 第六轮 tier B 遗留三项收敛:doctor eol 尺一致(F-024)+ 正文变换 fence-blind(F-001)+ splitRow 转义感知(F-023),各独立 fixture 一 commit,13 套 selftest + 双门绿 — `2026-07-18-引擎CommonMark保真与行尾一致/`
