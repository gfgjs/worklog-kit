---
status: active
type: working-memory
line: worklog-kit-oss
created: 2026-07-19
---

# 任务计划:worklog-kit token 优化后深度复审

## 目标
复核 2026-07-18 深度 Review 后全部改动，量化 token 收益与质量代价，回归安全、代码、产品、Scrollery 适配及竞品判断，并在 `docs/reviews/` 落一份可执行复审报告。

## 当前阶段
阶段 5 已完成，等待用户验收；未获授权，不执行 planning 收口。

## 阶段

### 阶段 1:冻结基线与改动面
- 旧报告 `409a404` → 当前 `d7a0302` 共 7 提交；私仓工作树起点干净，公仓为单提交 `055c405`，优化未同步/发布。
- **状态:** complete

### 阶段 2:量化 token 与流程收益
- 已复测静态注入、接续读取、三件套体积、doctor 护栏与 Scrollery 实际样本；结论为“长尾减税成立，典型任务未必省”。
- **状态:** complete

### 阶段 3:回归产品、代码、安全与发布面
- 已回归旧 P0/P1、新增实现与发布链；发现 alpha.2 三份内容、固定 heredoc 风险及若干事务/发布测试缺口。
- **状态:** complete

### 阶段 4:复核替代方案与行业位置
- 已以官方资料复核 Spec Kit、DocGuard、OpenSpec、Beads、Backlog.md、Kiro、Vale；核心差异应收窄到候选处置生命周期。
- **状态:** complete

### 阶段 5:形成裁决与报告
- 已形成 590+ 行复审报告，包含量化证据、风险分级、Scrollery ROI、竞品矩阵、profile 与分期路线。
- **状态:** complete

## 关键决策
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 旧报告保留，新建 2026-07-19 复审报告 | 保留前后可比基线，避免覆盖历史判断 | |
| token 结论同时看体积、必读集与施工质量 | 单看文件变短可能把成本转移到检索、返工或遗漏 | |
| 继续使用核心能力，但收窄到 memory-lite/core | Scrollery 有真实长任务与 closeout 收益；全套默认能力和静态热读不划算 | |
| 不以当前 audit 宣称 before/after 收益 | 缺少版本/时间分桶，且 shell write 漏记会污染归因 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
| `.worklog/templates/` 当前为空 | 按 planning skill 查模板 | 使用本产品源码 `templates/` 中同名模板建账，并记录该自举差异 |
| PowerShell `foreach {...} | Format-Table` 解析失败 | 直接把语句块接管道 | 先赋给 `$rows`，再单独管道输出 |
