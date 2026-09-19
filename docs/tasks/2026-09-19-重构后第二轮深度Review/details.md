# 重构后第二轮深度 Review 详情

## 目标与验收
对重构后的现行产品面（bin、src 及其 lib、package.json、隐藏工程配置、examples、skills/worklog、现行文档、相关 bin/init/context/check 测试）做第二轮深度 Review，并按 SKILL.md 实际使用 worklog 走一遍建档、按角色交接、回写证据与 check；在临时副本上以接手代理身份完成样例的 T2，再用验收角色接续。
追加授权（修复阶段）：用户核实五项发现属实后，授权修复五项发现、补对应测试、同步 usage.md 表述，完成后提交。修复仍不改示例工程与既有用户文件，不安装依赖、不全量构建、不发布。
验收方式：用户接收本轮报告与修复。
验收条件：
1. T1/T2/T3 各有可复现结论与证据定位（文件与行号或实际命令输出）。
2. worklog skill 实测闭环：建档、context 各角色、临时副本 T2 施工与验收、init 临时导出与冲突/幂等、check 默认与仓根范围。
3. 只报可复现且有用户影响的问题，推测与已证实分开标注。
4. T4 五项发现逐项修复，修复后原复现探针全部转为正确行为，基线测试全绿。

## 探索结果
- 现行产品面：bin/worklog.mjs、src（init/context/check + lib 四模块）、test 六文件、skills/worklog（入口 + 5 份参考 + 2 模板）、docs（README/usage/designs/两个任务）、examples/title-search、.github CI、.gitignore/.gitattributes/package.json。
- 初审已关闭：docs/tasks/2026-09-19-全仓深度复审，四个修复提交 fd2e62a（锚点统一）、957b0ff（-h/-v 位置）、13315bc（测试数表述）、4cf02d1（示例任务名）。
- 工作区状态：package.json 版本由 0.1.0-alpha.4 改为 0.2.0（未提交），其余为干净工作区加本轮任务目录。
- 本轮基线：npm test 53 项全绿；check 默认范围 7 文件、check . 19 文件均通过。
- 未查看范围：docs/history 各文件正文（只按导航与引用抽查）、远端 CI、非 Windows 环境。

## 共同约束
- 审查只读：除本任务目录两份文件外不写任何仓库文件；样例施工只在系统临时目录副本内进行，不改原示例。
- 结论必须带证据（文件:行号或实际命令输出）；推测不得写成已证实。
- 只报可复现、有用户影响的问题，含优先级、触发条件、期望/实际、最低复现。
- 探索预算：一轮遍历负责文件，围绕真实疑点最多 10 组定向探针。

## 当前设计
方案版本：r1
- T1：审 bin/worklog.mjs 参数解析与 src/context.mjs 必读解析，重点核实最近锚点统一提交（fd2e62a）后的行为，用探针复核。
- T2：审 src/check.mjs 与 lib，重点核实锚点判定与任务结构检查在修复后的口径，以及范围与退出码。
- T3：把示例复制到系统临时目录，作为接手代理只按 state、implementation 参考与 T2 单元材料完成 T2，跑既有验收测试，再用 acceptance 参考接续；同时实测 init 导出、冲突与幂等。
- 证据实时写入「执行结果」，最终按优先级汇总。

## T1 context 审查
### 目标与验收
bin/worklog.mjs 与 src/context.mjs 的参数解析、角色读集、必读展开与退出码在实测下与 usage.md、SKILL.md 契约一致；不一致处给出可复现证据。
### 依赖与前提
基线测试已通过；初审的锚点统一提交已合入。
### 必读材料
必读：[当前设计](details.md#当前设计)
源码指针（相对仓库根）：bin/worklog.mjs、src/context.mjs、src/lib/taskdoc.mjs
### 修改范围
只读审查与临时目录探针，不改仓库文件。
### 实现路径
先逐行审参数解析与角色路由，再用临时项目跑各角色 context 与误用路径，对照 usage.md 的读集表格。
### 最低验证
每条结论附实际命令与输出或行号依据。
### 回交条件
发现需要用户决策的设计级取舍。
### 回传要求
问题清单：位置、触发条件、期望/实际、最低复现、实际结果。

## T2 check 审查
### 目标与验收
src/check.mjs 与 lib 的链接、锚点、任务结构与范围判定在实测下与 usage.md 明示契约一致；check 与 context 的锚点规则按各自契约核对（歧义锚点允许差异）。
### 依赖与前提
T1 的结论可用。
### 必读材料
必读：[当前设计](details.md#当前设计)
源码指针（相对仓库根）：src/check.mjs、src/lib/md.mjs、src/lib/taskdoc.mjs
### 修改范围
只读审查与临时目录探针。
### 实现路径
逐行审 check 的锚点判定与任务结构检查，用临时项目构造边界样例对拍 context 与 check。
### 最低验证
构造样例的实际命令输出与退出码。
### 回交条件
发现需要用户决策的设计级取舍。
### 回传要求
问题清单：位置、触发条件、期望/实际、最低复现、实际结果。

## T3 Skill 与集成实测
### 目标与验收
按 SKILL.md 与 references 实际走通建档、按角色交接、回写证据与 check；在系统临时目录的示例副本上以接手代理身份完成 T2 并用验收角色接续；init 导出、冲突与幂等符合契约。
### 依赖与前提
T1、T2 结论可用；示例未改动。
### 必读材料
必读：[当前设计](details.md#当前设计)
Skill 指针（相对仓库根）：skills/worklog/SKILL.md、skills/worklog/references/implementation.md、skills/worklog/references/acceptance.md
### 修改范围
只在系统临时目录副本内施工；原示例保持原样。
### 实现路径
建档后跑 context 各角色；复制示例到临时目录，按 state 与 T2 材料实现，跑既有验收测试；再切验收角色核对；最后跑 init 三种路径。
### 最低验证
临时副本内测试命令的实际输出，以及 init 的目录比对与退出码。
### 回交条件
Skill 材料不足以完成单元，或需要越出单元范围。
### 回传要求
实际输出、未验证项、Skill 可用性问题。

## T4 五项发现修复
### 目标与验收
用户核实后的五项发现（1 个 P1 + 4 个 P2）逐项根因修复；`npm test` 全绿（含新增用例），仓内 `check` 默认与仓根范围通过，原复现探针全部转为正确行为；usage.md 同步契约表述。
### 依赖与前提
T1/T2/T3 的发现与复现探针；用户核实五项发现属实并授权修复。
### 必读材料
必读：[执行结果](details.md#执行结果)
源码指针（相对仓库根）：src/context.mjs、src/check.mjs、src/lib/md.mjs、src/lib/taskdoc.mjs
### 修改范围
五项发现对应的源码、测试（test/check.test.mjs、test/context.test.mjs、test/md.test.mjs）、docs/usage.md 契约表述与本任务目录两份文件。不改示例工程与既有用户文件。
### 实现路径
按发现的根因逐项修：P1 去重改按行范围包含判定；围栏遮蔽统一为解析层前置（stripFences，阶段/方案版本/字段读取共用）；尖括号占位判定收窄为「散布在目标里」；任务结构范围判定改按路径覆盖关系；「当前」节补检查项字段校验。
### 最低验证
`npm test` 全绿；`node bin/worklog.mjs check` 与 `check .` 通过；五项发现的原最低复现在探针根（C:\Users\gf\AppData\Local\Temp\wlverify-00uVPZ，由主会话核实阶段独立重建）全部转为正确行为。
### 回交条件
修复需要改变明示契约语义（如让字段检查更严导致既有任务不合规）时回交。
### 回传要求
逐项修复位置、验证证据、遗留项。

## 执行结果
本轮基线（2026-09-19 实跑，Node v24.20.0）：`npm test` 53 项全绿 0 失败；`check` 默认范围 7 文件、`check .` 19 文件（本轮任务建档后为 9 / 21）均通过退出 0。

本轮工作区改动：仅新增本任务目录两份文件；既存的 package.json 版本号改动（0.1.0-alpha.4 → 0.2.0，未提交）与 docs/tasks/2026-09-19-全仓深度复审 目录未由本轮触碰。本轮未做任何产品修复、未提交、未发布。

### T1 context 审查

**P1 必读片段被同名上层章节误去重 / 同单元自引用重复注入（已复现，两种表现）**
位置：src/context.mjs:71（`selected` 按 `absPath#title` 登记所选章节）、src/context.mjs:125（命中即 return）。
触发条件：任务内 `## 目标与验收` 与某单元 `### 目标与验收` 同名，必读指向编号锚点 `details.md#目标与验收-1`（即单元内那处）。
期望：accept 角色读到单元内的「目标与验收」正文。实际：该片段被顶层同名章节去重而静默缺失，命令仍退出 0；同引用 `check` 也退出 0，故作者无从察觉。
最低复现（临时项目，命令在项目根运行）：state.md 的「下一步与阅读」写 `必读：[目标与验收-1](details.md#目标与验收-1)`，details.md 同时含顶层 `## 目标与验收` 与 T1 下 `### 目标与验收`。
`node <repo>/bin/worklog.mjs context demo --role accept` → 实际输出「必读片段」只有 `details.md#修改范围` 一处，顶层 `## 目标与验收` 以所选章节出现，单元正文 UNITMARK 未出现；EXIT=0。
反向表现：implement 角色下同一单元内 `必读：[修改范围](details.md#修改范围)`（指向本单元 `### 修改范围`）与已注入的 T1 单元正文重复——实际输出中 `### 修改范围` 正文 RANGEMARK 出现 2 次；EXIT=0。
影响：验收者/施工者按锚点取到的材料缺项或重复，且无报错。此处违反的是 usage.md 的两条明示规则——按角色完整提取所选材料、以及「已在所选章节里完整出现的片段不重复注入」（去重应按覆盖范围判定）；锚点存在性与定位唯一性本身已满足，不属本项缺陷。
修复方向（不实施）：去重按同文件真实章节的范围包含关系判定，而非按标题名。

**P2 阶段行读取不遮蔽围栏（已复现）**
位置：src/lib/taskdoc.mjs:96（`STAGE_RE.exec(sectionBody(...))` 直接在未遮蔽围栏的正文上匹配）。
触发条件：「当前」节先出现围栏内的示例行 `阶段：完成`，之后才是真实 `阶段：施工`。
期望：阶段取真实的「施工」，任务出现在 `context` 无参列表中。实际：阶段被读成「完成」，该任务在列表中消失。
最低复现：构造上述 state.md 后 `node <repo>/bin/worklog.mjs context fence` → 头部 `阶段：完成`，EXIT=0；`node <repo>/bin/worklog.mjs context`（同目录）→ 「当前没有未完成任务。」——未完成任务被静默漏掉。仅含围栏示例、无真实阶段行时同样被读成「完成」。
影响：模板骨架把阶段行写在围栏示例中时，未完成任务从列表消失；后续接续者以为任务不存在。

### T2 check 审查

**P2 尖括号链接目标被当作占位而漏检（已复现）**
位置：src/lib/md.mjs:101（`placeholder: /[<>]/.test(inner)`）、src/check.mjs:72（`if (link.placeholder) continue;`）。
触发条件：链接目标用尖括号包裹，如 `[指南](<nope.md>)`，且目标不存在。
期望：按 usage.md「行内链接 `[文字](目标)`（含 `<目标>` …）」校验并报「链接目标不存在」。实际：被判为占位跳过，命令退出 0。
最低复现：`docs/a.md` 写 `[正常断链](nope.md)` 与 `[尖括号断链](<nope2.md>)`，`node <repo>/bin/worklog.mjs check probeA` → 只报 `a.md:3 链接目标不存在：nope.md` 一处，尖括号那条未报，EXIT=1（漏一条）。仅含尖括号断链时 → 「通过」，EXIT=0。
补充：`context` 对同一尖括号引用能正确解析（必读解析未走 placeholder 分支），两命令口径不一致。

**P2 任务结构检查按范围静默漏检（已复现）**
位置：src/check.mjs:170-178（`tasksUnder` 只在范围为 `docs`/`docs/tasks` 或该目录自身含 `state.md` 时返回任务目录）。
触发条件：同一仓内换一个范围入口，任务目录不被识别。本项目实测三种入口：`check docs` vs `check .`；Windows 下大小写不同的 `check DOCS`；直接指向缺 state.md 的任务目录。
期望：只要范围内存在任务目录，其结构与单元指向就应受检。实际：同一份有缺陷的 fixture，`check docs` 报 1 处（T9 在 details.md 找不到对应单元）退出 1；`check .` 报「通过」退出 0；Windows 下 `check DOCS`（同一目录）同样报「通过」退出 0。
最低复现：`docs/tasks/demo` 中 state.md 进度表列 `T9 缺失单元` 而 details.md 无 T9，在项目根运行 `check docs` → 1 处 EXIT=1；`check .` → 「通过」EXIT=0；`check DOCS` → 「通过」EXIT=0。缺核心文件同理：`check docs` 能报「任务缺少核心文件」，直接 `check docs/tasks/<只有 details 的目录>` → 「通过」EXIT=0。
影响：同一份任务材料，换一个范围入口就从「发现问题」变成「通过」，检查结论不稳定；以 `.` 为范围时任务结构问题（含缺核心文件）被静默放过。
边界（非缺陷）：以各项目自身根目录运行（如 `cd examples/title-search` 后 `check`）是已知且可接受的用法，本项不要求为嵌套项目自动做结构检查。

**P2 核心字段检查缺失（已复现）**
位置：src/check.mjs:122-126（只验阶段枚举与必需章节标题），未校验 usage.md:30 明示的检查项字段。
触发条件：「当前」节只写 `阶段：探索`，缺 `目标：`、`执行边界：`、`当前：`。
期望：usage.md 把 `目标：`、`阶段：`、`执行边界：`、`当前：` 标为检查项，缺失应报错。实际：范围内该任务显示「通过」，退出 0。
最低复现（避开范围漏检干扰，直接以 runCheck 判定）：在临时根建 `docs/tasks/<任务>/state.md`（「当前」节只有阶段行）与 details.md（探索阶段只需「目标与验收」），调用 `runCheck({ root: 临时根, cwd: 临时根, scope: 'docs' })` → `code: 0`，未报任何缺字段问题（主会话探针 wl-probe4.mjs 已核实）。此前用 `check probeF` 的写法不适用于本项证明——probeF 目录未被识别为任务目录，结论会与范围漏检混淆。
影响：任务档缺少执行边界与当前动作仍显示通过，接续者可能在没有边界说明的情况下继续。

### T3 Skill 与集成实测

**建档与按角色交接（本任务档即产物）**：按 SKILL.md 与 templates 手工新建本任务 state.md/details.md → `check` 通过 → `context` 无参正确列出本任务 → 四角色读集与 usage.md 表格逐条核对一致：
`--role explore` → state 三节 +「目标与验收」「探索结果」「共同约束」；
`--role design` → 上述加「当前设计」；
`--role implement --unit T2`（样例副本内）→ state 三节 +「共同约束」「当前设计」+ T2 单元全文；
`--role accept` → state 三节 +「目标与验收」「当前设计」「执行结果」；四条命令均退出 0。
已关闭任务 `2026-09-19-全仓深度复审` 不出现在列表、显式指定可查看，与 usage.md 一致。

**样例 T2 接手演练（临时副本，原示例未改）**：把 examples/title-search 复制到系统临时目录后，只按 state.md、implementation 参考与 T2 单元材料（`context title-search --role implement --unit T2` 输出）施工。材料自洽可用：单元给出修改范围、实现路径、最低验证与回交条件，未出现歧义。按「当前设计」r1 改 src/search.mjs 一行（`query == null ? '' : String(query)` 后 trim 再小写）。验证实际结果：
`node --test test/t2-trim-and-blank.spec.mjs` 施工前 1 项失败（actual [] / expected [2,5]）→ 施工后 4 项全绿退出 0；`node src/search.selftest.mjs` 7 项全绿无回归；`node src/cli.mjs "  readme  "` 输出 2、5 号条目且保持原顺序。随后按 acceptance 参考切验收角色，核对待验收条件与证据（「目标与验收」三条）均对得上，未发现需要回交的差异。说明：本次交接由本代理按新角色重新读取有限材料完成，不是另一独立模型的盲测。

**init 导出、幂等与冲突**：空目录 `init` 写入 8 个文件退出 0；再次 `init` 8 个全部跳过退出 0；本地修改 SKILL.md 后 `init` 预检报冲突、未写入任何文件、退出 1；预置一个内容不同的 templates/state.md 后 `init` 同样整体停止，目录内仍只有该预置文件，未部分复制。与 usage.md 契约一致。

**check 范围与退出码**：默认 `docs`（跳过 history）、`check .`、单文件、子目录均可用；范围不存在退出 2。结合 T2 的发现，换范围入口会漏掉任务结构检查。

**可复用探针与命令**（临时产物，未清理，均在系统临时目录）：本轮探针根 `C:\Users\gf\AppData\Local\Temp\wlprobe-11892838`，含 `gen.mjs`（P1 必读去重/重复注入 fixture）、`gen2.mjs`（尖括号漏检、范围漏检 fixture）、`gen3.mjs`（围栏阶段 fixture）、`gen4.mjs`/`gen5.mjs`（核心字段、范围漏检 fixture）、`initproj`/`initproj2`（init 幂等与冲突）、`t3\title-search`（样例副本，已按 T2 施工）；主会话另有 `wl-probe4.mjs`（核心字段）、`wl-probe5.mjs`、`wl-probe-g.mjs`（围栏阶段）。
复现命令（把 `<repo>` 换成本仓根、`<probeRoot>` 换成探针根）：`node <repo>/bin/worklog.mjs context demo --role accept`（在 `<probeRoot>` 运行，P1）、`context demo --role implement --unit T1`（重复注入）、`check probeA`（尖括号）、`check docs` vs `check .` vs `check DOCS`（范围，在 `<probeRoot>\probeI` 运行）、`context fence` 与 `context`（在 `<probeRoot>\probeD` 运行，围栏阶段）。

### T4 五项发现修复（2026-09-19 实跑，Node v24.20.0）

逐项修复位置与修复后行为（原复现探针均在 `C:\Users\gf\AppData\Local\Temp\wlverify-00uVPZ`，主会话核实阶段独立重建，与 T1/T2 的探针根不同）：

**P1 必读去重/重复注入**：src/context.mjs 的 collectReading 不再按「文件#标题名」登记所选章节，改为按文件登记所选章节的行区间；必读片段的标题行落在某区间内才跳过（真正完整出现）。修复后：accept 角色必读指向单元内 `#目标与验收-1` 正常注入（UNITMARK 出现 1 次）；implement 角色必读指向单元内 `### 修改范围` 不再重复注入（RANGEMARK 1 次）；既有「当前设计」「共同约束」去重行为不变（原测试继续通过）。

**P2 阶段行未遮蔽围栏**：src/lib/taskdoc.mjs 新增 stripFences（按行过滤围栏），readStage、readDesignVersion 与新增的字段校验共用。修复后：围栏示例 `阶段：完成` 在真实 `阶段：施工` 之前时读出「施工」，无参任务列表正常列出该任务；仅围栏示例无真实阶段行时读「未识别」并如实出现在列表（阶段未识别），不再凭围栏示例判「完成」。

**P2 尖括号链接漏检**：src/lib/md.mjs 的 placeholder 判定收窄为「尖括号散布在目标里」（整体 `<目标>` 包裹是真链接）。修复后：`[尖括号断链](<nope2.md>)` 与普通断链一并报出；模板骨架 `(<相对当前文件的路径>.md#<锚点>)` 仍跳过；context 与 check 口径一致。

**P2 任务结构按范围漏检**：src/check.mjs 的 tasksUnder 改按路径覆盖关系判定（归一大小写与分隔符），范围覆盖 `docs/tasks` 即检查全部任务；不含时检查范围自身与其直接子目录里的任务目录（含只有 details.md 的目录，报缺核心文件）。修复后：同一 fixture 下 `check docs` / `check .` / `check DOCS` / `check docs/tasks` 报同一批问题；`check docs/tasks/<只有 details 的目录>` 报「任务缺少核心文件」；各项目自身根目录运行的用法不变（CI、示例工程实测不受影响）。

**P2 核心字段缺失**：src/lib/taskdoc.mjs 新增 STATE_FIELDS（目标、阶段、执行边界、当前）与 missingStateFields（读取遮蔽围栏），src/check.mjs 在 checkTask 里报缺失字段；阶段行存在但不合法才报枚举，同一缺失不报两条。修复后：只有 `阶段：探索` 的「当前」节报 3 处缺失字段退出 1；usage.md 原本就把这四项标为检查项，本修复使工具与契约一致。

**验证证据**：
- `npm test` 61 项全绿 0 失败（基线 53 项 + 新增 8 项：md 占位判定 2、check 范围/字段/尖括号 3、context 同名去重/单元内去重/围栏阶段 3）。
- 语法检查通过（node --check 四文件）。
- 仓内 `check`（9 文件）与 `check .`（21 文件）均通过退出 0；examples/title-search 内 `check`（2 文件）通过，`node src/search.selftest.mjs` 全绿，示例未改。
- 五项发现的原最低复现全部转为正确行为（逐项命令输出见上）。

未验证：非 Windows 环境与远端 CI；docs/history 正文未逐份阅读（只按导航与引用抽查）。

## 发现与经验
- 同一份契约由 check 与 context 两处独立实现时（锚点、尖括号链接），两命令口径容易分叉；本轮 P1 与尖括号 P2 都是这类分叉的产物。
- 「按范围找任务」用的是范围字符串与固定目录名，而不是「范围内是否存在任务目录」，导致换一个入口范围就静默降级；这类降级不报错，最容易被误当成通过。
- 围栏遮蔽已在链接与标题识别里实现，但阶段行读取没走同一套遮蔽，说明遮蔽应当是解析层的统一前置步骤。
