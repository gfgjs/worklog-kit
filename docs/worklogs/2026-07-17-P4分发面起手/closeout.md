---
id: 2026-07-17-P4分发面起手-closeout
status: snapshot
type: closeout
line: P4分发面起手
created: 2026-07-17
---

# 收口处置:P4 分发面起手

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行(D-012)。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| D-030 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §12 P4 行(起手读数:manifest 基线只记工具写入内容) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-031 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §12 P4 行(起手读数:注释保全 = 外科编辑 + 等价断言 + 兜底) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| F-018 | todo | repo:docs/status/P4分发面起手.md | ## 待办 · doctor 主流程 selftest(F-018) | new | — | yes |

## 处置说明

- **D-030/D-031** 系施工期设计裁决(task_plan 决策表),收口随本变更集回写方案 §12 P4 行起手读数块——上位裁决在方案,实现契约以代码注释与 selftest 为准(`src/lib/templates.mjs` buildManifest 记账规则 / `src/upgrade.mjs` configChange 等价断言)。
- **F-018** 落本线 status 分片 `## 待办`(D-014 line-status 靶点):doctor 主流程补测属新工作面,本任务不夹带(验收已全绿),P4 后续任务承接。
- **P2 线两行销账**:F-004/F-005 系 P2 收口的处置行,靶点在 P2 分片 `docs/status/P2生成式索引与契约收敛.md`——清偿随本收口同一变更集划账(与 F-013 清偿同型)。`.worklogrc.jsonc` 头注「注释系手工补回」的自证伤口一并更新(F-005 修复后该注述已过时)。

## 阶段结论

P4 起手 **landed**(2026-07-17,单日四阶段五 commit:`4363af1` 开线 → `2fd3e61` F-005 → `00d972b` F-004 → `a70bd9e` e2e+CI label → `9d25b12` 验收)。**F-005**:upgrade 配置改动全走 `src/lib/jsoncedit.mjs` 外科编辑(replaceValue/appendItem 两原语,零运行期依赖),产物过解析等价断言、失配回落 stringify 并如实标 lossy(链上传染,真丢才告警)——本仓「注释每次升级手工补回」伤口自此闭合。**F-004**:init/doctor/upgrade 三处同源 renderManaged 六件套;manifest `templates` EOL 归一 sha-256 基线(只记工具最后写入内容,宁可漏刷不可误刷,D-030);doctor 五态信息级报告(ok/missing/stale/customized/unknown);upgrade 分发面对账(stale 带走/missing 补齐/定制与无基线只报不动,stampedAt 不入变更判定保幂等)。

验证:selftest 9→11 套全绿(jsoncedit 15 断言、templates 15 断言、upgrade +17、e2e +9);升档链注释哨兵两程存活 + 第三程配置逐字节不动;双门每 commit exit 0。kit 仓自身 doctor 报 6 件 missing 信息级系 dogfood 特例(非消费仓形态,不 stamp 副本),如实报不消音。P4 行余项(`init --skill-only`、template repo 生成、发布级 manifest/版本钉)未动,续档另起任务。
