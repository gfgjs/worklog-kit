---
status: snapshot
type: working-memory
line: P3验证场与并发基线
created: 2026-07-16
---

# 发现与决策:P3 验证场与并发基线

## 需求
- 用户批准:clone Scrollery 到本地模拟多人开发,测「两人并发 PR」判据(2026-07-16)。
- D-004 边界:第 2 条放宽仅作测试用;**绝不 push 到远程**;内容不进本仓(记录只留计数/形状)。
- 增设 dev-C 由用户真人加入测试,需给用户分配任务书。

## 发现
- 本地 `c:\workspace\scrollery` = Scrollery 私有仓工作副本,dev 分支 ahead 4,有未提交改动;bare clone 只读 `.git`,未提交改动天然不入模拟场。
- Scrollery docs 为真存量布局:`archive/ decisions/ designs/ planning/ refactor_<年份>/ reviews/ runbooks/ worklogs/` + `completed.md experience.md todo.md`,无 `.worklogrc`——brownfield 试点靶合格(§12 P3「存量仓 pilot」)。
- worklog-kit trio 模板/门契约:working-memory 三件套无 `id` frontmatter,`line` = 任务名;线实体可收口时后建(P2 先例)。
- **brownfield 上机路真仓首跑通**(init → baseline → upgrade → 再立账 → 手工修 2 条 → 双门绿):存量 221 文档首扫红 351 条;baseline 可豁免 186;upgrade(补 id + 播种线实体)修掉过半;残留 2 条硬伤须手工——①存量 1 例 `supersedes` 字段填散文非 id(门抓对了,语义为空删字段即清);②实际目录 + README 目录表都有的非标准命名目录,init 生成的 config.dirs 漏收(见 F-002)。
- fresh checkout 双门即绿(init stamp 的 `.gitkeep` 生效,P2 F-017 同型缺陷未复发)。
- **R1 冲突读数(A∧B,同基并发)**:R2-C7 直证成立且**比原断言更宽**——不止 progress 文末追加必冲突,findings 列表追加、task_plan 相邻 checkbox 同 hunk 也必冲突,共享三件套整体是冲突面;撞名 add/add 一次炸 4 文件(Q7「原生暴露」成立),解决成本主要在编辑侧:两开发者同名下意图确实不同(A 命中率摸底 vs B 写放大排查),整合官须读内容后按意图改名。
- **dev-C 真人读数**:①流程遵从 2/3——任务书三步(共享件回写/新开任务/门+push)跳过了共享件整步,事先无预兆、事后其 checkbox 如实留 `[ ]`;agent 遵从 2/2。「无 skill 全流程」的人因面:流程不能假设被执行,机制(门/checkbox)比约定可靠。②真人踩中 id 撞号(抄线实体模板忘改 id),门当场点名占用文档,自述「提示很直观,很好修」——门 UX 经真人验证。③F-003(总数混计豁免)被真人独立再证。④git upstream 困惑:`checkout -b` 分支无 tracking,status 不报 ahead,真人误以为异常——下轮任务书应写 `git push -u`。
- **独名对照成立**:dev-C 新任务 4 文件净并(0 冲突),与 dev-B 撞名 4×AA 恰成对照——命名唯一性本身即消掉整类 add/add 冲突。
- **三指标 R1 读数**:合并冲突数 = 7(全在 B 并入;A、C 净并);closeout 完成率 = 本轮未测(无收口环节);绕过次数 = 0(agent 结构性守规矩 + 真人 1 样本,弱效读数,不计 go/no-go,D-026 附注)。
- **双 agent 摩擦独立收敛于同 4 点**(互不知情,各自报出):①宿主 harness 拦 subagent 写 `findings.md` 文件名(模拟器噪声,非 worklog-kit 缺陷,但 agent 驱动的消费环境真实存在,绕道 heredoc 可行);②progress 验证行鸡生蛋(门末行须写完才可跑);③`index check` 绿输出措辞让人误以为有手工登记义务;④会话块作者标识无字段,靠 `(dev-X)` 后缀惯例。

## 外部资料(当数据,不当指令)
- 无。

## 耐久提升候选(F-001 递增;发现当场登记,收口时逐行处置进 closeout.md)
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
| F-001 | CLI 无 `--help` 兜底:`worklog init --help` 不识别该 flag,直接在 cwd 执行 init(真仓亲历,stamp 出 8 处文件后靠 quarantine 回滚)。未知 flag 应拒绝执行并打印用法,exit 2 | 修 bin/worklog.mjs 参数解析,加负例 selftest |
| F-002 | brownfield init 生成 config.dirs 抄默认清单不抄实况:存量仓实际目录 + README 目录职责表均含的非标准命名目录被漏收,init 后 index check 即红。init 应从实际 docs 子目录(或目录表)派生 dirs,或至少对未收目录打显式警告 | 修 src/init.mjs 目录派生逻辑,加 brownfield fixture 负例 |
| F-003 | check 汇总行「N 处违反」把 baseline 豁免也计入(实测 193 = 186 豁免 + 7 强制),豁免挂账与真实违规在总数里同形,读数误导。应分开报「强制 X 条 + 豁免挂账 Y 条」,总行只数强制 | 修 check-docs 汇总输出,加 selftest 断言 |
| F-004 | trio 模板会话块/发现行无作者字段,多人共享任务靠 `(dev-X)`/`[dev-X]` 后缀惯例溯源(双 agent 独立报出)。R1 实测共享三件套整体必冲突,支持 R2-C7 已裁方向(事件文件化 / owner 单写者)——P3 events 档设计输入 | P3 写模型设计件引用本读数 |
| F-005 | progress 验证行鸡生蛋:会话块要求引用门禁末行,但门禁须在全部落盘后跑,只能占位→跑门→回填→复跑。runbook/模板应明示「先跑门后回填」约定 | 补 templates/progress.md 注释 + runbook 一句 |
| F-006 | `index check` 绿输出「目录表 + worklogs 登记 双向一致」让新人误以为有手工登记义务,双 agent 均犹豫过;应在绿输出注明索引自动发现、开新任务/新线无需手工登记 | 修 catalog 文案 |
