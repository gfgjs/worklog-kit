---
id: 2026-07-13-README
status: active
type: index
line: 文档治理
created: 2026-07-13
---

# docs 文档索引与治理规则(worklog-kit 自身)

> 本目录是 worklog-kit 全部工程文档之家,并**吃自己狗粮**——用本工具治理本仓。
> 机器面契约(frontmatter 字段/枚举值)见 [../.worklogrc.jsonc](../.worklogrc.jsonc)(机器面锁 ASCII);
> 门禁 `worklog check` / `worklog index` 强制执行。

## 目录职责

| 目录 | 放什么 |
|---|---|
| `designs/` | 单点设计方案(founding 设计即居此) |
| `planning/` | **施工中**长任务的工作记忆三件套(活文件,非正典) |
| `reviews/` | 审查/复核快照(第四轮起独立成文;前三轮内嵌于设计文档 §15–§17) |
| `worklogs/` | **已收口**长任务的工作记忆三件套 + `closeout.md` |
| `lines/` | 工作线实体,`<slug>.md` 一句话使命;文档 frontmatter `line` 引用其文件名(开线 = 新建实体) |
| `status/` | 工作线滚动状态分片,`<slug>.md` 每线一文件(D-016);closeout 的 todo 处置按任务 line 落此(D-014) |
| `runbooks/` | 操作手册:可重复执行的流程契约(公私双源净化同步等) |

## 维护规则

- 任何改变文档状态/位置的 commit 须同步更新本索引与相关登记。
- 新文档:入类型目录 + 文首 YAML frontmatter(status/type/line/created,枚举见 `.worklogrc.jsonc`)。
- 收口即处置:长任务收口 commit 同步「迁 worklogs/ + 写 closeout.md + 更新登记」。
- 本仓当前无 `archive/` 等目录;需要时新建并在上表补一行(目录表↔实际目录须双向一致)。
