---
status: snapshot
type: working-memory
line: 引擎CommonMark保真与行尾一致
created: 2026-07-18
---

# 任务计划:引擎CommonMark保真与行尾一致

## 目标
收敛第六轮 tier B 遗留三项:parseTables/正文变换的 CommonMark 保真 + doctor 行尾尺一致。每项独立 fixture、各一 commit(承 tier B 纪律),不夹带无关改动。

## 当前阶段
三阶段全落(F-024 doctor eol + F-001 fence-blind + F-023 splitRow 转义),私仓各单 commit;13 套 selftest + 双门每 commit exit 0。待收口(closeout)。

## 阶段

### 阶段 1:doctor eolMismatches 行尾尺(F-024,暖场)
- [x] `src/doctor.mjs` eolMismatches 的 `output.split('\n')` 改 `split(/\r?\n/)`,与同文件 .gitattributes 解析(`:43`)同尺
- [x] fixture:CRLF 行终止的 `git ls-files --eol` 输出仍解析出不一致项(现行 `\n` 切遇 CRLF 残 `\r`,行正则 `$` 失配整条被跳=静默漏报,非串列)。selftest 加两断言:CRLF 行终止仍报两件 + 行末 `\r` 不残入 path
- **状态:** done

### 阶段 2:正文变换 fence-blind(F-001,复用 B8)
- [x] `rebaseOneLevelDeeper`(todo 迁档链接改写)逐行 + `makeFenceSkipper`,围栏内示例链接原样输出;单格 authDoc(无换行)行为不变
- [x] build-index 分片嵌入(demote-2)/timeline(demote-1)起 `demoteHeadings`(内部 `makeFenceSkipper`),围栏内 `#` 行不降级
- [x] fixture ×3:e2e todo 迁移围栏内 `](../foo.md)` → 逐字不变(非围栏 `](designs/a.md)` 仍 rebase);build-index 分片围栏 `## 例标题` → 不降级(真 `## 待办` 仍降);timeline 事件围栏 shell `# 注释` → 不降级(真 `## 细节` 仍降)
- **状态:** done(私仓单 commit;13 套 selftest + 双门绿。分片 demote 尺是 `#{2,4}`,故分片 fixture 用围栏 `##`(单 `#` 本就非候选);timeline 尺 `#{1,5}` 才咬单 `#` shell 注释)

### 阶段 3:splitRow 反斜杠转义(F-023,压轴)
- [x] `src/lib/frontmatter.mjs` splitRow 提为模块级 export + 转义感知切分器:逐字扫描,竖线前**连续**反斜杠奇数=转义不切/偶数(含 0)=真分隔;切完只把 `\|` 反转义为 `|` 一种,其余反斜杠序列(`\s`/`\d`/`\\`)逐字留;首/尾结构竖线空串剥掉,真尾随空列保形
- [x] fixture ×6(libcore):① 七列决策表回归锁(格含 `\|` 不断列、verified 仍读 yes);② code span 字面竖线不错位;③ 正则字面量只反转义 `\|`、`\s`/`\d` 逐字留;④ 尾随空列保形;⑤ 偶数反斜杠 `\\` 前 `|` 是真列界且 `\\` 逐字留;⑥ 无转义普通行切分不变
- [x] 全半径验:门读表(closeout 处置表/findings/task_plan 声明表)全走 parseTables 同一 splitRow;13 套 selftest + 双门绿;门层 dogfood = check-docs 加 `ok-转义竖线不炸列` 用例(no-promotion naReason 含 `\|`,门按位置解构七列不错位)。经验实测:同一 fixture 旧 split 断 8 列、verified 误读 `b`;新 split 7 列、verified 读 `yes`
- **状态:** done(私仓单 commit;13 套 selftest + 双门 exit 0)

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 排序按风险递增 ③→①→②,splitRow 压轴单独全量验 | 三项依赖零、半径不同;splitRow 独占最大半径(所有门读表),压轴后前两项已绿,引回归时二分定位干净 | |
| splitRow 反转义范围窄化:只转义管道一种,其余反斜杠序列逐字留 | 全 CommonMark 反转义会碰坏格内正则字面量(`\s`/`\d`);门要的是分隔符完整=读数正确,非渲染保真 | |
| F-001 承第六轮原候选号,不重新全局编号 | 第六轮 closeout disposition=todo 已锚 F-001,重编号会孤立该处置引用;splitRow/eol 取新全局号 F-023/F-024(R6-25) | |
| ① fence-blind 复用 B8 makeFenceSkipper,不新造机制 | B8 已产已实战,两处正文变换本已行导向,只需循环前起跳栏器;新造机制=同型第二实现,正是缺陷母题 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
