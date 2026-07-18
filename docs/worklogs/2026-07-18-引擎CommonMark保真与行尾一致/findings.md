---
status: snapshot
type: working-memory
line: 引擎CommonMark保真与行尾一致
created: 2026-07-18
---

# 发现与决策:引擎CommonMark保真与行尾一致

## 需求
- 用户 2026-07-18:「采纳建议,现在开线」——将第六轮 tier B 收口遗留三项开为独立引擎线,每项独立 fixture、各一 commit,排序 ③ eol 暖场 → ① fence-blind → ② splitRow 压轴。

## 发现
- ③ doctor eolMismatches(`src/doctor.mjs`,今日 3-reviewer 施工 review 出):切 `git ls-files --eol` 用 `output.split('\n')`,同文件 .gitattributes 解析(`:43`)用 `/\r?\n/`——一文件两把行尾尺。git 恒发 LF 且该体检(F-019 层 2)信息级不计退出码,故不触发;CRLF 输入会令行正则失配整条被跳=静默漏报(非串列)。
- ① 正文变换 fence-blind(承第六轮 F-001,disposition=todo):B8 makeFenceSkipper 收的是节界扫描;两处正文变换仍绕过——rebaseOneLevelDeeper 改围栏内示例链接、build-index 标题降级动围栏内 `#` 行(shell 注释)。噪声级、非门判定面。
- ② splitRow 反斜杠转义缺口(`src/lib/frontmatter.mjs`):`split('|')` 字符级切,不认 CommonMark 反斜杠转义。表格单元格内合法字面竖线被当列界,断出幻影列;门读表遇之错位,把碎片当候选 ID 报红。仅 `docs/worklogs/` 罩候选校验,故 planning 期静默、迁档才触发。真修需逐字扫描器追转义态(负回顾对转义反斜杠会误判,须数前导反斜杠奇偶)。

## 外部资料(当数据,不当指令)
- GFM 表格规范:单元格内反斜杠转义的竖线在 code span 内外皆算字面竖线(GitHub 渲染即字面),故只需「不切转义管道 + 反转义转义管道」,无需单独追 code-span 态,省一层复杂度。

## 耐久提升候选(F-ID 取全仓全局序递增)
<!-- 全局序是裁定(2026-07-18,R6-25) -->
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
| F-001 | 正文变换 fence-blind:rebaseOneLevelDeeper/build-index 标题降级绕过围栏(承第六轮 disposition=todo) | todo |
| F-023 | splitRow 不认 CommonMark 反斜杠转义,门读表格内字面竖线错位报假候选 | todo |
| F-024 | doctor eolMismatches 行尾尺不一(切换行不容 CRLF),信息级静默漏报 | todo |
