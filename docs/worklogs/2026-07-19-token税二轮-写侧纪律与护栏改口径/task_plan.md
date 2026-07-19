---
status: snapshot
type: working-memory
line: token税二轮-写侧纪律与护栏改口径
created: 2026-07-19
---

# 任务计划:token税二轮-写侧纪律与护栏改口径

## 目标

按 2026-07-19 案例解剖(scrollery 备份施工线三件套 277 行/est 6.8k,行数护栏未咬税已重)+ 联网调研,
把三件套 token 税再砍 ~50%:写侧纪律进 skill(完成即折叠/写指针/消费标记)、模板加前情段与
attachments 约定、doctor 护栏改 est-token 双轨口径 + complete 阶段折叠检测。范围外:单文件轻模式(E)、
`worklog resume`(P2)——记后续轮。

## 当前阶段

阶段 3:验证与收账(已 commit,待用户裁收口)

## 阶段

### 阶段 1:skill 与模板文本层 —— commit 44edebc
- 写侧四纪律 + 读序分层进 SKILL.md,templates 同步前情段/attachments/折叠注释。
- **状态:** complete

### 阶段 2:doctor 护栏改口径 —— commit b2f8812
- est-token 双轨(200 行兜底/单件 4k/合计 6k)+ foldableStages;selftest +11 全绿。
- **状态:** complete

### 阶段 3:验证与收账 —— commit 674d89b/5830312
- selftest 13 套全绿 + 双门绿;scrollery 实样冒烟坐实 est 双轨咬合;Codex home 同步;scrollery 消费仓副本同步留用户下次跑 `worklog upgrade`(跨仓,非本仓收口阻塞项)。
- **状态:** complete

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| est-token 双轨阈值:单件 4k、三件合计 6k;行数 200 保留兜底;全 warn 不 fail | 实测:正常任务 ≤134 行/合计 <4k,案例 6.8k 用户判重(6k 咬到),失控样本单件 5k+;行数口径对中文密集文件失真(案例 119 行=3k) | D-032 |
| findings 消费标记=落地当场写时标,非读时跳过 | 前轮 A1 否决的是接续跳读(猜哪些没用);写时标记是落地当下的确定知识,风险不同 | |
| append 指引走 skill 文本(shell heredoc/`cat >>`),CLI 子命令暂缓 | 追加不需锚点,shell 即零读;内容走 stdin/heredoc 避全角标点参数抽签坑;子命令等残余税量化后再裁 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
| heredoc 盲追加把新段粘到「回顾」节后(段序错) | 模板曾把回顾节放文件尾,挡 append-only 路 | 回顾节移前情段后(模板同步),文件尾恒为最新会话段 |
