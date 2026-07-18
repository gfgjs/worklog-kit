---
id: 2026-07-18-引擎CommonMark保真与行尾一致
status: archived
type: line
line: 引擎CommonMark保真与行尾一致
created: 2026-07-18
---

# 引擎CommonMark保真与行尾一致

> 📦 已归档(2026-07-18,用户批「归档」):三项全落 + 收口(closeout `d9dd965`,disposition 均=`code`),台账见 `docs/worklogs/2026-07-18-引擎CommonMark保真与行尾一致/`,滚动状态见 `docs/status/引擎CommonMark保真与行尾一致.md`(已冻 snapshot)。墓碑留原地(关线=实体改 status: archived)。

第六轮 tier B 收口遗留三项的收敛线(2026-07-18 用户裁「采纳建议,现在开线」):承接 parseTables/正文变换的 CommonMark 保真缺口与 doctor 行尾尺不一。三项——① 正文变换 fence-blind(承第六轮 F-001,disposition=todo:rebaseOneLevelDeeper 改围栏内示例链接、build-index 标题降级动围栏内 `#` 行);② splitRow 反斜杠转义管道(`src/lib/frontmatter.mjs` 字符级切,不认 CommonMark 反斜杠转义,门读表遇格内字面竖线错位);③ doctor eolMismatches 行尾尺(`src/doctor.mjs` 一文件两把尺,切换行不容 CRLF)。每项独立 fixture、各一 commit(承 tier B 纪律);排序按风险递增 ③ 暖场 → ① 复用 B8 → ② splitRow 压轴。
