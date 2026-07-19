---
id: 2026-07-19-token税二轮-写侧纪律与护栏改口径-closeout
status: snapshot
type: closeout
line: token税二轮-写侧纪律与护栏改口径
created: 2026-07-19
---

# 收口处置:token税二轮-写侧纪律与护栏改口径

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-025 | experience | repo:docs/experience.md | ## 三件套体积口径须双轨:行数对中文文件失真(F-025) | new | — | yes |
| F-026 | experience | repo:docs/experience.md | ## 三件套冗余三源:治理面在写侧不在读侧(F-026) | new | — | yes |
| F-027 | experience | repo:docs/experience.md | ## 模板结构须自证 append-only:收口专用节不得挡文件尾(F-027) | new | — | yes |
| D-032 | no-promotion | — | — | — | 阈值(单件 4k/合计 6k)是单点实测依据(案例 6.8k 判重、正常任务预期 <4k),属本任务决策留档;后续调阈值须重测,不构成跨任务复用经验,同 F-022 立场 | yes |

## 处置说明

- **F-025/F-026/F-027** 提升进 `docs/experience.md`(disposition experience,靶点自报),紧接 F-021 之前——同题材经验按 F-ID 全局序连续排列,读者一眼看到 token 税治理的完整脉络(F-021 首轮体积杠杆定位 → F-025/026/027 二轮口径/病根/模板坑)。
- **D-032** 裁 no-promotion,与首轮 F-022(阈值 200)同一立场:双轨阈值(单件 4k/合计 6k)是本次单点实测依据,已写入本 closeout 与 findings 存档;后续若样本积累更多需调阈值,须重测不可直接改数字。
- **E(单文件轻模式)/ P2(`worklog resume`)** 范围外:task_plan「目标」段已明示记后续轮,未登记候选、未处置,不进本次收口。

## 阶段结论

三件套 token 税二轮优化 **landed**(2026-07-19,三阶段单线;`44edebc`/`b2f8812`/`674d89b`/`5830312`)。**阶段 1**:SKILL.md §干活中补写侧四纪律(完成即折叠/写指针不写复述/findings 消费当场标记/纯追加走 shell heredoc)+ §接续改分层读(task_plan 全读 → progress 前情段+最近段 → findings 全读,不跳文件);templates 三件同步前情段、attachments 约定、折叠提示注释。**阶段 2**:doctor `fatTrio` 改 est-token 双轨(行数 200 兜底 + 单件 est>4k + 三件合计 est>6k,`estTokens` 与 `tools/token-audit.mjs` 同式内联)+ 新增 `foldableStages()` 咬 complete/done 且 >3 条 `[x]` 的未折叠阶段;selftest +11 项全绿。**阶段 3**:13 套 selftest 全绿 + 双门 exit 0;scrollery 实仓冒烟——案例本身合计 est 8015(护栏 6000)命中、其 complete 阶段 5 个肥段全中(最肥 16 条)、某失控样本(单件 est 43k)命中、kit 仓自身深度审查线 6904 命中,新建三件套零误报;Codex home skill force 同步(旧副本已备份)。**dogfooding 副产**:本任务自身三件套用新纪律书写时,heredoc 追加撞出模板段序坑(回顾节挡文件尾),当场发现当场修(F-027),模板已同步。

验证:`worklog selftest`(13 套)、`check`/`index check` 双门 exit 0;scrollery 消费仓冒烟(只读体检,未落写)。范围外事项——E 单文件轻模式(<5 步跨会话任务的建套判据补档)、P2 `worklog resume`(机械拼接续包子命令)——均记 task_plan「目标」段留后续轮,待新纪律实跑几个任务、残余税可量化后再裁是否值得做。scrollery 消费仓的 skill/模板副本同步(`worklog upgrade`)是跨仓操作,留用户或下次 scrollery 会话执行,不阻塞本仓收口。
