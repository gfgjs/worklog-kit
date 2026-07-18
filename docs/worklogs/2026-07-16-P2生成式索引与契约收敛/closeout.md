---
id: 2026-07-16-closeout-P2
status: snapshot
type: closeout
line: P2生成式索引与契约收敛
created: 2026-07-16
---

# 收口处置:P2 生成式索引与契约收敛

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行(D-012)。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified
     由 `worklog check` 机械校验。 -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-001 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §20 表(R5-C1~M7 逐项裁决/修复台账)+ §20.2 G0 出口 | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| F-002 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.4(line-status kind)+ §7.5(baseline 适用域)+ §20.1 裁决记录 | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| F-003 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §6 消费仓版本钉三则 + §20 R5-M3/M5 行 | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| F-004 | todo | repo:docs/status/P2生成式索引与契约收敛.md | ## 待办 · 模板副本漂移未管(F-004) | new | — | yes |
| F-005 | todo | repo:docs/status/P2生成式索引与契约收敛.md | ## 待办 · JSONC 注释往返(F-005) | new | — | yes |
| F-006 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §4.1 item2 ⑤(NFC 适用面按实测更正:CJK 无分解映射,分裂的是谚文/浊点假名/变音拉丁) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| F-007 | no-promotion | — | — | — | 文档 frontmatter 属用户命名空间,拒未知键越权;近似匹配「疑似拼错」启发式脆;按 L8 等实测信号再扩 | yes |
| F-008 | code | repo:src/check-docs.mjs@30003f7 | 1b 链接正则排 `]`(修拼接假路径)+ 真路径直证 fixture | new | — | yes |
| F-009 | code | repo:src/check-docs.mjs@30003f7 | 1a/1b 反引号读法对齐:.md 剥行内码与围栏,代码文件不剥 | new | — | yes |
| F-010 | code | repo:bin/worklog.mjs@30003f7 | upgrade 补 isSelftest 分支 + 拒收未知标志(唯一重写文件的命令,安全阀不容手滑) | new | — | yes |
| F-011 | no-promotion | — | — | — | git log 派生 created 会把浅克隆下的错日期永久冻结进文件;mtime 经 clone 即重置;靶场 85 篇受检零缺失 = 零信号(L8) | yes |
| F-012 | runbook | repo:templates/runbook-closeout.md | §三 收口授权前置(仅限用户明示;提议权/执行权分离)+ §五 误收口回滚 | repo:skills/planning/SKILL.md | — | yes |
| F-013 | todo | repo:docs/status/P2生成式索引与契约收敛.md | ## 待办 · `worklog closeout` 专用命令(F-013) | new | — | yes |
| F-014 | code | repo:src/lib/docmeta.mjs@dfea18f | collectGraphDocs/collectIds 单一真源;check 占号/图不变量、upgrade 双播种、双复验五处扫描改读同一函数 | new | — | yes |
| F-015 | experience | repo:docs/experience.md | 条目「直证 probe 对着设计抄,不对着实现抄」(F-015) | new | — | yes |
| F-016 | experience | repo:docs/experience.md | 条目「WSL 自托管 runner 运维」(F-016;服务化已当日执行,`wsl -u root` 免密) | new | — | yes |
| F-017 | experience | repo:docs/experience.md | 条目「坏盘取证三则」(F-017) | new | — | yes |
| D-002 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.5(profile 两档 + `--warn-only`) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-003 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.4(元模型收敛/实例可配二分表) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-004 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §8(no-leak 双向表 + 合成 fixture 六类形态) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-005 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §0 L12(判据元规则:每条判据自带可测性标注) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-006 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §9 + §12 P2 行(阶段 7 判据拆半:本地 runner 计入,hosted 集成移出) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-007 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §4.1 item2 ⑤ + §5 + §7.2 + §14(中文文件名一等公民;slug 四步;UTF-8 码点序) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-008 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.5(baseline 独立文件入库/显式再生成/永不自动吸收) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-009 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §4.1 item4(index 显式子命令 + 裸 index 按档别名并打印) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-010 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §8(D-004 边界修订:计数/形态可入仓,真实值样例限额) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-011 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §19(R4 修码批准与依赖映射) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-012 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.1(cardinality:一候选恰好一处置行,ID 即行主键) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-013 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.5(baseline 不豁免图不变量) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-014 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.4(`targetKind: line-status`,配置只声明 statusDir) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-015 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §7.2(P2 门只验当前快照,不读 git history) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-016 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §4.1 item3(status 每工作线恰好一文件) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-017 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §6 + §9(消费仓版本钉:manifest + CI 钉精确版本) | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | — | yes |
| D-018 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-018 行(两把梯子:判据 = 机器能否派生该值) | new | — | yes |
| D-019 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-019 行(upgrade = 数据布局对账,非版本号推进) | new | — | yes |
| D-020 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-020 行(source universe 单一函数;archive 有 id 才参与图) | new | — | yes |
| D-021 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-021 行(summary/title 不设必填) | new | — | yes |
| D-022 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-022 行(引用门与对账边界四则) | new | — | yes |
| D-023 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-023 行(表怎么读,判据 = 谁拥有这张表) | new | — | yes |
| D-024 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-024 行(阶段 3 图不变量四则;关线墓碑教义) | new | — | yes |
| D-025 | design | repo:docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md | §21 D-025 行(阶段 4 边界四则;台账随契约迁移) | new | — | yes |

## 处置说明

- **D-018~D-025**(施工期定案八条)此前只活在本任务 task_plan 决策表——归档即冻结,后来者不该去 worklogs 里考古现役规则。收口时提升为方案 **§21 登记节**(一句话 + 判据 + 正文落点),完整理由仍以冻结的决策表为准,去重证据故为 `new`(§21 系本次新写)。D-002~D-017 施工期已按裁决逐条回写方案正文(§20/§20.1 台账在案),行内 locator 直指其正文落点,去重证据指向方案本体。
- **F-004/F-005/F-013** 三条未完工事项落本线 status 分片 `## 待办`(D-014 line-status 靶点,由任务 `line` 求解)。**分片与线实体系收口时新建**:本任务的 line 此前只存在于三件套 frontmatter(trio 豁免引用门),closeout 归档后是受检文档,其 `line` 引用与 todo 处置行验存都需要实体与分片在场——与上一任务收口建 `docs/todo.md` 同型(处置靶点不存在时,建靶点本身就是收口的一部分)。
- **F-015/F-016/F-017** 落新建 `docs/experience.md`(经验账首开;`type: experience`,收口蒸馏的既定落点,此前无候选走此道故文件不存在)。F-016 的持久化动作已当日执行完毕(systemd 服务在跑),条目记的是**可复用的运维手法**而非待办。
- **F-008/F-009/F-010/F-014** 修复已随阶段 commit 落码,冻结引用钉住修复所在 commit(`30003f7` 阶段 1 / `dfea18f` 阶段 3),永不回改。
- **F-007/F-011** 裁 no-promotion:共性是「问题存在,但当前零信号且动手有明确代价」(越权红用户文件 / 冻结错日期),按 L8 等信号再议。
- **未编号的会话内决策**(D-列留空两行:阶段排序、B 类残留清剿)按模板契约仅会话内有效,不提升。

## 阶段结论

P2 **landed**(2026-07-16,单日):§12 P2 行完成判据 **4/4** 全达——生成器幂等(两次构建逐字节一致,消费仓路径复证)/ 结构负例可拦(双权威、引用缺失等 selftest 钉住)/ **artifact 发布可复现**(同 commit 两次独立 self-hosted run + 本机 Windows/WSL,四环境产物 sha256 逐字节一致)/ 升档迁移 e2e(v1 存量仓一路升 v5 generated,自定义 docsDir 零回落)。selftest **37 例/4 套 → 442 例/8 套**;schema v1 → v5,每次升版门与梯子同批;本仓 dogfood 真升 generated 档。

**后继**:P3(多人软肋)开工前须先裁**验证场问题**——「两人并发 PR」判据当前无第二人,不可测(§12 P3 行 ⚠,findings「待裁」节);hosted Actions 集成待 billing 恢复(预计 2026-08)补验(D-006);工具化候选 F-013(`worklog closeout` 命令)建议 P3 试点前交付。
