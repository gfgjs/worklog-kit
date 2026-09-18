# worklog-kit

面向个人开发者与其 Agent 协作的**任务中枢与文档治理**工具：用两份普通 Markdown 文件承载任务的目标、执行边界、当前进度与设计，用一套可复制的 Skill 约定探索、设计、施工、验收四种角色如何读取与交接，并维护项目文档的当前落点。

> **状态**：`init`、`context`、`check` 已在本分支实现并通过本机自检——`npm test` 全绿、语法检查通过、默认 `docs` 范围与仓根的文档检查通过、打包产物在临时项目实测 `init`／各角色 `context`／`check` 通过。尚未发布新版本，从源码运行见下；验证仅限本机，无远端 CI 与其他操作系统的记录，证据见 [任务记录](docs/tasks/2026-09-19-task-hub/state.md)
> 当前方案（设计基线）：[docs/designs/2026-09-19-任务中枢与文档治理详细方案.md](docs/designs/2026-09-19-任务中枢与文档治理详细方案.md)

## 它解决什么

- **任务接续**：换会话或换模型后，先读 `state.md` 定位阶段、执行边界与下一步，再按指到的章节打开 `details.md`，不必翻对话历史。
- **文档治理**：知道「哪个问题去哪里看」，同一事实只保留一处正文，历史材料标明替代落点，减少过时、冲突与重复。
- **分层模型协作**：廉价模型做定向探索与范围明确的施工，高级模型做关键核实、设计与偏差决策，最终由用户选择验收方式。

成功标准是交接后少补查、少误解、少返工，并保持文档可信。文件数、命令数与正文长度只是成本指标，不代替质量标准。

## 两份任务文件

任务落在 `docs/tasks/<日期-可读名称>/`：

| 文件 | 装什么 | 权威范围 |
|---|---|---|
| `state.md` | 目标摘要、阶段、执行边界、进度表、下一步与阅读 | **当前进度只在这里** |
| `details.md` | 目标与验收、探索结果、共同约束、当前设计、施工单元、执行结果、发现与经验 | 细节与证据 |

阶段取 `探索 / 设计 / 施工 / 待验收 / 完成 / 已取消`，单元状态取 `未开始 / 进行中 / 待处理 / 已自检`。已自检不等于已验收；文件存在也不代表获准施工。

施工单元围绕可观察结果拆分，写清八个固定项：目标与验收、依赖与前提、必读材料、修改范围、实现路径、最低验证、回交条件、回传要求。

## 按角色接续

Skill 入口只讲适用场景、阶段识别与角色路由，分角色说明按需读取，两份模板只在新建或修复结构时读。

| 角色 | 读什么 |
|---|---|
| 探索 | state + 目标与验收，加已存在的共同约束与探索结果 |
| 设计 | state + 目标与验收、探索结果、共同约束、当前设计 |
| 施工 | state + 共同约束、当前设计、指定单元及其显式必读 |
| 验收 | state + 目标与验收、当前设计、执行结果 |

Skill 目录（`skills/worklog/`）可整体复制进任意项目：入口 [SKILL.md](skills/worklog/SKILL.md)、分角色说明 [references/](skills/worklog/references/)、两份骨架 [templates/](skills/worklog/templates/)。单独复制后不依赖任何命令行工具。

## 工具入口

| 入口 | 职责 | 写入行为 |
|---|---|---|
| `init [Skill 目标目录]` | 把包内 Skill 整目录导出，默认 `.agents/skills/worklog` | 内容相同的文件跳过；有冲突时先预检后整体停止，不覆盖、不部分复制，不写项目规则、CI 或任务文件 |
| `context [任务] [--role explore\|design\|implement\|accept] [--unit T1]` | 列未完成任务，或按角色与单元提取接续材料 | 只读，不生成第二份持久状态 |
| `check [路径]` | 检查本地 Markdown 链接与片段、任务核心格式与状态指向的单元 | 只读，不自动修复；默认范围 `docs`，跳过 `docs/history` |

本分支尚未发布新版本，从源码运行，零运行依赖（Node >= 20）：

```bash
node /path/to/worklog-kit/bin/worklog.mjs --help
node /path/to/worklog-kit/bin/worklog.mjs context 标题搜索 --role implement --unit T2
node /path/to/worklog-kit/bin/worklog.mjs check
```

抽取范围、检查范围、Markdown 语法支持边界与退出码见[使用说明](docs/usage.md)。没有工具时，按 Skill 的读取规则手工读文件同样成立。

## 样例

`examples/title-search/` 是一个可真实运行的小型标题搜索样例，含两份任务文件、实现与测试。样例目录本身就是项目根，先进去再跑：

```bash
cd examples/title-search
node src/search.selftest.mjs                 # 已实现部分的 T1 自检，当前通过
node --test test/t2-trim-and-blank.spec.mjs  # 待施工需求 T2 的验收测试，当前失败
node src/cli.mjs readme                      # 命令行实跑
```

样例的 `state.md` 停在「施工 / T2」，`details.md` 给出 T2 的设计、范围、验证与回交条件。把 Skill 与样例交给另一个模型，即可演练一次不用工具的接续。

## 文档导航

工程文档入口见 [docs/README.md](docs/README.md)，它只列主要落点；历史材料集中在 `docs/history/`，不适用于当前产品。

## 开发

```bash
npm test        # node --test test/*.test.mjs
npm run check   # node bin/worklog.mjs check
```

## 来源与许可

本项目以 **MIT** 发布，见 [LICENSE](LICENSE)。零运行期依赖，Node >= 20。
