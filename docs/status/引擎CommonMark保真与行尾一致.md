---
id: 2026-07-18-status-引擎CommonMark保真与行尾一致
status: snapshot
type: rolling-status
line: 引擎CommonMark保真与行尾一致
created: 2026-07-18
---

# 引擎CommonMark保真与行尾一致 · 滚动状态

- 现况:**已收口**(2026-07-18,用户批「批准都做」);三阶段全落,各独立 fixture 一 commit——③ doctor eol(F-024,`f9038ac`)→ ① 正文变换 fence-blind(F-001,`6243f89`)→ ② splitRow 转义感知(F-023,`073b521`)。每 commit 13 套 selftest + 双门 exit 0;处置表三行均 disposition=`code` 冻结对应 commit。台账见 `docs/worklogs/2026-07-18-引擎CommonMark保真与行尾一致/`。
- 排期(已执行):③ doctor eol 暖场 → ① 正文变换 fence-blind 复用 B8 makeFenceSkipper → ② splitRow 反斜杠转义压轴(门读表全半径,单独全量验)。
- 承接:第六轮 tier B 收口三待办(见 [第六轮 status 分片存根](第六轮tierB引擎修缮.md));F-001 承原候选号(第六轮 disposition=todo,**已由本线执行**),splitRow/eol 取新全局号(R6-25)。
