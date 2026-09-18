---
status: active
type: working-memory
line: 全面深度Review
created: 2026-08-09
---

> **历史档案(2026-09-19 退役)**:本文件属旧文档体系,已退出当前入口,仅为回溯保留。
> 现行文档与规则见 [docs/README](../../README.md);旧命令已不能运行,旧相对链接可能失效。


# 任务计划:全面深度Review

## 目标
在已完成的全面深度 Review 基础上，修复 findings.md 中 15 项已证实缺陷，补齐针对性回归测试，并通过仓库门禁、工具专项自检与发布链验证；保持用户既有 `README.md` 修改和 `.vscode/` 不变。

## 当前阶段
阶段 8:Review 反馈修复（完成）

## 阶段
<!-- 阶段翻 complete 时当场折叠:checklist 压成一行(阶段名 + commit + 一句话结论),
     细节证据在 git/progress,留这里即三处重复 -->

### 阶段 1:仓库定界与架构盘点
- 完成：确认 CLI/模块/配置/模板/工具链边界及开工前工作树状态。
- **状态:** complete

### 阶段 2:核心实现静态审计
- 完成：跟踪参数、配置、文档图、任务/收口/迁移与原子写/回滚控制流。
- **状态:** complete

### 阶段 3:测试、构建与发布链路审计
- 完成：核验 14 套自检、仓门、tgz 消费链、npm pack、CI/repro、公开同步与发布手册。
- **状态:** complete

### 阶段 4:针对性复现与反证
- 完成：最小复现升级越仓、自定义状态假绿、sourceRoots 崩溃/越界、closeout 证据假绿、链接门漏报/误报、null 配置崩溃、嵌套产物 hash 失败。
- **状态:** complete

### 阶段 5:结论整理与交付
- 完成：问题按 P1/P2/P3 排序并保留运行证据；未修改产品源码。
- **状态:** complete

### 阶段 6:分线修复与回归测试
- 完成：三条文件边界施工线已整合，15 项 findings 全部消费并补最小/精确回归测试。
- **状态:** complete

### 阶段 7:全量验证与残余风险复核
- 验收：`npm run selftest`、`npm run check`、`npm run index`、`npm run skills` 全绿。
- 验收：`node tools/release-selftest.mjs`、`node tools/token-audit.mjs --selftest`、公开同步 scan-only 与涉及的专项探针全绿。
- 验收：逐条对照 findings.md 的 15 项问题，确认已修或明确记录无法修复的阻塞与残余风险。
- 完成：17 套聚合 selftest、check/index、真包 full/明确 tgz、token、sync filesystem/scan-only 与 diff/syntax 检查全绿；残余边界已记 findings。
- **状态:** complete

### 阶段 8:Review 反馈修复
- 完成：新增 v6 schema 与 v5→v6 注释保全迁移；修复当前权威角色、repo symlink 逃逸、缺失 source root、Markdown destination 解析及自测数量文档口径。
- 验收：17 套聚合 selftest、仓库 check/index、release 真包 `--full`、sync scan-only 与 diff/syntax 检查全绿。
- **状态:** complete

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 审计不修改产品源码 | 用户要求 Review；除审计工作记忆外保持只读，避免越权修复 | |
| 既有工作树改动视为用户资产 | README.md 与 .vscode/ 在开工前已变更，不纳入本次编辑 | |
| 通过现有自检不等于无问题 | 新发现均位于现有 fixture 未覆盖的配置/路径/异常边界，并以最小探针反证 | |
| 接续阶段改为按 findings 全量施工 | 用户明确要求按计划修改；15 项缺陷均纳入本轮，不静默降级范围 | |
| 三条文件边界并行、主代理统一验收 | 降低并行写冲突，同时让每条修复都接受独立整合审查 | |
| skill 代码验证与个人安装态分开 | `skills --selftest` 属仓库代码门；`npm run skills` 检查用户主目录安装态，当前缺失但不未经授权写入仓外 home | |
| 新不变量须“梯子先于门” | 已发布 v5 保持可读；v6 才强制 none 理由槽位，并由 v5→v6 自动补值 | |
| 当前权威拆成资格与当前性两信号 | `canBeAuthoritative` 管 type 资格，`authoritativeStatuses` 管 status 当前性；门禁与生成器共用函数 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
