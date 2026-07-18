---
status: snapshot
type: working-memory
line: 第六轮tierB引擎修缮
created: 2026-07-18
---

# 进度:第六轮tierB引擎修缮

## 2026-07-18

- 开线:决策清单 15 项存活(死项 baseline 裸崩已修 15cf7ab 不列),用户裁三批全做。
- 修点拉码定位完毕:frontmatter/taskref/fsutil/team/check-index/gate/upgrade/init/build-index/baseline/closeout/schema×5/package.json/templates。
- 批 1 落地:B1–B7 七项 + lib-core 第 13 套(parseTables 分隔行 ×4、flip 容空白 ×4、insertFrontmatterLines null 契约、relPath 盘根 ×2、schema const×5)+ e2e team 裸崩负例 + check-index 词尾锚负例。13 套 selftest + 双门全绿(`84bf611`)。顺手账:escapeRe 四处重复归并进 frontmatter.mjs;writeAtomic 迁家 fsutil(taskref 转发)。
- 批 2 落地:B8 围栏感知(`2f34cb3`)/ B9 孤儿产物清理(`d06b725`)/ B10 回滚撤新建目录 + applyChanges 失败路径直测(`1655038`),每项独立 fixture、独立 commit。
- 批 3 落地:B11a 坏账 exit 2 / B12a todayLocal 本地日(瞬时戳保 UTC 例外钉注释)/ B13 保行尾登记 / B14a engines 20 / B15a schema raw URL(`cd6bf13`)。13 套 + 双门 + doctor 全绿。
- 登记 F-001:正文变换(rebase 链接改写、标题降级)仍 fence-blind,噪声级,留待办。

## 回顾

- **亮点**:三批 15 项零返工一把绿——每项修法在决策清单阶段已拉码核实过存活与形态,施工只是兑现;applyChanges 失败路径直测补上第六轮 review 点名的「apply 失败专项 fixture」空白。
- **教训**:第 13 套上线时「12 套」散文落点只有 README 两处(cli.usage 走的是不带数字的枚举)——套数写死进散文的落点越少,F-020 税越低;新计数尽量走 `SUITES.length` 动态值。
- **意外**:B7 的 const 在运行期是恒真式(loadConfig 按版本选 schema),纯编辑器面收益——「加了约束」不等于「运行期多了检查」,写进 commit message 防后人误读。
