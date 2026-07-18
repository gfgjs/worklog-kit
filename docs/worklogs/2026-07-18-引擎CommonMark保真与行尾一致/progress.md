---
status: snapshot
type: working-memory
line: 引擎CommonMark保真与行尾一致
created: 2026-07-18
---

# 进度日志:引擎CommonMark保真与行尾一致

<!-- 验证行怎么填(F-005):门禁末行须在全部内容落盘后才跑得出来——先写占位 → 跑门 → 回填真实末行 -->

## 会话:2026-07-18(开线)
- 做了:开线——建 lines 实体 + status 分片 + planning 三件套;三项迁入 task_plan 声明表(F-001 承第六轮原号,splitRow=F-023,eol=F-024,全局序 R6-25);第六轮 status 分片三待办转迁移存根。排期 ③ eol 暖场 → ① fence-blind 复用 B8 → ② splitRow 压轴。
- 验证:`worklog check` 73 文档绿 + `worklog index` 双向一致绿。
- 遗留:施工从阶段 1(doctor eol)接。

## 会话:2026-07-18(阶段 1 · F-024 doctor eol)
- 做了:`src/doctor.mjs` eolMismatches 切行 `output.split('\n')` → `split(/\r?\n/)`,与同文件 `:43`(.gitattributes 解析)同尺;selftest 加 F-024 回归锁——CRLF 行终止的 `git ls-files --eol` 输出建 fixture,断言仍报两件 + 行末 `\r` 不残入 path。旧 `split('\n')` 下该 fixture 报零(路径正则 `(.+)$` 遇残 `\r` 整条失配被跳),故断言真咬。
- 验证:13 套 selftest 全绿(含两条新断言)+ `check`/`index` 双门 exit 0。
- 遗留:阶段 2 fence-blind(复用 B8 makeFenceSkipper)、阶段 3 splitRow 压轴待起。

## 会话:2026-07-18(阶段 2 · F-001 正文变换 fence-blind)
- 做了:三处正文变换补围栏感知。`src/upgrade.mjs` `rebaseOneLevelDeeper` 由整串正则改逐行 + `makeFenceSkipper`,围栏内 `](...)` 不再凭空加 `../`(单格 authDoc 无换行,行为逐字不变)。`src/build-index.mjs` 新增 `demoteHeadings(body, re, repl)` 模块级助手(内部 `makeFenceSkipper`,逐行降级跳围栏),分片嵌入(demote-2 `#{2,4}`)与 timeline(demote-1 `#{1,5}`)两处标题降级改用之;补 `import { makeFenceSkipper }`。
- fixture ×3:① e2e todo 迁移在 `## A. 甲线` 节塞一围栏含 `](../foo.md)` → 断言逐字不变且非围栏 `](designs/a.md)` 仍 rebase;② build-index 分片塞围栏 `## 例标题` → 不降级、真 `## 待办` 仍降(分片尺 `#{2,4}`,故须用 `##` 才是候选);③ timeline 事件塞围栏 shell `# 部署脚本注释` → 不降级、真 `## 细节` 仍降(timeline 尺 `#{1,5}` 才咬单 `#`)。子串陷阱:断言锚 `\n# x`/`\n## x` 行首,避 `### x` 含 `# x` 子串假绿。
- 验证:13 套 selftest 全绿(3 条新 F-001 断言均执行)+ `check`/`index` 双门 exit 0。
- 遗留:阶段 3 splitRow(F-023)压轴——门读表全半径,单独全量验(含真仓 dogfood)。

## 会话:2026-07-18(阶段 3 · F-023 splitRow 反斜杠转义)
- 做了:`src/lib/frontmatter.mjs` splitRow 由 parseTables 内的局部 const 提为模块级 export,并换转义感知切分器——逐字扫描,遇 `|` 数其前**连续**反斜杠:奇数=被转义(留作格内容)、偶数(含 0)=真列界;切完只把 `\|` 反转义为 `|` 一种,其余反斜杠序列(`\s`/`\d`/`\\`)逐字留(范围窄化,保分隔符完整而非渲染保真);首/尾结构竖线空串剥掉,真尾随空列(双尾竖线)保形。
- fixture:libcore 加 ×6(①七列决策表回归锁 ②code span ③正则字面量窄反转义 ④尾随空列 ⑤偶数反斜杠 ⑥无转义不变);check-docs 门层 dogfood 加 `ok-转义竖线不炸列`(no-promotion naReason 含 `\|`,门按位置解构七列不错位)。子串/奇偶陷阱均已避:断言比对精确格值与列数。
- 验证:13 套 selftest 全绿(6 libcore + 1 check-docs dogfood 均执行)+ `check`/`index` 双门 exit 0。经验实测(scratch):同一含 `\|` fixture 旧 split 断 8 列、verified 误读 `b`;新 split 7 列、cell[5]=`理由含 a|b`、verified=`yes`——回归真咬。
- 遗留:三阶段全落,待收口(closeout)。四笔待推私仓 commit 累加两笔(F-001 `6243f89` + F-023 本笔);公仓尚未镜像。

## 回顾(收口时填)
- 亮点:<收口填>
- 教训:<收口填>
- 意外:<收口填>
