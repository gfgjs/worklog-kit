---
status: snapshot
type: working-memory
line: token税优化-skill指引与doctor行数护栏
created: 2026-07-17
---

# 任务计划:token税优化-skill指引与doctor行数护栏

## 目标
按 2026-07-17 token 税实测(读侧 60%/写侧 35%,治理面近零),在不伤施工质量前提下压 skill 相关 token 消耗:SKILL.md description 挤水分(保四道闸)、§干活中补「写小/Edit 追加/蒸馏信号」指引、doctor 加三件套行数软护栏(warn 不 fail)。

## 当前阶段
阶段 3:验证与收账(已 commit,待收口)

## 阶段

### 阶段 1:SKILL.md 瘦身与指引
- [x] description 压缩:243 → 173 token(-29%),删营销语与正文细节,四道闸全保留
- [x] §干活中加「写小、写结论」一条:Edit 追加、~200 行蒸馏信号、蒸馏是浓缩不是删账
- **状态:** done

### 阶段 2:doctor 行数护栏
- [x] doctor.mjs:TRIO_WARN_LINES=200 + fatTrio() 纯函数,信息级不计 problems
- [x] zh.json 加 doctor.fatTrio 键
- [x] doctor 首个 selftest(阈值边界 200/201、尾行无换行、非三件套不咬、team 档不咬),注册 SUITES 第 12 套
- **状态:** done

### 阶段 3:验证与收账
- [x] `worklog selftest` 全绿(12 套)+ check/index 门绿 + doctor 冒烟(护栏零误报)
- [x] Codex home 副本 force 同步(祖先版已确认非定制,时间戳备份)
- [x] commit(显式 pathspec)—— `7e0e766`
- **状态:** done

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 行数护栏走 doctor warn,不进 check 硬门 | 硬门逼施工中途压缩,分心且丢证据,与「宁多勿漏」候选纪律冲突;warn 保质量,少省即认 | |
| 否掉 A1(接续跳过 findings) | findings 存约束/结论,跳读踩已记录的坑,一次返工 10k+ 远超省 1.4k;读税大头实为 Edit 前置 Read,A2 治本 | |
| 否掉 D(收口细节移 runbook) | 收口时反读 5.6KB runbook,token 打平或倒亏;收口最高风险,双源漂移不值 | |
| 阈值 200 行 | 实测:正常任务 ≤134 行(kit 仓+scrollery),失控样本 211–309 行(同一 UI 重构任务);200 卡两群之间 | |
| F(撤 Codex home skill)留用户裁 | 能力删除非精简;Codex 零使用可能是没在 Codex 干长活 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
