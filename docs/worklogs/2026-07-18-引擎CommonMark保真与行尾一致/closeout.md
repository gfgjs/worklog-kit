---
id: 2026-07-18-引擎CommonMark保真与行尾一致-closeout
status: snapshot
type: closeout
line: 引擎CommonMark保真与行尾一致
created: 2026-07-18
---

# 收口处置:引擎CommonMark保真与行尾一致

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。task_plan「关键决策」四行系施工期会话内裁决(候选 ID 列留空),
     不生成耐久候选,不入本表。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-024 | code | repo:src/doctor.mjs@f9038ac | eolMismatches 切行容 CRLF(与 .gitattributes 解析同尺)+ CRLF 回归锁 | new | — | yes |
| F-001 | code | repo:src/upgrade.mjs@6243f89 | rebaseOneLevelDeeper 逐行跳围栏 + build-index demoteHeadings 助手 | new | — | yes |
| F-023 | code | repo:src/lib/frontmatter.mjs@073b521 | splitRow 转义感知切分 + libcore ×6 与门层 dogfood | new | — | yes |

## 处置说明

- **F-024**(disposition=`code`,冻结 `f9038ac`):doctor `eolMismatches` 切 `git ls-files --eol` 输出的换行由只容 LF 改为容 CRLF,与同文件 .gitattributes 解析同尺。selftest 加 CRLF 行终止回归锁——旧切法下每行残尾回车令路径正则整条失配被跳=静默漏报,新 fixture 断言仍报两件且行末回车不残入 path(旧码报零,断言真咬)。信息级体检(不计退出码),修的是一致性缺口。
- **F-001**(disposition=`code`,冻结 `6243f89`):三处逐行正文变换补围栏感知(B8 makeFenceSkipper 此前只收节界扫描家族)。upgrade `rebaseOneLevelDeeper` 改逐行 + 跳围栏(围栏内示例链接不再凭空加 `../`;单格 authDoc 无换行行为不变);build-index 抽 `demoteHeadings` 单一助手,分片嵌入(降两级)与 timeline(降一级)两处标题降级复用(围栏内 `#` 行不降级)。fixture ×3:e2e 迁移围栏链接逐字不变、build 分片/timeline 围栏标题不降级。承第六轮 disposition=`todo` 的执行落地——原 line-status 待办锚(第六轮 status 分片)已由本线执行。
- **F-023**(disposition=`code`,冻结 `073b521`):`splitRow` 提为模块级 export + 转义感知切分——逐字扫描,竖线前连续反斜杠奇数=转义(留作格内容)、偶数=真列界;切完只把转义竖线反转义为字面竖线一种,其余反斜杠序列(正则字面量 `\s`/`\d`、`\\` 等)逐字留(范围窄化保分隔符完整、非渲染保真);首/尾结构竖线空串剥、真尾随空列保形。fixture:libcore ×6(七列决策表回归锁 / code span / 正则字面量窄反转义 / 尾随空列 / 偶数反斜杠 / 无转义不变)+ check-docs 门层 dogfood(no-promotion naReason 含转义竖线,门按位置解构七列不错位)。经验实测:同一含转义竖线 fixture 旧切断 8 列、verified 误读邻格值,新切 7 列、verified 读 yes。**此项落地后,「门读表格内禁写字面竖线」的绕过纪律可解除。**

## 阶段结论

- **阶段 1(F-024 doctor eol,`f9038ac`)**:一字换切行正则消一文件两把尺;CRLF 回归锁真咬(旧码报零、新码报两件)。13 套 selftest + 双门 exit 0。
- **阶段 2(F-001 fence-blind,`6243f89`)**:三处正文变换围栏感知;抽 `demoteHeadings` 单一助手供分片嵌入/timeline 两站点复用,不新造机制(避同型第二实现,正是缺陷母题)。fixture ×3。13 套 selftest + 双门 exit 0。
- **阶段 3(F-023 splitRow 转义,`073b521`,压轴全半径)**:门读表(closeout 处置表 / findings / task_plan 声明表)全走同一 splitRow;libcore ×6 + 门层 dogfood 覆盖。经验实测旧/新切列数 8→7、verified 由误读转正读。13 套 selftest + 双门 exit 0。
- **验证**:三阶段各独立 fixture 一 commit(承 tier B 纪律);每 commit 13 套 selftest + check/index 双门 exit 0。私仓 `f9038ac` / `6243f89` / `073b521`(暖场 `5de8460` sync-public 硬化另属工具线,不入本表)。
- **遗留**:三项全落零遗留。第六轮 tier B status 分片三待办存根同步转「已由本线执行」,现况以本线归档台账为准。
