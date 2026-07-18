---
id: 2026-07-18-第六轮tierB引擎修缮-closeout
status: snapshot
type: closeout
line: 第六轮tierB引擎修缮
created: 2026-07-18
---

# 收口处置:第六轮tierB引擎修缮

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。task_plan「关键决策」四行系施工期会话内裁决(候选 ID 列留空),
     不生成耐久候选,不入本表。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-001 | todo | repo:docs/status/第六轮tierB引擎修缮.md | ## 待办 · 正文变换 fence-blind(F-001) | new | — | yes |

## 处置说明

- **F-001**(disposition=`todo`,落本线 status 分片,D-014 line-status 靶点):B8 `makeFenceSkipper` 收的是**节界扫描**面(parseTables/section/upgrade 四处/closeout 登记节);两处**正文变换**仍 fence-blind——`rebaseOneLevelDeeper` 会改围栏内示例链接、build-index 分片嵌入/timeline 的标题降级会动围栏内 `#` 行(shell 注释等)。裁定 `todo` 而非 `no-promotion` 或即修:它是**真存在**的引擎缺口(非无效项,故不 no-promotion),但为展示/迁移正文噪声级、非门判定面,不值当再开一轮引擎 commit 夹带进本任务(本任务验收已全绿),后续引擎轮承接、被咬到再修。可重开。

## 阶段结论

- **批 1(B1–B7 七项 + 第 13 套,`84bf611`)**:B1 parseTables 分隔行只认 header 后第一行(CommonMark 语义,中途 `| - | - |` 不再静默消失);B2 flipStatusSnapshot 开/收栏 `---` 容尾随空白(与 parseFrontmatter 同宽,R3-6 单一实现不自破);B3 team 遇 task_plan frontmatter 不可插(insertFrontmatterLines 返 null)报人话 exit 2 不裸崩;B4 节标题词尾锚 `(?=\s|$)` 四落点(check-index ×2 / upgrade insertDirRow / closeout),`## 目录职责说明` 不再前缀误中 `目录职责`;B5 init 唯一裸 writeFileSync 换 writeAtomic;B6 relPath 盘根仓多切一字修正;B7 schema v1–v5 加 `const: N`(编辑器面钉版,运行期恒重言,零行为变化)。顺手账:escapeRe 四处重复归并进 frontmatter.mjs、writeAtomic 迁家 fsutil(taskref 转发保旧引用)。新增第 13 套 `lib-core`(frontmatter/taskref/fsutil 纯函数)。
- **批 2(解析器语义,每项独立 fixture/commit)**:B8 `makeFenceSkipper` 单一实现围栏感知(`2f34cb3`,e2e 注入围栏同名标题门绿直证);B9 build-index 落盘后清「带 GENERATED_MARKER 且不在本次构建集」的孤儿 .md、空壳子目录 rmdir、`build.pruned` 逐条报告,无 marker 用户文件不碰(`d06b725`);B10 upgrade 回滚逐级撤新建目录(非递归=携用户内容即留)、`.bak` 留取证、`applyChanges` 导出直测失败路径——补上第六轮 review 点名的「apply 失败专项 fixture」空白(`1655038`)。
- **批 3(裁定落地,`cd6bf13`)**:B11a loadBaseline 显式区分无账/坏账(损坏/形状错/version≠1 同罚),brownfield 档 exit 2 且 `--warn-only` 不降级、strict 不翻门(坏账在 strict 档是不生效文件,红它是误伤);B12a `lib/dates.mjs` `todayLocal` 本地日统一(收口日/created/generatedAt/manifest 戳),瞬时戳(备份后缀/team 事件文件名=跨机器排序键)保 UTC 并钉注释例外;B13 closeout README 登记 `split(/(?<=\n)/)` 各行保行尾(混合行尾不被归一);B14a engines `>=20`(CI 矩阵本就 20/22);B15a 模板 `$schema` 指公开仓 raw URL(upgrade 升版只换文件名段,URL 前缀原样)。
- **验证**:13 套 selftest 全绿(新 lib-core + gate 6 断言 B11 + upgrade B8/B10 fixture + build-index B9 四断言 + e2e B3 负例/B8 围栏/B13 CRLF 附注)+ 双门每 commit exit 0 + 真仓 doctor 冒烟绿。私仓五 fix commit `84bf611`/`2f34cb3`/`d06b725`/`1655038`/`cd6bf13` + 台账 `8a36523`;公仓净化快照 `fd06fe0`(--offline --apply --selftest,终检 122 文件零命中)。
- **遗留**:F-001(见处置表)落本线 status 分片待办,后续引擎轮承接。无其他本任务专属遗留。
