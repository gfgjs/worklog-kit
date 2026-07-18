---
status: snapshot
type: working-memory
line: P3多人软肋施工
created: 2026-07-17
---

# 进度日志:P3 多人软肋施工

## 会话:2026-07-17
- 做了:开线(三件套 + 线实体 + status 分片);阶段计划六段定稿(工具债 → 写模型设计 → 唯一性/owner → events/closeout 命令 → CODEOWNERS/CI → 验收)。
- 验证:双门绿(`check` 34 文档 / `index check` 双向一致,双 exit 0)。
- 遗留:阶段 1 施工。
- 追记(阶段 5+6 完):阶段 5 `aa2b845`——本仓 CODEOWNERS(治理面+归档区,占位 handle 待远程校正)+ init 全注释脚手架 + genCi 按档生成(brownfield 注入 baseline 报告步,占位符 gate selftest 钉住);阶段 6 验收——§4.3 软肋表七行逐条勾兑入 findings(机制/证据/before 读数;任务名唯一修法从「作者短标识」改走门禁已注明依据),三指标口径:R1 基线已回写,后续实践中测,events 档与 closeout 命令即取数面。六阶段全 done,待用户裁收口(F-012)。
- 追记(阶段 4 完,三批 commit):4A `b1d5a38` events 门禁——`classifyFile` 第四类 `event`(progress/ 子树零 frontmatter,D-027 落地)+ E2~E6 全组(定宽文法/两位 seq/Date.UTC 往返拦 13 月/作者∈成员/候选 ID 按模式分派单一实现 `checkCandidateId`/closeout owner 具名),三件齐判据修为按模式(R5-M1 与 E4 消互斥);4B `b60db23` 命令面——`worklog team`(迁移引导事件 seq 00 + 存量 ID 词边界改名 = E5 梯子)与 `worklog closeout`(F-013:翻转/迁移/登记/双门,判断件缺席拒、不 commit),`taskref.mjs` 共享解析与 BOM/行尾原位编辑,cliargs freePositional;4C `0835737` 聚合——timeline 产物(字典序=时间序,manifest 计 sha)+ STATUS 在施任务表 + doctor events 感知 + event 模板 stamp。验证:selftest 9 套全绿(check +19、cliargs +4、e2e +20、build +10 断言),e2e B6+B7 中文任务名/中文 owner 全链,本仓 index build 真产物在施表现身,双门绿。
- 追记(阶段 3 完):任务名唯一门 + E1 team 声明门落 `src/check-docs.mjs` `checkTeamAndTaskNames`(main 挂钩,--links-only 不跑):撞名比对=目录名剥日期前缀+NFC;E1=mode 枚举/team 必 owner/作者段字符集(`isValidAuthor`,与 isValidId 同源)/collaborators 死配置拦;文案 5 键入 zh catalog(taskNameDup 引 R1「4 处 add/add」读数)。五条 team 规则并入 D-013 教义钉(不可 baseline)。验证:selftest +11 例(含 NFD 假名负例、中文作者正例)9 套全绿 exit 0;真 CLI 临时仓负例四规则全触发 exit 1;本仓双门绿(check 35 文档)。免 schema 升版按 D-028。
- 追记(阶段 2 完):写模型设计件落 `docs/designs/2026-07-17-team写模型events档与closeout命令.md`(authoritative,scope=实现契约;上位裁决仍在方案 §4.3)。要点:events 文件名文法 `<YYYYMMDDTHHMMSSZ>-<作者>-<NN>.md`(定宽+两位 seq 保字典序,作者段允许中文/含连字符,贪婪解析两端定界);事件零 frontmatter(D-027,文件名即 F-004 作者真源);候选 ID team 文法 `F-<作者>-NNN` 且作者 ∈ {owner}∪collaborators,closeout 全覆盖不变量零改动;`worklog team` 迁移命令(progress.md 整搬引导事件 seq 00 + 存量候选 ID 重命名梯);E1~E6 门禁组逐条挂 R1 before 读数,候选账冻结复用既有全覆盖门零新码;`worklog closeout`(F-013)只收机械步、不 commit、权限提示即收口按钮;schemaVersion v5 全程不动(D-028)。候选决策 D-027/028/029 入 task_plan 决策表。
- 追记(阶段 1 完):五债全清——F-001 新增 `src/lib/cliargs.mjs` 中央参数兜底(全命令 allowlist;upgrade F-010 范式的提升),F-002 init dirs 实况派生 + 非空目录不塞 .gitkeep,F-003 reportViolations 分列 enforced/exempt、总行只数强制,F-005/F-006 模板注释・runbook・index 绿文案。验证:`worklog selftest` **9 套全绿 exit 0**(新增 cliargs 套 14 例;gate +3 断言;e2e +5 断言);真 CLI 复证 `init --help` exit 0 零写入、`init --halp` exit 2 零写入(F-001 病灶正反例)。验证场线 status 分片 5 条待办销账。

## 回顾(收口时填)
- 亮点:六阶段单日走完,每批 selftest 9 套 + 本仓双门绿后才 commit(8 commit 全绿账);e2e B6+B7 消费仓全链用中文任务名 + 中文 owner 走通 solo→team→closeout;R5-M1「归档三件齐」×E4「team 无 progress.md」契约互斥在 fixture 现形当场修(三件齐判据按模式取承载)。
- 教训:文档回写两次自纠——「七阶段」笔误、selftest 断言计数凭印象编造(改为指回逐批 commit 记账):数字要么现场量要么不写;e2e 大文件加断言撞同域 `const co` 重名 SyntaxError——同作用域补声明先查命名。
- 意外:候选账冻结零新码(closeout.md 在场 + 全覆盖不变量天然咬合,原以为要新门);CODEOWNERS 无远程即零强制力(review 面与 D-006 hosted CI 同一等待面),有牙齿的只剩 E6 门 + 命令前置检查两层。
