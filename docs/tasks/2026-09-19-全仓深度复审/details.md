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
- T1 用真实场景跑 init/context（列表、无角色、四角色、错误路径）/check（默认、全仓、历史），对照 SKILL.md 与 usage.md 的契约。
- T2 逐行审 bin + src：参数解析、路径安全、Markdown 识别边界、退出码语义。
- T3 审 Skill 与全部现行文档的一致性、包配置/CI/示例的遗留问题。
- 证据实时写入「执行结果」，最终按严重度汇总成报告。

## T1 工具链实测
### 目标与验收
init/context/check 在真实仓库上可用，行为与 SKILL.md、usage.md 描述一致；失败路径输出明确。
### 依赖与前提
无（基线测试已全绿）。
### 必读材料
必读：[当前设计](details.md#当前设计)
### 修改范围
只在临时目录与 stdout 验证，不修改仓库。
### 实现路径
依次运行并记录输出与退出码。
### 最低验证
各命令实际输出与文档契约逐条对照。
### 回交条件
工具行为与文档契约冲突且无法判定哪边是基准时。
### 回传要求
每条实测的实际输出与判定。

## T2 核心代码审查
### 目标与验收
bin + src 七个文件逐行审完，正确性问题、边界行为、契约偏差均有结论。
### 依赖与前提
无。
### 必读材料
必读：[当前设计](details.md#当前设计)
### 修改范围
只读审查。
### 实现路径
按依赖顺序 md → outline → paths → taskdoc → init/context/check → bin 审查。
### 最低验证
可疑点用临时脚本或对源码的推理复核，证据落「执行结果」。
### 回交条件
发现设计级取舍问题（需要用户决策而非记录）。
### 回传要求
问题清单：位置、现象、影响、建议处置。

## T3 文档一致性与遗留排查
### 目标与验收
Skill 五份参考 + 两模板、README、docs/README、docs/usage、设计基线、CI、package.json、examples、docs/history 全部过目；不一致与遗留逐条列出。
### 依赖与前提
T1、T2 的结论可用。
### 必读材料
必读：[当前设计](details.md#当前设计)
### 修改范围
只读审查。
### 实现路径
以 usage.md 的契约声明为基准逐条核对实现与各文档；再排查 history/示例/CI/包配置的遗留。
### 最低验证
每条结论可指出具体文件与位置。
### 回交条件
无。
### 回传要求
不一致清单与遗留清单。

## 执行结果

基线（2026-09-19 实跑）：`node --test test/*.test.mjs` 51 项全绿 0 失败；`check` docs 范围 7 文件、仓根范围 17 文件均通过。

### T1 工具链实测（证据：本任务档即实测产物）

- **建档即实测**：按 SKILL.md 与模板手工新建本任务两份文件 → `check` 立即通过 → `context 2026-09-19-全仓深度复审 --role implement --unit T1` 成功抽取「共同约束」「当前设计」与 T1 单元全文，必读 `[当前设计](details.md#当前设计)` 因已在所选章节中正确去重不重复注入。角色路由读单份参考的流程可闭环。
- **init**（临时消费目录实跑）：导出 8 个文件；重复 init 全部跳过；本地定制 SKILL.md 触发冲突预检、整体停止且未写入任何文件；绝对路径目标不拼接到 cwd。与 usage.md 契约一致。
- **context**：无任务列未完成任务（完成/已取消过滤，缺 state.md 的目录标注「阶段未识别」并仍列出）；无角色只给 state 三节且不展开必读；explore/design/accept/implement 四角色读集与文档表格逐条一致；`--unit` 与角色组合的四种误用全部退出 2 且报错信息准确；缺核心文件、必读片段不存在、单元缺失均退出 1 不输出半成品材料。
- **check**：默认 docs 跳过 history；`check docs/history` 报 5 处旧断链（与任务记录 2026-09-19-task-hub 的留档一致）；单文件、子目录、绝对路径范围均可；`check` 于无 docs 的空项目正确退出 2。
- 发现的可用性问题：任务名必须给完整目录名（`context 全仓深度复审` 找不到，需 `2026-09-19-全仓深度复审`）。行为符合 usage.md「按目录名解析」的字面，但「任务名」一词易误解为短名可用，属文档措辞问题非缺陷。

### T2 核心代码审查（bin + src 七文件逐行 + 12 组边界探针）

- **P1 锚点规则不一致（唯一实质代码缺陷）**：同名标题锚点 `#标题-1`，`check` 用 `anchorSet`（支持 `-1/-2` 后缀）判定通过，`context` 必读解析用 `slugify(h.title) === anchor` 精确匹配判定「必读片段不存在」退出 1。同一引用两命令结论相反。位置：src/check.mjs:105-107 对照 src/context.mjs:113。探针实证：`必读：[x](g.md#目标与验收-1)` 在同仓两命令下 check=0 / context=1。
- **P2 文档与 CLI 矛盾**：usage.md:47 称 `-h/-v`「写在子命令之后会被当作不支持的参数」，实测 `check -h`、`init -v`、`context x --help` 都打印帮助/版本退出 0（bin/worklog.mjs:80-87 的 args.includes 命中）。
- **P2 文档数字过时**：README.md:5 与 usage.md:98 写「测试 50 项 0 失败」，实际（含 README 定稿提交 3ec010d 当时）均为 51 项。
- 已核实无问题的边界：`--role -v` 交互、T1/T10 单元编号不混淆（UNIT_RE 带 `\s|$`）、`阶段：完成`后进度表指向缺失单元能报错、必读多链接/外链/源码指针/越界的拒绝路径、图片链接按存在性与锚点检查、目录链接与名为 `*.md` 的目录不误报、`isPlaceholder` 对「待决定：无」「待定（未决）」等正确放行、BOM 文件在 init 中按内容相同跳过（保留原 BOM，宽松方向可接受）、路径安全（resolveInRoot + realpath 双重校验，符号链接越界被拒）。
- 架构面：模块分层（md/outline/paths/taskdoc）边界清晰、无死代码、无旧命令别名残留路径、退出码 0/1/2 语义在三个命令中贯彻一致。整体质量高。

### T3 文档一致性与遗留排查

- **旧产品清理已彻底**：`.worklogrc.jsonc`、`.sync-allowlist.json`、`schema/`、`templates/`、`locales/`、`tools/`、旧 CI（repro.yml）全部删除（commit 1b41219、e9499e8 diff 核实）；docs/history 归档带统一历史标注与导航（docs/history/README.md），5 处旧断链已知且声明保留。CODEOWNERS 已按新组件面收敛。
- **轻微遗留**：.gitignore 的 `.sync-blocklist.local.json`、`*.tgz`、`.npmrc` 是旧同步/发布流程条目，现行流程不再产生这些文件（无害，仅痕迹）。
- **一致性核对**：SKILL.md、README、docs/README.md、usage.md 对两份文件职责、阶段/状态枚举、八项单元小标题、角色读集的表述一致；examples/title-search 的「施工/T2 待做 + 预置失败测试」与文档描述一致；CI（node --test + check）与 README「开发」节一致。
- **文档未覆盖的行为**（信息级）：任务结构检查只对 root 的 `docs`/`docs/tasks`/任务目录本身生效——从主仓根 `check examples/title-search/docs` 只做链接检查不做任务结构检查；嵌套项目需以该项目为 root 运行（文档推荐做法正是 `cd examples/title-search` 后运行，行为成立但规则未写明）。

未验证：远端 GitHub CI 实跑、非 Windows 环境、Node 20 以下行为（engines 已声明 >=20）。

## 发现与经验

- check 与 context 对「锚点定位」是两套独立实现，一处改动另一处不会跟着变——这次 `-1` 后缀不一致正是双实现的产物。修复时应共用同一锚点解析，或明确必读锚点禁止 `-1` 形式并在 check 侧同样拒绝，二选一，不要各改一半。
- 本轮再次证实：文档里写死的过程性数字（测试数、文件数）几乎必然过时；写「npm test 全绿」加指针比写「50 项」更抗腐化。
- skill 手工流程（读 state → 按角色读单份参考 → 建档 → check 自检）在无工具注入的真实场景下可独立走通，两版（单 Skill / 完全体）共享格式的承诺成立。
