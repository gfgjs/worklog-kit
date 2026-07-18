---
id: 2026-07-16-todo
status: active
type: index
line: 文档治理
created: 2026-07-16
---

# 滚动状态(todo)

> 📦 滚动状态已分片(generated 档,2026-07-16):各工作线现役状态见 `docs/status/`
> (每线恰好一文件,D-016;聚合只读视图由 `worklog index build` 产出,不入库 C-3)。
> 本文件退役:原「工作线」表与「待办」两节已人工归并进对应分片
> (`docs/status/worklog-kit-oss.md`、`docs/status/文档治理.md`、`docs/status/建仓与v0.3基线.md`);
> `P2生成式索引与契约收敛` 的滚动状态即其在施三件套(`docs/planning/` 下 progress.md),不另设分片。

## 已知死配置(dogfood 发现,F-003)

`.worklogrc.jsonc` 声明 9 个 disposition,但本仓当前只有 4 个**立即可用**(`design`/`code`/`test`/`no-promotion`)。
`decision`/`runbook`/`completed` 的靶点文件尚不存在——属**首次使用时新建**的正常情况,非缺陷(targetKind=`docs`,target 由每行自报,门禁验存)。`experience` 靶点已建(`docs/experience.md`,2026-07-16),此项已消。
`todo` 曾是**真死配置**:targetKind=`fixed` 的 target 由**配置**写死为 `docs/todo.md`,该文件不存在 → 任何 `todo` 候选必撞 `docsMissing`。**本文件的创建即为此修复**(2026-07-16);同日 generated 档迁移后,`todo` 处置改 `line-status`,靶点随任务 line 落 `docs/status/<slug>.md`。本文件 status 仍 `active`:顶部横幅「退役」仅指其滚动状态职能已移交分片,作为 F-003 死配置修复的记述它仍是活文档(非归档件)。
