---
id: 2026-07-18-status-第六轮tierB引擎修缮
status: snapshot
type: rolling-status
line: 第六轮tierB引擎修缮
created: 2026-07-18
---

# 第六轮tierB引擎修缮 · 滚动状态

- 现况:**已收口**(2026-07-18,用户批;开线当日三批 15 项全落地)。批 1 B1–B7 七项 + 第 13 套 lib-core(`84bf611`);批 2 B8 围栏感知/B9 孤儿产物清理/B10 回滚 + applyChanges 失败路径直测(`2f34cb3`/`d06b725`/`1655038`);批 3 B11a 坏账 brownfield exit 2/B12a todayLocal 本地日(瞬时戳保 UTC 例外)/B13 保行尾登记/B14a engines ≥20/B15a 模板 $schema raw URL(`cd6bf13`)。13 套 selftest + 双门 + doctor 全绿;台账收尾 `8a36523`,公仓快照 `fd06fe0`(终检 122 文件零命中)。台账见 `docs/worklogs/2026-07-18-第六轮tierB引擎修缮/`。

> 本线遗留三项已开线迁入 [引擎CommonMark保真与行尾一致](引擎CommonMark保真与行尾一致.md) 并于 **2026-07-18 全数收口**(用户批「批准都做」):①F-001 正文变换 fence-blind(`6243f89`);②splitRow 反斜杠转义管道(F-023,`073b521`);③doctor eolMismatches 行尾尺(F-024,`f9038ac`)。三项各独立 fixture 一 commit(承 tier B 纪律),disposition 均=`code` 冻结对应 commit;台账见 `docs/worklogs/2026-07-18-引擎CommonMark保真与行尾一致/`。下列三节留作**处置定位锚**(第六轮 F-001 收口 disposition=todo 的靶点),现况均转「已执行」。

## 待办 · 正文变换 fence-blind(F-001)

- **✅ 已执行**(引擎CommonMark保真与行尾一致线,`6243f89`,disposition=`code`):三处逐行正文变换补围栏感知——`rebaseOneLevelDeeper` 逐行跳围栏、build-index 抽 `demoteHeadings` 助手供分片嵌入/timeline 复用,围栏内示例链接/`#` 行不再被改。fixture ×3;13 套 selftest + 双门绿。
- 原裁定(第六轮 disposition=`todo`):B8 收的是**节界扫描**面;两处**正文变换**仍 fence-blind,当轮定噪声级、非门判定面延后,后续引擎轮承接——本线即承接执行者。

## 待办 · 表格 splitRow `\|` 转义(与 F-001 同族,后续引擎轮)

- **✅ 已执行**(引擎CommonMark保真与行尾一致线,`073b521`,disposition=`code`):`splitRow` 提为模块级 export + 转义感知切分(逐字扫描数前导反斜杠奇偶,认转义竖线为字面竖线),只反转义转义竖线一种、其余反斜杠序列逐字留;libcore ×6 + check-docs 门层 dogfood。经验实测旧切断 8 列、verified 误读,新切 7 列、verified 正读。**「门读表格内禁写字面竖线」的绕过纪律就此解除。**
- 原发现(收口迁档暴露):`splitRow`(`src/lib/frontmatter.mjs`)`split('|')` 字符级切分,不认 CommonMark 反斜杠转义。格内 `\|`(合法字面竖线)被当列界,断出幻影列;门读表(closeout 处置表 / findings / task_plan 声明表)遇之即错位,把碎片当候选 ID 报红。仅 `docs/worklogs/` 罩候选校验,故 planning 期静默、迁档才触发。本轮以「改写去表内字面竖线」绕过(精确正则字面量在代码本体 / progress / 收口阶段结论散文逐字存续,决策表是摘要不失真)。与 F-001 同族(parseTables CommonMark 不全);**2026-07-18 用户裁折进后续引擎轮,连 F-001 一并修**。真修需字符扫描器逐字追转义态(负回顾 `(?<!\\)` 对 `\\|` 会误判,须数前导反斜杠奇偶)+ 独立 fixture。

## 待办 · doctor eolMismatches 行尾尺不一(信息级)

- **✅ 已执行**(引擎CommonMark保真与行尾一致线,`f9038ac`,disposition=`code`):切行正则改容 CRLF,与同文件 .gitattributes 解析同尺;selftest 加 CRLF 行终止回归锁(旧码报零、新码报两件,断言真咬)。13 套 selftest + 双门绿。
- 原发现:`eolMismatches`(`src/doctor.mjs:61`)按 `output.split('\n')` 切 `git ls-files --eol` 输出;**同文件 `:43`**(.gitattributes 解析)已用 `/\r?\n/`——一文件两把行尾尺。`git ls-files --eol` 恒发 LF 且该体检(F-019 层 2)信息级不计退出码,故**不触发**;记为一致性缺口(今日 3-reviewer 施工 review 出)。修=一字换 `split(/\r?\n/)` + CRLF 输入 fixture(现行 `\n` 切遇 CRLF 行整条正则失配被跳,是静默漏报非串列)。**2026-07-18 用户裁并入后续引擎轮**,与 F-001/splitRow 同批。
