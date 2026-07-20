---
id: <任务目录名>-closeout
status: snapshot
type: closeout
line: <任务名>
created: <收口日 YYYY-MM-DD>
---

<!-- id:稳定标识,创建即得、改名不变(v3 起必填)。取 `<任务目录名>-closeout` 是因为
     任务目录名本身已是 `<日期>-<任务名>` 且全仓唯一 —— 这样发出来的号**天生不撞**,
     不必等门禁事后告诉你撞了。 -->


# 收口处置:<任务名>

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog-kit check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-001 | experience | repo:docs/experience.md | §N 某节标题 | new | — | yes |

<!--
disposition 与 target 规则(见 .worklogrc.jsonc 的 dispositions):
  - docs 类(experience/decision/design/runbook/completed):target = repo:<仓根相对路径>,门禁验存
  - todo:fixed 档 target 固定 = repo:docs/todo.md;generated 档 = repo:docs/status/<slug(任务 line)>.md
    (靶点由本任务 frontmatter 的 line 求解,D-014;以 .worklogrc.jsonc 的 todo 处置为准)
  - code/test:target = 冻结引用 repo:<路径>@<commit 短hash>(只验 grammar,不验存在,永不回改)
  - no-promotion:target = —,且「N/A 理由」必填
去重证据:new=新落点,或 repo:<路径>=复用已有知识;no-promotion 填 —。
verified 只接受 yes:含义=提升动作已在同一变更集内完成、落点可见。
-->
