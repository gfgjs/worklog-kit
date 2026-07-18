---
status: snapshot
type: working-memory
line: 建仓与v0.3基线
created: 2026-07-13
---

# 任务计划:建仓与 v0.3 基线

## 目标
把 founding 设计推进到 v0.3 施工基线并落户独立仓(已达成);此后按用户批准推进 P1 MVP 施工。

## 当前阶段
**已收口(2026-07-16)**。P1 MVP landed + P1.5 验证完成 + P2 取舍已裁(D-001:全量 go)。后继 P2 另起三件套。

## 阶段

### 阶段 1:建仓 + 迁移 + v0.3 全量回写
- [x] 建本地私有仓 `D:\photoapp\worklog-kit`(git init -b main)
- [x] 导入 founding 设计(自 Scrollery@44c067a 工作树,含用户 R2-m2/R3-12 裁决手迹)→ `cd8275a`
- [x] 三轮 28 项裁决按红线全量回写正文(§18 台账)→ `7c090e2`
- [x] Scrollery 侧副本移 archive/ 留横幅,门禁双绿 → Scrollery `418eeb9`
- **状态:** completed

### 阶段 2:P1 MVP(纯中文最小闭环)
- [x] check-docs 通用化 + 结构化 closeout 契约(24 selftest)
- [x] check-index(退役字母表)+ install-skills(13 selftest)
- [x] CLI / init / trio+closeout+ci 模板 / skill / 收口 runbook / doctor
- [x] zh catalog 外置、单 profile strict、机器面 ASCII
- [x] dogfood 本仓三门全绿 + CI + README + LICENSE
- [x] 打包冒烟测试:`npm pack`→独立空白仓 install→init/check/index 全绿 + Claude Code 侧 `/planning` 主动触发实测通过(7 步任务)
- [x] ~~远程 CI 首跑绿~~ → **用户裁暂不管 CI**(2026-07-13;billing 阻断非代码),移交 `docs/todo.md` 待办(F-002)
- [x] ~~Codex 侧 skill 副本同步~~ → **用户裁暂缓**(2026-07-13;属本机一致性,不进仓库 CI/R2-M4),移交 `docs/todo.md` 待办(F-002)
- **状态:** completed(本地全绿:37 selftest + e2e + pack 冒烟 + 真实 agent 会话实测;两项未竟均为**用户明裁暂缓**而非未做完,已移交滚动状态源承接)

### 阶段 3:P1.5 dogfood 验证 + P2 取舍裁决
- [x] 三指标实测(合并冲突数 / closeout 完成率 / 绕过次数)→ **2/3 结构性无效**,详见 findings 与方案 §12 P1.5 行
- [x] P2 取舍决策简报(三指标真读数 + 路线图循环依赖 + 四选项)→ 用户裁 **C 全量 go**(D-001)
- [x] F-001/D-001 回写方案 §4.1/§12/§0(L10 新增)
- [x] 本任务收口归档
- **状态:** completed

> **P2 不在本任务内。** 方案 §12 line 406:「每阶段落新仓后,按 `/planning` skill 建三件套跟踪;跨阶段收口走 closeout 门」——P2 是新阶段 = 新三件套。此前一度把 P2 误加为本任务阶段 3,已撤。

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 三轮 28 项全批,修正三条(R2-C7 ①混合写模型 / R2-m2 纯中文 / R3-12 建独立仓) | 用户裁决 2026-07-13;正文即现行,记录在方案 §18 | |
| 本线不入 Scrollery 治理,工作记忆自此在本仓 dogfood | R3-12 裁决的直接推论 | |
| **P2 全量 go,不等 P1.5 信号;建完直接进 P3 多人试点实测** | 用户裁决 2026-07-16。P1.5 三指标 2/3 结构性无效,**等下去不会变好**——非时间问题,是实验设计问题;且 P2 收益(生成式索引解并发)只有多人场景可测,而多人证据被 §12 自己移到 P3 → 路线图**自带循环依赖**。裁决以「建完拿真东西测」破环。诚实代价:契约在零使用信号下冻结,P3 若判形态错须自迁契约——风险已知并接受(C-2 原始关切) | D-001 |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
