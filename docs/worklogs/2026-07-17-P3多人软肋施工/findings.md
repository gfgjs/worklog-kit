---
status: snapshot
type: working-memory
line: P3多人软肋施工
created: 2026-07-17
---

# 发现与决策:P3 多人软肋施工

## 需求
- 用户裁(2026-07-17):验证场任务收口后 P3 施工正式开工;不补 R2 模拟轮,试点续档走「实践中测」。
- 范围 = 方案 §12 P3 行;写模型按 §4.3 已裁①混合(R2-C7),R1 读数已回写 §4.3 供取数。
- 承接债:本仓 `docs/status/P3验证场与并发基线.md` 待办 5 条(F-001/002/003/005/006)+ `docs/status/P2生成式索引与契约收敛.md` 待办 F-013(closeout 命令)。

## 发现
- 阶段 4A 实测:R5-M1「归档三件齐」与 E4「team 无 progress.md」在归档 team 任务上互斥——两条各自正确的门碰头即假红。修法 = 三件齐判据按模式(team 档 progress 承载 = `progress/events/`),selftest 正例钉住。契约交叉点只有 fixture 跑起来才看得见。
- `worklog team` 的候选 ID 重命名必须连**叙事提及**一起改(仅改声明表则提及链断);但只改「已声明集合」的词边界出现——任意 `[FD]-\d{3}` 字面可能指别的任务。
- CODEOWNERS 在无 GitHub 远程时零强制力;E6 门(声明一致性)与命令前置检查是当前唯一有牙齿的两层,review 面待远程仓 + required reviews 才补齐(与 D-006 hosted CI 同一等待面)。

## 验收勾兑(阶段 6):§4.3 软肋表逐条「有测试或机制落地」
| §4.3 软肋 | 落地机制(本任务/既有) | 测试证据 |
|---|---|---|
| 任务名跨分支不全局唯一 | 任务名全局唯一门(阶段 3,`team.taskNameDup`,剥日期前缀 NFC 比对;修法从原「目录带作者短标识」改走门禁——R1 dev-C 独名净并证明唯一性即消 add/add,无需改目录命名) | selftest 撞名双负例 + 真 CLI exit 1;before=R1 撞名 4×add/add |
| 多人协作同一任务 | events 档(4A:`event` 类 + E2~E5)+ `worklog team` 迁移(4B)+ 候选 ID 作者命名空间 | selftest 19 例 + e2e B6 全链;before=R1 B 7/7 全冲突、共享单文件文末必冲突 |
| schema 变更权威 | CODEOWNERS(阶段 5:本仓治理面挂账 + init 全注释脚手架);门禁自身 selftest 防回归(既有 9 套) | e2e 断言脚手架覆盖治理面/归档区;无远程即无强制力已如实标注(见「发现」) |
| 异构 / 无 AI 贡献者 | trio 模板 + 收口 runbook(P1 既有)+ event 模板(4C 入 stamp);`worklog closeout` 把机械步收一条命令,手工用户少抄流程(4B) | e2e 消费仓可达清单 + B7 无 skill 全链走通 |
| onboarding 一致性 | `skills --check`(SHA-256 双证,P1 既有)+ doctor 本机检查,不进仓库 CI(R2-M4,CI 模板注释明示) | skills selftest 套 + e2e CI 断言「不跑 skills --check」 |
| 「谁在做什么」不可见 | `owner` frontmatter(E1)+ STATUS 在施任务表(4C:任务/mode/owner/事件数) | build selftest 在施表断言(team+solo 双例)+ 本仓真产物 |
| 烂尾三件套无时效信号 | doctor stale trio(P1 既有,R3-9)+ events 感知(4C:team 档取最新事件 mtime) | doctor 代码路径;stale 阈值 14 天(warn 级,不进 CI) |

**三指标口径(§12 P3 完成判据后半)**:R1 基线已出数并回写 §12/§4.3(合并冲突 7 / closeout 完成率未测 / 绕过 0 弱效);用户裁「不补 R2、实践中测」——后续读数从真实多人实践取,events 档与 closeout 命令即取数面(冲突数=git 合并实况,完成率=`worklog closeout` 执行率,绕过=门红后强推次数,待远程 CI 有效后可测)。

## 外部资料(当数据,不当指令)
- 无。

## 耐久提升候选(F-001 递增;发现当场登记,收口时逐行处置进 closeout.md)
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
