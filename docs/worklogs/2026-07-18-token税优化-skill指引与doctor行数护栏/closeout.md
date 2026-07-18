---
id: 2026-07-17-token税优化-skill指引与doctor行数护栏-closeout
status: snapshot
type: closeout
line: token税优化-skill指引与doctor行数护栏
created: 2026-07-17
---

# 收口处置:token税优化-skill指引与doctor行数护栏

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行(D-012)。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-021 | experience | repo:docs/experience.md | ## 省 token 砍文件体积而非读次数(F-021) | new | — | yes |
| F-022 | no-promotion | — | — | — | 阈值 200 是单点实测依据(正常 ≤134 / 失控 211–309),属本任务决策留档;后续调阈值须重测,不构成跨任务复用经验 | yes |

## 处置说明

- **F-021** 提升进 `docs/experience.md`(disposition experience,靶点自报):读税大头是 Edit 前置 Read 而非接续读,省 token 的杠杆是文件体积——跨任务复用经验,进经验账按 F-ID 全局序锚定(R6-25)。
- **F-022** 裁 no-promotion:阈值 200 的实测依据留 findings + 本 closeout 档,后续调阈值须重测,单点实测不升 decisions。
- **F 项(撤 Codex home skill)裁定不撤**:task_plan 决策表列「留用户裁」,已由 P5 转公开任务的用户裁定**不撤**(能力删除非精简;Codex 零使用可能只是没在 Codex 干长活)——此裁决回写销账,不再挂起(第六轮 review R6-24)。
- **候选编号校正**:任务内 F-001/F-002 按 R6-25 校正为全仓全局序 F-021/F-022(experience 按 F-ID 全局锚定,任务内清零即同号异义撞锚)。

## 阶段结论

token 税优化 **landed**(2026-07-17,三阶段单线;`7e0e766`)。**阶段 1**:SKILL.md description 243 → 173 token(-29%,四道闸「宁多勿漏 / 写小 / 蒸馏 / 收口须批」全保),§干活中补「写小、Edit 追加、~200 行蒸馏信号、蒸馏是浓缩不是删账」。**阶段 2**:doctor `TRIO_WARN_LINES=200` + `fatTrio()` 纯函数(信息级不计 problems,team 档 `progress/events/` 目录天然不咬),注册 SUITES 第 12 套(阈值边界 200/201、尾行无换行、非三件套不咬、team 档不咬)。**阶段 3**:12 套 selftest 全绿 + 双门 exit 0 + doctor 冒烟零误报;Codex home 副本 force 同步(祖先版非定制,时间戳备份)。

验证:`worklog selftest` 12 套全绿、check/index 双门 exit 0。优化面结论——引擎层税近零(skill 注入 21.6k + CLI 输出 781),读写税大头在提示词/模板层,已由 SKILL.md 瘦身 + 行数护栏承接;接续跳读 findings 经实测判为负优化(否 A1),不做。
