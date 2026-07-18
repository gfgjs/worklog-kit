---
id: 2026-07-17-P5转公开起手-fresh-export断档与scrollery收编-closeout
status: snapshot
type: closeout
line: P5转公开起手-fresh-export断档与scrollery收编
created: 2026-07-17
---

# 收口处置:P5 转公开起手——fresh-export 断档与 scrollery 收编

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行(F-019/F-020）。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-019 | no-promotion | — | — | — | EOL 假红 bug 本体已修(`b6956d3`:fixture 翻转前先 `norm()` + `.gitattributes` `* text=auto eol=lf` 钉 checkout/archive 行尾）；候选的 doctor「仓库 EOL 配置体检」(检 autocrlf 与 .gitattributes 缺失)属防线冗余——漏洞已被 gitattributes checkout 归一 + 干净导出树发包机械堵住,增强为第二道冗余非补漏,用户裁低优先/待定,门未锁死,未来可并入 doctor 完善任务(F-018 主流程 selftest)一并评估,故本任务不提升为独立后续 | yes |
| F-020 | experience | repo:docs/experience.md | ## 修一个报障点要扫同型全部落点(F-020) | new | — | yes |

## 处置说明

- **F-019** 裁 no-promotion:EOL 假红 **bug 本体已修**(`b6956d3` + `.gitattributes` 钉 LF),findings 已留触发面记录(autocrlf 与 archive 导出树)。候选的**增强**(doctor 加 EOL 配置体检)是防线冗余而非补漏——checkout 归一 + 干净导出树发包已堵主向量;用户裁**低优先/待定**,以 no-promotion 记录本任务不提升,门未锁死,未来可并入 doctor 完善任务(F-018)重开评估。此处置不预判用户对「做不做 EOL 体检」的裁决。
- **F-020** 提升进 `docs/experience.md`(disposition experience,靶点自报):`## 修一个报障点要扫同型全部落点(F-020)`——README 裸 `npx worklog` 教程 + selftest 套数漂移已修(本仓 README 重写笔),但可复用经验是「修一个报障点要扫同型全部落点(模板/README/runbook/散文),机械哨兵只咬结构面护不到散文」,按 F-ID 全局序锚定进经验账(R6-25)。dedup=new:现有经验条(F-008/015/016/017/021)无同条,F-015 的「同型病」讲被关掉的检查掩护 bug,与「全文检索同型落点」不同轴。
- **候选编号疆域**:F-019/F-020 自发现即取全仓全局序(R6-23 已将候选从叙事迁入 findings 表格,`collectDeclaredIds` 只认表格,叙事提及不进声明集)。

## 阶段结论

P5 转公开起手 **landed**(2026-07-18 全阶段销账;用户批收口)。四阶段:**阶段 1** no-leak 值样例合成化(`1aeb166`/`7333670`:R4-18 六值 + 代码 fixture 违 D-004 两处换净 + 上限后漏网真实任务名/组件名清除 + 私仓名泛化,密钥/邮箱/用户名扫描零命中)。**阶段 2** fresh-export 建档(`git archive HEAD` → 公开仓单根 commit,作者 `gfgjs <gfgjs@users.noreply.github.com>`,QQ 邮箱问题随断档消解;导出树 selftest 12 套 + check + index 全绿 + 私料终检零命中 98 文件;途中挖出并修 EOL 假红 bug `b6956d3` + `.gitattributes`)。**阶段 3** scrollery 正式迁移(分支 `feat/worklog-kit-migration`,`2a9f376`/`07372b9`:枚举 ASCII 化 160 篇 + init/upgrade 对账 54 线实体播种 + baseline;todo 预清洗 16/23 + generated 翻转 + 54 分片播种,双门绿 300 文档 + index build 正常)。**阶段 4** 远端操作(auto-mode classifier 拦 push/建仓,命令包交用户手跑;2026-07-18 四步——私史归档 push、公开仓建+转公开、alpha.1 重发布——均已由用户执行并实证:双端 main==origin/main、公开仓 public、npm latest=alpha=0.1.0-alpha.1)。

**追加交付(2026-07-18,推翻「公开仓单源」裁决):双源模型**——私仓唯一开发源、公仓净化快照镜像,机制落地 `tools/sync-public.mjs`(词表硬门 + 终检零命中 + 导出树门禁 + 快照覆写)+ `docs/runbooks/sync-public.md`(七条纪律)+ `.sync-blocklist.local.json`(gitignored 本地词表),首次净化同步已 commit+push。

验证:kit 仓 selftest 12 套全绿 + 双门 exit 0;导出树 selftest/check/index 全绿 + 私料终检零命中;scrollery 双门绿(check 300 文档 / 143 豁免 + index 不变量 + build)。**遗留(不阻收口,归 status 分片继续跟)**:①scrollery 19 个 todo 分节人工归并;②迁移分支 `feat/worklog-kit-migration` 合回 dev 待用户裁;③双源同步为常态运维,后续按 runbook 走。
