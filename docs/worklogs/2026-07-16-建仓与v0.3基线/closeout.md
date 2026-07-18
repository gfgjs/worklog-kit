---
id: 2026-07-16-closeout
status: snapshot
type: closeout
line: 建仓与v0.3基线
created: 2026-07-16
---

# 收口处置:建仓与 v0.3 基线

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-001 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §4.1 item2 ④「brownfield 迁移悬崖与迁移命令」+ 取号触发源澄清引用块 | new | — | yes |
| F-002 | todo | repo:docs/status/建仓与v0.3基线.md | ## 待办(远程 CI 首跑绿 / Codex 侧 skill 副本同步) | new | — | yes |
| F-003 | todo | repo:docs/status/建仓与v0.3基线.md | ## 已知死配置(dogfood 发现,F-003) | new | — | yes |
| D-001 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §0 决策状态板 L10 + §12 路线图 P1.5/P2 两行 | new | — | yes |

## 处置说明

- **F-001**(字母→slug 迁移命令)落 §4.1 item2 而非新建文档:该 item 本就是「工作线 = `lines/<slug>.md` 线实体」的权威落点,迁移悬崖是其**直接推论**,分开写会让 P2 施工者读到门却读不到梯子。同批写入的还有「取号触发源澄清」引用块——用户两轮追问暴露出「装本工具会触发取号」是伪命题,该澄清不记录就会被反复重问。
- **D-001**(P2 全量 go)落 §0 L10 + §12 两行:L10 进**决策状态板**是因为它修正了 L8「据信号扩」在此处的适用方式,不与 L8 并列陈列则后来者读 L8 会与 §12 P2 行的「全量 go」直接打架。§12 P1.5 行同批补入三指标**真实读数**(2/3 结构性无效)——判据失效的证据必须与判据同处,否则下一个人还会照着一张已知产不出信号的表做 go/no-go。
- **F-002/F-003** 均 disposition=`todo` 落 `docs/todo.md`:该文件**本次新建**。建它有三重必要——①`.worklogrc.jsonc` 早已声明 `dispositions[todo].target = docs/todo.md` 且门禁对 `targetKind: fixed` **验存**,文件缺失使 `todo` 成为**死配置**(任何 todo 候选必撞 `docsMissing`);②它是 `/planning` skill 收口第 7 步与收口手册 §三.7 的既定靶点;③两条已裁暂缓项(CI billing / Codex 漂移)需承接处,否则随本任务收口蒸发。
- **未编号的会话内决策**(三轮 28 项裁决、本线不入 Scrollery 治理)候选 ID 列留空,按模板契约 = 仅会话内有效,不提升。

## 阶段结论

P1 MVP **landed**(本地全绿:37 selftest + e2e + `npm pack` 冒烟 + 真实 Claude Code 会话自主收口实测)。
P1.5 验证**完成但判据 2/3 结构性无效**——本仓单人 + 单分支 + 无 hook + CI billing 挂,恰好屏蔽 L6 三支柱中的两个(CI 强制纪律 / multi-person-ready),实际只验到支柱一(两层记忆架构)。
P2 取舍据此裁为**全量 go**(D-001),不等一个结构上产不出的信号;多人验证移 P3 试点,以「建完拿真东西测」破路线图循环依赖。

**后继**:P2 另起三件套(方案 §12 line 406:每阶段落新仓后按 `/planning` 建三件套跟踪,跨阶段收口走 closeout 门)。
