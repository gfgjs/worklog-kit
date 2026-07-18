---
status: snapshot
type: working-memory
line: 第六轮tierB引擎修缮
created: 2026-07-18
---

# 任务计划:第六轮tierB引擎修缮

## 目标
落地第六轮 review §5 tier B 全部 15 项存活缺陷(用户 2026-07-18 裁「批 1/2/3 采纳建议全做」),每项带 fixture 佐证;死项(baseline 报告裸崩)已于 15cf7ab 修复不重做。

## 当前阶段
三阶段全 done;已收口(2026-07-18,用户批)

## 阶段

### 阶段 1:批 1 七项小而确定(一个 commit)
- [x] B1 parseTables:分隔行只认 header 后第一行(CommonMark 语义;数据行 `| - | - |` 不再静默消失)
- [x] B2 flipStatusSnapshot:开/收栏 `---` 容尾随空白(与 parseFrontmatter 同宽,R3-6 单一实现不自破)
- [x] B3 team:task_plan frontmatter 不可插(insertFrontmatterLines 返 null)时报人话 exit 2,不裸崩 TypeError
- [x] B4 节标题词尾锚:check-index ×2 / upgrade insertDirRow / closeout 登记节,`## 目录职责说明` 不再匹配 `目录职责`(F-020 扫全落点);顺手归并四处重复 escapeRe 进 frontmatter.mjs(R3-6)
- [x] B5 init:唯一裸 writeFileSync 换 writeAtomic(writeAtomic 家挪 fsutil,taskref 转发保旧引用)
- [x] B6 relPath:root 以分隔符结尾(盘根仓)时偏移多切一字
- [x] B7 schema v1–v5:schemaVersion 加 `const: N`(编辑器面钉版;运行期 schema 按版本选取,恒重言,零行为变化)
- [x] 新增第 13 套 selftest `lib-core`(frontmatter/taskref/fsutil 纯函数)+ e2e/check-index 负例;README 套数 12→13 两处
- **状态:** done(13 套 selftest + 双门全绿)

### 阶段 2:批 2 解析器语义(每项独立 fixture,commit 各一)
- [x] B8 围栏感知:makeFenceSkipper 单一实现;parseTables 改用之 + section() + upgrade 四处(todo 分节扫描/todoSectionRewrite/parseLetterRegistry/insertDirRow)+ closeout 登记节;fixture = upgrade 围栏假分节 ×3 + check-index 假节 ok 例 + lib-core section 边界 + e2e closeout 注入围栏同名标题门绿直证(`2f34cb3`)
- [x] B9 build-index:落盘(rename 全成)后清「带 GENERATED_MARKER 且不在本次构建集」的 .md,无 marker 用户文件不碰,空壳子目录 rmdir;build.pruned 逐条报告;fixture 四断言(`d06b725`)
- [x] B10 upgrade 回滚:落盘前逐级记录新建目录,回滚深→浅 rmdirSync(非递归=携用户内容即留);`.bak` 留作取证;applyChanges 导出直测失败路径(review 点名空白区);fixture 五断言(`1655038`)
- **状态:** done

### 阶段 3:批 3 裁定落地(`cd6bf13`)
- [x] B11a loadBaseline 显式区分无账/坏账(损坏/形状错/version≠1 同罚);brownfield 门层 exit 2、--warn-only 不降级、strict 不翻门;baseline 报告命令并轨同一实现;gate 六断言
- [x] B12a lib/dates.mjs todayLocal:init/upgrade(对账+manifest)/baseline 并轨本地日,closeout 同源;瞬时戳(备份后缀/team 事件名)保 UTC 并注释钉裁定;lib-core 跨日窗口断言
- [x] B13 closeout README 登记 `split(/(?<=\n)/)` 各行保行尾,登记行行尾随邻行;e2e 混合行尾保形直证
- [x] B14a engines `>=20` + README 运行要求同步(CI 矩阵本就 20/22)
- [x] B15a 模板 `$schema` 指公开仓 raw URL(upgrade 升版只换文件名段,URL 前缀原样)
- **状态:** done(13 套 selftest + 双门 + doctor 全绿)

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| B1 分隔行语义取 CommonMark:只认 header 后第一行 | 处置表是门的读数面,任意位置全 `-`/`:` 行被吞即漏账;CommonMark 里中途的全破折行本就是数据行 | |
| B4 节标题加词尾锚:配置标题后须紧跟空白或行尾 | 配置标题是精确契约;`已归档任务(2026)` 这类粘连后缀不再算命中,门如实报缺节比前缀误中安全 | |
| B12a 只统一「日期戳」为本地日;备份后缀/team 事件文件名等「瞬时戳」保 UTC | 收口日/created 是人读的日历语义(UTC+8 用户 0–8 点跨日);事件文件名是跨机器排序键,UTC 才稳定 | |
| B11 corrupt 与 version 失配同罚 exit 2,且只在 brownfield 档咬 | 账文件改变判定就必须可信;strict 档不读它,红一个不生效的文件是误伤 | |
