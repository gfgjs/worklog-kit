# worklog-kit

用普通 Markdown 文件记录跨会话任务的状态，配一个 Skill 和两条只读命令。任务列表即时生成，项目无需配置或初始化。

## 定位

三样东西：

- `skills/worklog/SKILL.md`：告诉 Agent 什么时候读、什么时候写任务文档，以及写什么。
- 任务文档：每个任务一份 `docs/tasks/<稳定名>.md`，随项目一起提交。
- CLI：`list` 汇总任务，`read` 查看单个任务。两条命令都只读，不写任何文件。

## 获取

Node ≥ 20，零运行依赖。命令在项目根运行，CLI 尚未发布到 npm，先用本仓源码，二选一：

```bash
# 直接用源码（把路径换成本仓的实际位置）
node /path/to/worklog-kit/bin/worklog.mjs list

# 或在 worklog-kit 仓根做本地链接，之后可用 `worklog-kit`
npm link
worklog-kit list
```

Skill 单独使用不需要安装：把 `skills/worklog/` 复制到所用 Agent 的 Skill 目录，或直接把 `SKILL.md` 作为本次任务说明交给能读写文件的 Agent。worklog-kit 不可用时，直接读写同样格式的 `docs/tasks/*.md` 即可，不需要装任何旧版 npm 包。

## 最短例子

在项目根建 `docs/tasks/增加标题搜索.md`：

```markdown
---
title: 增加标题搜索
status: active
summary: 标题子串筛选已实现，键盘操作未验证
---

## 当前

目标：按标题筛选笔记，保留原有排序。
落点：过滤逻辑与空结果提示已完成，相关单元测试通过。
未完：输入法组合输入时可能提前筛选，需要检查输入事件处理。
下一步：修复组合输入，再验证中文输入与上下键选择。

## 详情

子串匹配先用 String.includes 实现，暂不做全文索引。
```

```bash
node /path/to/worklog-kit/bin/worklog.mjs list
```

输出形如一行一任务：

```text
docs/tasks/增加标题搜索.md	active	增加标题搜索	标题子串筛选已实现，键盘操作未验证
```

```bash
node /path/to/worklog-kit/bin/worklog.mjs read docs/tasks/增加标题搜索.md
```

`read` 默认输出元数据与 `## 当前`，之后列出被省略的详情标题及其在原文件中的行号。上面这份文件里 `## 详情` 在第 14 行，因此默认输出会在这行列出它而不展开正文。加 `--full` 则输出完整文件。

## 任务文件格式

- 位置：`docs/tasks/<稳定名>.md`，目录平铺，不再分工作线、日期或分类子目录。路径本身就是身份，没有 ID。
- frontmatter 只要求三个字段，均为非空单行字符串：`title`、`status`、`summary`。
- 正文必须有一个非空的 `## 当前`，作为接续摘要；之后可以有 `## 详情` 或任意其他二级标题，都是按需详情。
- 代码围栏里的 `## ...` 不是标题边界。

## 两条命令

`list [关键词] [--status <状态>] [--all] [--json]`

- 从项目根调用，扫描 `docs/tasks/` 下的任务文档。
- 默认只列 `planned` 和 `active`。
- 关键词匹配 `title`、`summary` 和路径，匹配不读详情正文。
- `--status <状态>` 指定单一状态，`--all` 列出全部，两者互斥。
- 默认一行一任务；`--json` 输出 `[{path,title,status,summary}]`，按路径稳定排序。
- 空项目照样成功，给出空结果，并且不创建目录。

`read <docs/tasks/...md> [--full]`

- 只接受本项目 `docs/tasks/` 内的普通 `.md` 文件；越界路径和符号链接逃逸会被拒绝。
- 默认输出元数据加 `## 当前`，之后列出被省略的详情标题及其在原文件中的行号。
- `--full` 输出完整文件。
- frontmatter 不合法、缺少 `## 当前` 或出现多个 `## 当前` 时明确报错。

两条命令都只读。未知参数或缺参直接失败；`--help` 不写任何文件；错误写到 stderr，退出码 2。

## 状态

| 状态 | 含义 |
|---|---|
| `planned` | 已计划，尚未开工 |
| `active` | 进行中 |
| `done` | 已完成并验证 |
| `cancelled` | 已放弃 |

`list` 默认只看 `planned` 和 `active`；查全部用 `--all`。

## 边界

- 从项目根运行，命令以当前工作目录为项目根。
- 没有 `init`，不写配置文件，不安装个人 Skill，不生成静态索引，也没有全局 `CONTEXT.md`。
- 不建分类目录、不编号、不归档、不迁移旧格式；旧版 worklog-kit 的文档与命令不兼容。
- 新 CLI 发布之前，本文只给源码运行与本地链接两种用法。

## 许可

MIT，见 [LICENSE](LICENSE)。
