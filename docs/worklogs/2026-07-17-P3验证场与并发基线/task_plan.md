---
status: snapshot
type: working-memory
line: P3验证场与并发基线
created: 2026-07-16
---

# 任务计划:P3 验证场与并发基线

## 目标
为 §12 P3 行「两人并发 PR」判据建可测验证场(Scrollery 本地模拟场:bare origin + dev-A/B subagent + dev-C 真人),跑出并发基线读数(冲突数 / closeout 完成率),直证 R2-C7「同任务 progress 文末追加必冲突」;为 P3 施工提供 before 基线。

## 当前阶段
已收口(2026-07-17,用户批;R2 不补,后续实践中测)

## 阶段

### 阶段 1:裁决落地
- [x] D-026 验证场裁决记入方案 §12 P3 行 + 本三件套建立
- **状态:** done

### 阶段 2:模拟场搭建
- [x] bare origin(剥离 GitHub 远程,HEAD=dev)+ setup clone(`c:\workspace\p3-sim\`)
- [x] setup clone 装 worklog-kit:init 自判 brownfield → baseline 立账 → upgrade 迁 v5 → 再立账 → 2 手工修 → 双门绿(225 文档/192 豁免);建共享任务三件套 + 线实体,基线 commit `aebdded` push 到 bare
- [x] dev-a/b/c 三 clone,独立 git 身份(Dev-A/B/C),fresh checkout 门即绿
- **状态:** done

### 阶段 3:并发第一轮(R1)
- [x] 三份任务书(`p3-sim\tasks\dev-{a,b,c}.md`;碰撞点:progress/findings/task_plan 三方同点追加 + A/B 新任务撞名「缩略图缓存调优」+ C 独名对照)
- [x] dev-A/dev-B subagent 并行施工完毕(A `9300246` / B `d391d27`,各自双门绿后推分支)
- [x] dev-C 真人施工完毕(`710cdc8`;**只做了新任务 4 文件,共享三件套三处追加整步跳过**——真人流程遵从 2/3,agent 2/2)
- **状态:** done

### 阶段 4:整合与读数
- [x] A/B 顺序 merge:A 净并(基未动);**B 并入 7/7 文件全冲突**——共享三件套 3×UU(progress/findings/task_plan 各 1 hunk)+ 撞名 4×AA(三件套+线实体);解决 = 联合归并(机械)+ B 任务按真实意图改名「缩略图解码写放大排查」(编辑性,含 frontmatter/标题/线实体 5 处改写);merge `9194116` 双门绿
- [x] dev-C 分支净并(`739207d`,0 冲突——因共享件未动 + 新任务独名;merge message 写早了,「回写共享三件套」不实,以本行为准);三方追加冲突面因此未测得,A∧B 已证该类
- [x] R1 基线读数回写三件套(冲突数 A:0 / B:7 / C:0;closeout 完成率 R1 未测;绕过 0 但标注模拟弱效)
- [x] 可测/不可测边界回写 §12 P3 行(收口时并入:R1 基线读数 + 三指标 + 用户「不补 R2」裁决 + 台账迁址 worklogs)
- **状态:** done

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 验证场 = Scrollery 本地模拟场:本地 bare 当 origin(无任何 GitHub 远程)+ dev-A/B 由互不见上下文的 subagent 驾驶 + dev-C 真人;D-004 第 2 条(内容不进会话)测试期内放宽,第 1 条(不进本仓)/第 3 条(绝不 push 远程)不变 | §12 P3 行自留逃生口「构造双 worktree 模拟前不可测」;Q5/L11 已裁 Scrollery 本地 dev 靶场;fixture-vs-real 教训(F-015/F-017)支持真语料;用户 2026-07-16 明批 | D-026 |
| 绕过次数与真人理解成本标注「模拟不可测」,不计 go/no-go,真第二人时补验 | agent 天生守规矩,绕过读数结构性偏乐观;P1.5 元判据教训(D-001)——空读数与好读数同形必须显式区分 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
