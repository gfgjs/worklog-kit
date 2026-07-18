---
status: snapshot
type: working-memory
line: P3多人软肋施工
created: 2026-07-17
---

# 任务计划:P3 多人软肋施工

## 目标
交付方案 §12 P3 行全量范围:同任务 team 写模型(events 档,§4.3 已裁①混合)、owner/collaborators、任务名唯一、CODEOWNERS、merge-queue 要件化 CI(`merge_group`)、按 profile 生成 CI(R2-M4)。**用户裁(2026-07-17):验证场任务收口后正式开工**;R1 并发基线已出数(冲突面 = 共享三件套整体,B 7/7;台账 `docs/worklogs/2026-07-17-P3验证场与并发基线/`),每个机制均有 before 读数。

**完成判据(§12 P3 行)**:软肋逐条有测试或机制落地;试点三指标数据——R1 基线已出,后续按用户裁「实践中测」续档(不再补模拟轮)。

## 当前阶段
已收口(2026-07-17,用户明批)。本收口即 `worklog closeout` 首次真枪 dogfood。

## 阶段

### 阶段 1:工具债清偿(试点 UX 债,验证场承接)
- [x] F-001:CLI 未知 flag 兜底——新增 `src/lib/cliargs.mjs` 中央 allowlist(全命令;`--help`/`-h` 永不执行,未知参数 exit 2 + 用法),upgrade 局部拒收保留作纵深;14 例负例 selftest + 真 CLI 双证(`init --help` exit 0 零写入 / `--halp` exit 2 零写入)
- [x] F-002:init dirs 实况派生——无既存配置时收编 docsDir 实际子目录进 config.dirs(RC_DIRS_LINE 字面量替换,gate selftest 钉住);已有配置 = 用户真源不改、未收目录显式告警;顺手修:既存非空目录不塞 .gitkeep;e2e B5 双负例
- [x] F-003:汇总分列——reportViolations 返回 enforced/exempt 分列计数,docs.fail/index.fail 总行只数强制、文案注明豁免另列;gate selftest 2 断言
- [x] F-005:templates/progress.md 注释 + 收口 runbook 各补「先跑门后回填」一句
- [x] F-006:index.pass 文案注明登记由门自动比对、开新任务/新线无需手工登记
- [x] 承接源(status 分片待办)销账(5 条收束为清偿记录,指回本任务)
- **状态:** done

### 阶段 2:写模型设计件(events 档细化)
- [x] events 档设计:设计件落 `docs/designs/2026-07-17-team写模型events档与closeout命令.md`(authoritative,scope 限实现契约)——文件名文法(定宽 UTC 时间戳-作者-两位 seq,字典序即时间序)、事件零 frontmatter(D-027)、`mode: team`+owner/collaborators 落 task_plan frontmatter(trio 豁免区,元模型不动)、候选 ID 作者段文法与成员集合值域、`worklog team` 迁移命令(含存量候选 ID 重命名梯)、E1~E6 门禁规则组(逐条挂 R1 before 读数)、timeline/STATUS 聚合;schemaVersion v5 不动(D-028)
- [x] F-013(P2 线遗留):`worklog closeout <任务>` 命令设计并入(设计件 §6)——只收机械步(status 翻转/git mv/README 登记/双门复验),判断件仍前置人写;不 commit,权限提示即收口按钮;cliargs 需扩自由位置参数档(D-029)
- **状态:** done

### 阶段 3:机制施工 A——任务名唯一 + owner/collaborators
- [x] 任务名(线名)全局唯一门——`checkTeamAndTaskNames`:planning+worklogs 任务目录名剥日期前缀 NFC 归一后全局比对(不剥则开工日/收口日前缀让复用旧名永不暴露);线名唯一已由 lines/ 文件系统承担,免另门
- [x] `owner`/`collaborators`——按设计件 D-028 免 schema 升版(owner 已在 DOC_FIELDS,mode/collaborators 住 trio 豁免区):E1 门落地(mode 枚举、team 必 owner、作者段字符集 isValidAuthor、solo 声明 collaborators=死配置拦);新门零存量即无梯,并入 D-013 教义钉(五条 team 规则结构上不可 baseline)
- **状态:** done(selftest +11 例;真 CLI 负例四规则全触发 exit 1;本仓双门绿)

### 阶段 4:机制施工 B——events 档 + closeout 命令
- [x] team 模式 trio(4A,b1d5a38):`event` 文档类(progress/ 子树全域豁免,契约在文件名)+ E2~E6 门(文法/NFC/Date.UTC 往返/成员集合/候选 ID 按模式分派/closeout owner 具名);三件齐判据按模式(team 档 progress 承载 = events 目录);(4C,0835737)index build 产 timeline/<任务>.md + STATUS 在施任务表(mode/owner/事件数);doctor stale 判据 events 感知;templates/event.md 进 init stamp
- [x] 档间迁移(4B,b60db23):`worklog team <任务>`——mode/owner 声明写入、progress.md 整搬迁移引导事件(seq 00)、存量裸候选 ID 词边界补作者段(E5 门梯同批);--dry-run 零写入
- [x] `worklog closeout <任务>`(F-013,4B):机械步收敛(status 翻 snapshot/归档迁移「收口日-任务名」/README 登记/尽力 git add/进程内双门复验);判断件缺席拒执行、E6 起跑线拒、不 commit(权限提示即收口按钮);cliargs freePositional 档
- **状态:** done(selftest 9 套全绿,e2e B6+B7 消费仓全链中文名走通;真 CLI 冒烟 + 本仓真产物)

### 阶段 5:CODEOWNERS + 按 profile 生成 CI
- [x] 治理 schema/门禁脚本挂 CODEOWNERS(`aa2b845`):本仓 `.github/CODEOWNERS`(治理面+归档区,占位 handle 注明待远程校正);init stamp 全注释脚手架(不知账号不写活行);无远程即无强制力如实入 findings
- [x] 按 profile 生成 CI(R2-M4):genCi(config)——头注写实际档,brownfield 注入 `worklog baseline` 报告步(恒 exit 0 只报不改账),strict 无此步;占位符 gate selftest 钉住;`merge_group` 系 R2-C6 既有,e2e 补钉;hosted 集成仍按 D-006 待 billing
- **状态:** done(selftest 9 套全绿;e2e strict/brownfield 双档断言)

### 阶段 6:验收
- [x] 软肋表(§4.3)逐条勾兑「有测试或机制落地」——七行全勾,勾兑表入 findings(含机制、测试证据、before 读数;任务名唯一的修法偏离原「作者短标识」已注明依据)
- [x] selftest 全绿(9 套 exit 0;阶段 1~5 每批新增的正负例均已挂门,逐批 commit message 记账);三指标口径写入 findings:R1 基线已回写 §12/§4.3,后续实践中测,events 档与 closeout 命令即取数面
- **状态:** done

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 事件文件零 frontmatter,契约全在文件名(定宽时间戳-作者-两位 seq) | 过程件豁免哲学一致;文件名即作者机器真源(F-004 修复面),frontmatter 复写=双真源漂移;两位 seq 保字典序 | D-027 |
| P3 本设计范围 schemaVersion v5 不动 | 配置键/元模型字段零变更(owner 已在 DOC_FIELDS,mode/collaborators 在 trio 豁免区);新门零存量即无梯;引擎能力走包 semver | D-028 |
| 命令面新增两条:`worklog closeout <任务>`(F-013)与 `worklog team <任务>`(solo→team 迁移) | 机械步收敛+权限提示作收口按钮;mode 属任务级不属仓级 schema,不塞 upgrade;迁移含存量候选 ID 重命名(门梯同批) | D-029 |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
