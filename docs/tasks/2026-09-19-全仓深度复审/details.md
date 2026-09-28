# 全仓深度复审详情

## 目标与验收
对 feat/task-hub-doc-governance 分支的全仓代码、Skill、文档与示例做一轮深度评审：找出正确性问题、契约不一致与旧产品遗留；顺带把 worklog skill（SKILL.md 流程 + init/context/check 工具）用本任务实测一遍。
验收方式：向用户交付评审报告（按严重度分级、每条带证据定位）；任务档本身即 skill 实测证据。
验收条件：
1. 三份核心代码 + lib + bin 逐行审查完成，问题有文件与行号依据。
2. SKILL.md、README、docs/usage.md、docs/README.md、设计基线相互一致或差异被指出。
3. context 各角色、check、init 实际运行并记录输出。
4. 旧产品遗留（历史目录、示例、CI、包配置）逐项过目。

## 探索结果
- 仓库 136 个文件，现行产品面 = bin/worklog.mjs + src（init/context/check + lib 四模块）+ test（6 文件 51 测试）+ skills/worklog + docs（README/usage/designs）+ examples/title-search + CI；其余全部在 docs/history 归档。
- 基线：npm test 51 项全绿；check docs（5 文件）与 check .（17 文件）均通过。
- 本仓当前任务 docs/tasks/2026-09-19-task-hub 处于「待验收」。

## 共同约束
- 评审只读：除本任务目录两份文件外不改任何仓库文件。
- 结论必须带证据（文件:行号或实际命令输出），推测明确标注。
- 按用户 AGENTS.md 的「轻、简、快」标准评审，不鼓吹防御性设计。

## 当前设计
方案版本：r1
- T1 用真实场景跑 init/context/check（列表、无角色、四角色、错误路径），对照 SKILL.md 与 usage.md 的契约。
- T2 逐行审 bin + src：参数解析、路径安全、Markdown 识别边界、退出码语义。
- T3 审 Skill 与全部现行文档的一致性、包配置/CI/示例的遗留问题。
- 证据写入各单元「当前结果」，完整实测过程与输出见 [评审证据](references/评审证据.md)。

## T1 工具链实测
### 目标与验收
init/context/check 在真实仓库上可用，行为与 SKILL.md、usage.md 描述一致；失败路径输出明确。
最低验证：依次运行 init/context/check 并记录输出与退出码，各命令实际输出与文档契约逐条对照。
### 方案与范围
只在临时目录与 stdout 验证，不修改仓库。工具行为与文档契约冲突且无法判定哪边是基准时回交。
### 依赖与必读
无（基线测试已全绿）。
当时设计依据（按需）：[当前设计](details.md#当前设计)。
### 当前结果
四角色、init、check 全走通：init 导出/幂等/冲突预检符合契约，context 各角色读集与 usage.md 一致、误用退出码正确，check 默认跳过 history 且可按范围检查。发现 1 个可用性措辞问题（任务名需完整目录名）。完整输出见 [评审证据](references/评审证据.md#t1-工具链实测)。

## T2 核心代码审查
### 目标与验收
bin + src 七个文件逐行审完，正确性问题、边界行为、契约偏差均有结论。
最低验证：可疑点用临时脚本或对源码的推理复核。
### 方案与范围
只读审查。按依赖顺序 md → outline → paths → taskdoc → init/context/check → bin 审查。发现设计级取舍问题（需要用户决策而非记录）时回交。
### 依赖与必读
无。
当时设计依据（按需）：[当前设计](details.md#当前设计)。
### 当前结果
1 个 P1（check 与 context 锚点规则不一致，同一引用两命令结论相反）+ 2 个 P2（-h/-v 位置与 usage.md 矛盾、文档测试数过时）。12 组边界探针未发现其它问题，架构分层与退出码语义一致。完整证据与探针结论见 [评审证据](references/评审证据.md#t2-核心代码审查)。

## T3 文档一致性与遗留排查
### 目标与验收
Skill 五份参考 + 两模板、README、docs/README、docs/usage、设计基线、CI、package.json、examples、docs/history 全部过目；不一致与遗留逐条列出。
最低验证：每条结论可指出具体文件与位置。
### 方案与范围
只读审查。以 usage.md 的契约声明为基准逐条核对实现与各文档，再排查 history/示例/CI/包配置的遗留。
### 依赖与必读
T1、T2 的结论可用。
当时设计依据（按需）：[当前设计](details.md#当前设计)。
### 当前结果
旧产品面清理彻底，5 处 docs/history 旧断链已知并声明保留；遗留仅 .gitignore 几条旧流程痕迹（无害）。Skill、README、usage 对两份文件职责、阶段枚举与角色读集表述一致。未验证：远端 CI、非 Windows、Node 20 以下。完整清单见 [评审证据](references/评审证据.md#t3-文档一致性与遗留排查)。

## 发现与经验
- check 与 context 对「锚点定位」是两套独立实现，一处改动另一处不会跟着变——这次 `-1` 后缀不一致正是双实现的产物。修复时应共用同一锚点解析，或明确必读锚点禁止 `-1` 形式并在 check 侧同样拒绝，二选一，不要各改一半。
- 本轮再次证实：文档里写死的过程性数字（测试数、文件数）几乎必然过时；写「npm test 全绿」加指针比写「50 项」更抗腐化。
- skill 手工流程（读 state → 按角色读单份参考 → 建档 → check 自检）在无工具注入的真实场景下可独立走通，两版（单 Skill / 完全体）共享格式的承诺成立。
