---
status: active
type: working-memory
line: 全面深度Review
created: 2026-08-09
---

> **历史档案(2026-09-19 退役)**:本文件属旧文档体系,已退出当前入口,仅为回溯保留。
> 现行文档与规则见 [docs/README](../../README.md);旧命令已不能运行,旧相对链接可能失效。


# 进度日志:全面深度Review

<!-- 验证行怎么填(F-005):门禁末行须在**全部内容落盘后**才跑得出来——顺序是
     先写占位 → 跑门 → 回填真实末行(改动了再复跑)。别倒过来抄一行旧输出充数。 -->

## 前情(接续先读这段,≤10 行;旧会话细节在 progress-archive.md)
- 当前:阶段 8 已完成；15 项原修复及其 Review 反馈均已回归，未执行收口/提交。
- 未解错误:无代码阻塞；个人 Codex home 未安装 planning SKILL，故 `npm run skills` 报 missing（未擅自写仓外 home）。
- 关键指针:findings.md 为逐项核销与残余风险；task_plan.md 为已完成分工/验收契约。
- 工作树边界:保留用户既有 `README.md` 修改与未跟踪 `.vscode/`，施工不得触碰。

## 回顾(收口时填;置于会话段之前——文件尾留给最新会话段,新段追加到末尾)
- 亮点:<什么做法值得复用>
- 教训:<什么坑值得预警>
- 意外:<什么假设被现实推翻>

## 会话:2026-08-09
- 做了:完成全仓架构/代码/测试/CI/发布/安全工具审计；为关键候选构造临时探针并在验证后删除，产品源码零改动。
- 验证:14 套 selftest、仓 check/index、skill check、tgz release-selftest、token-audit selftest、npm pack、sync scan-only 均绿；另复现 upgrade 越仓、status 假绿、sourceRoots 崩溃/越界、closeout 假绿、链接漏报/误报、null 配置崩溃、嵌套 hash 失败。
- 遗留:无审计步骤遗留；是否修复及优先批次由用户裁决。

## 会话:2026-08-13
- 做了:接续三件套并把只读审计计划扩展为全量修复计划；按文件边界编排路径/配置、门禁语义、事务/工具链三条并行施工线；已完成第一轮整合审查并回推旧版配置梯子、干净 CI 与已安装包自检兼容问题。
- 验证:最终 `npm run selftest` 17 套全绿；check 98 docs/5 code、index、config/upgrade/docs/token/sync-fs 专项、release `--full` 与明确 tgz、scan-only 164 文件、语法/diff 检查全绿；`npm run skills` 仅因个人 home 未安装 SKILL 失败，代码侧 install-skills selftest 已绿。
- 遗留:无施工项；未按推断执行收口、提交或个人 skill 安装。
- 追记:采纳 Review 反馈，新增 schema v6 与 v5→v6 无损梯子；当前权威改为显式 status role；repo 落点拒绝 symlink 逃逸；缺失 source root 恢复为安全空集；链接 parser 补齐引号/转义边界；README 与设计契约同步。定点与全量验证均绿。

## 会话:2026-08-14(第二轮全仓复审)
- 做了:在上一轮 15 项修复全数复核在位的基础上,另起全仓深读——5 路并行子代理(check-docs+gate / upgrade / 产品命令+索引 / 工具链+CI+模板+i18n / 文档契约)各产出带证据发现,主代理自读全部 lib 层与关键命令,并对全部 P1/P2 指证逐一运行反证(探针均建于系统 TEMP,仓库零改动)。
- 验证:check/index 绿;`npm run selftest` **红**(R2-01:本机 npm 11.19 + 用户级 allow-scripts 配置经 `npm run` 注入 env,release-selftest 消费仓 install 撞 EALLOWSCRIPTS——直接跑 release-selftest 绿,置空 env 即绿,已闭环根因);skills 仍仅因个人 home 未装 SKILL 失败(已知)。
- 遗留:26 项新发现入 findings.md(R2-01~R2-26,4 P1 / 10 P2 / 12 P3),**均未 consumed**;是否修复及批次由用户裁决。上轮收口/提交仍未执行。
- 追记:本轮 P1 均以最小探针复现(R2-01 环境机制闭环;R2-02 自定义态双活假绿;R2-03 todo 横幅前置毁 frontmatter;R2-04 重名分节正文丢失)。

## 会话:2026-08-14(P1 批次施工)
- 做了:按用户裁决先修 P1 四件,各带回归:
  - R2-01:release-selftest 的 npm() 统一清洗 npm_config_allow_scripts/NPM_CONFIG_ALLOW_SCRIPTS(delete 而非置空);聚合器以**敌意 env** spawn 该套件作回归——有人撤清洗即红。
  - R2-02:checkGraphInvariants 的「被取代与现役互斥」接入 authoritativeStatuses(CURRENT = draft ∪ authoritativeStatuses,draft 为 legacy 兼容);canonical 语义逐态探针验证不变(active/draft 仍拦,snapshot/superseded 仍豁免),新增自定义当前态精确 fixture。
  - R2-03:todo 退役横幅无 H1 时经 insertBannerAfterFrontmatter 落 frontmatter 收栏之后(FM_DELIM_RE 同标,BOM/行尾保形);新增无 H1 回归(frontmatter 完整可解析 + 正文迁分片)。
  - R2-04:todo 同名分节正文**合并**进分片(migrated.set 改追加)并注记人工核;新增双分节回归(两节正文都在分片、todo 两节都改指路行)。
- 验证:「npm run selftest」**17 套全绿**(此前因 R2-01 必红);check/index 绿;node --check 四文件全过;R2-02 canonical 语义探针不变。
- 遗留:R2-05~R2-28(P2/P3)未动,待裁决;上轮修复与本轮修复均未提交。
