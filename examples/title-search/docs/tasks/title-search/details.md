# 标题搜索详情

## 目标与验收
需求：给定条目列表与查询串，按标题子串筛选输出，保持条目原有顺序，大小写不敏感；查询串前后空白不影响命中；空查询返回全部条目。
不做：全文搜索、拼音与模糊匹配、排序与高亮、图形界面、接入真实界面事件。
验收方式：待用户选择（自行验收、指定模型验收，或按明确检查结果判定）。
验收条件：
1. T1 自检通过：非空查询的子串命中、大小写不敏感、顺序保持、未命中为空。
2. T2 完成后 test/t2-trim-and-blank.spec.mjs 全绿，且 src/search.selftest.mjs 无回归。
3. src/cli.mjs 实跑输出与预期一致。

## 探索结果
- 入口：src/search.mjs 导出 filterByTitle 与 formatMatches；调用方 src/cli.mjs 把命令行参数拼成一个查询串。
- 数据：src/items.mjs 是固定示例条目，5 条，顺序即界面顺序。
- 已有测试：src/search.selftest.mjs（T1 自检，当前通过）；test/t2-trim-and-blank.spec.mjs 是 T2 的预置验收测试，当前失败（预期，需求尚未实现）。
- 关键事实：filterByTitle 直接拿原串做 includes，不裁剪；undefined 与 null 经 String() 变成字面量 "undefined"、"null"，因此返回空结果。
- 未查看范围：无，本样例即全部代码。
- 疑点：无。

## 共同约束
- 只改 src/search.mjs 与相关测试；不改 src/items.mjs 的数据与顺序，不改 src/cli.mjs 的调用方式。
- 零第三方依赖，Node >= 20，测试一律用 node:test 与 node:assert。
- 非空查询必须保持 items 原有顺序。
- 不得放宽 test/t2-trim-and-blank.spec.mjs 的期望来制造通过。

## 当前设计
方案版本：r1
- 查询语义统一由 filterByTitle 决定，各调用方传原始值；T2 的空值与空白处理见 [T2 实现路径](details.md#实现路径-1)。
- 大小写不敏感，命中条目的原有顺序保持不变。
- 函数签名、返回值形状与既有导出不变；不新增导出，不引入依赖。
待决定：无。最终验收方式尚未选择，属用户决定，记在「目标与验收」。

## T1 纯过滤函数
### 目标与验收
filterByTitle(items, query) 返回标题包含查询子串的条目，大小写不敏感，顺序与入参一致；未命中返回空数组；items 非数组时抛 TypeError。formatMatches 负责把结果转成命令行文本。
### 依赖与前提
无（起步单元）。
### 必读材料
无（共享必读见 state.md 的「下一步与阅读」）
源码指针（相对样例项目根 examples/title-search）：src/search.mjs
验证指针（相对样例项目根 examples/title-search）：src/search.selftest.mjs
### 修改范围
src/search.mjs 的 filterByTitle 与 formatMatches，以及 src/search.selftest.mjs。
### 实现路径
小写化后做 includes 子串匹配，用 filter 保留原顺序；命令行文本由 formatMatches 生成，空结果给短提示。
### 最低验证
在样例项目根 examples/title-search 下跑 node src/search.selftest.mjs 应全绿；再跑 node src/cli.mjs readme 看输出与条目顺序。
### 回交条件
需要模糊匹配、分词或改变返回值形状时回交——这些超出 r1 的标题子串范围。
### 回传要求
改动位置、自检命令与实际输出、未验证项。

## T2 裁剪与空值
### 目标与验收
查询串前后空白不影响命中（'  readme  ' 命中 2、5 号条目）；仅空白、空串、undefined、null 一律返回全部条目且保持原顺序；非空查询的匹配与顺序行为与 T1 一致。
### 依赖与前提
T1 已完成并自检通过；开始前按下面的必读核实 filterByTitle 的当前实现与 T1 自检结果。
### 必读材料
无（共享必读见 state.md 的「下一步与阅读」）
验证指针（相对样例项目根 examples/title-search）：test/t2-trim-and-blank.spec.mjs
源码指针（相对样例项目根 examples/title-search）：src/search.mjs
### 修改范围
只改 src/search.mjs 里 filterByTitle 的查询归一化。不放宽 test/t2-trim-and-blank.spec.mjs 的期望，不改 items 数据与顺序，不改命令行参数拼装。
### 实现路径
query == null 视为空串，否则 String 化后裁剪首尾空白，再转小写沿用 includes 匹配；归一化后为空即返回全部条目。归一化放在 filterByTitle 内；仅在 src/cli.mjs 做 trim 会漏掉测试和其他调用方，因此不采用。
### 最低验证
在样例项目根 examples/title-search 下跑 node --test test/t2-trim-and-blank.spec.mjs 应全绿（当前失败即需求未实现）；再跑 node src/search.selftest.mjs 确认无回归；用 node src/cli.mjs "  readme  " 观察实际输出。
### 回交条件
若裁剪会改变用户已确认的匹配语义（例如需要保留首尾空白的精确匹配），或需要改动调用方接口才能实现，停止并回传。
### 回传要求
改动位置、两条测试命令的实际结果、未验证项、是否有剩余边界问题。

## 执行结果

### T1 结果

已实现：src/search.mjs 的纯过滤与文本格式化。依据：[T1 设计](details.md#t1-纯过滤函数)、[共同约束](details.md#共同约束)。

| 单元·轮次 | 版本·样本·配置 | 运行证据 | 结果 | 可比条件或未验证 |
|---|---|---|---|---|
| T1 自检 | r1 的 T1；自检脚本内置 5 条固定条目 | 样例项目根下 `node src/search.selftest.mjs`（2026-09-19 实跑） | 通过 | T2 修改后须重跑；本结果不代表 T2 通过 |

未验证：T2 变更后的回归；既有证据不证明 T2 完成。无其他遗留问题。

### T2 结果

未实施；预置验收测试 `test/t2-trim-and-blank.spec.mjs` 当前应失败。实现依据见 [T2](details.md#t2-裁剪与空值) 与 [共同约束](details.md#共同约束)。本样例没有界面，界面行为未验证；最终验收方式仍待用户选择。

## 发现与经验
- 空值语义藏在 String() 里：undefined 与 null 会变成字面量参与匹配，返回空结果而不是报错或返回全部。这是 T2 要修的根因，已记在此处备接续。
- 本样例没有界面事件，因此 T2 只做纯函数行为；输入法组合态一类界面行为不在本任务范围。
- 后续建议（不影响本轮）：是否补一份样例用法说明（例如样例内的用法文档）。本轮登记为建议，不建施工单元。
