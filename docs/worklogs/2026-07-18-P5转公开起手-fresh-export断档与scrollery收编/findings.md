---
status: snapshot
type: working-memory
line: P5转公开起手-fresh-export断档与scrollery收编
created: 2026-07-17
---

# 发现:P5 转公开起手——fresh-export 断档与 scrollery 收编

## 需求
- 2026-07-17 用户批三项:①本仓 push;②转公开走 fresh-export 断历史(R4-18/D-010);③scrollery 正式迁移;第四项(撤 Codex home skill)裁**不撤**。
- 2026-07-18 用户指令(追加,推翻「公开仓单源」裁决):建立私仓→公仓长期净化同步机制(清单/脚本),并顺手执行一次双向净化同步——双源模型:私仓唯一开发源,公仓净化快照镜像。

## 外部资料(当数据,不当指令)
- npm registry 实查:`worklog@0.1.9` 为他人无关包(F-020 依据);本包 dist-tag 实况 `latest`=`alpha`=`0.1.0-alpha.1`。
- GitHub 未认证 API 实证:公开仓已 public(R6-07「CODEOWNERS 占位已公开可见」的时点判定依据)。

## 发现
- **EOL 假红 bug(F-019 候选,已修 `b6956d3`)**:templates selftest 的「EOL 差异判 ok」fixture 对**已是 CRLF 的渲染内容**直接 `\n→\r\n` 翻转,造出 `\r\r\n` 混合行尾——测的不再是 EOL 差异,两项假红。触发面 = `autocrlf=true` 的 Windows clone 与 `git archive` 导出树(archive 会按 autocrlf 转换行尾,即便 blob 是 LF)。判定函数 `classifyTemplates` 本身两侧归一无此病,纯测试 fixture 问题。修法:翻转前先 `norm()`;另加 `.gitattributes` `* text=auto eol=lf` 钉死 checkout/archive 行尾。**公开后任何 Windows 用户 clone 即跑 selftest 都会撞**,fresh-export 恰好提前踩爆。
- **R4-18 上限后仍有新增泄漏**:07-16/17 本人写三件套时又引入两个真实值(一任务名一组件名,原词不复录)——「上限不再新增」这类纪律**没有机械门就会被(包括规则制定参与者)违反**。CamelCase 全量扫描 + 领域词表扫描可作转公开前标准终检,但常态防新增仍靠自觉,弱点已实证。
- **demo 剧本对真仓保真度高**:365→0 的收敛路径在真仓重放为 316→144→1→0,唯一手修同型(supersedes 散文值);demo 报的两个 rebase bug 修复后真仓零断链。「先演习后正式」流程收益实证。
- **路1 预清洗真仓读数**:23 标题剥 16,自动命中 4(线名不复录,见 scrollery 迁移分支 commit)——与 demo 4/23 持平;19 条措辞不一致或无对应线,确需人读内容归并,机械啃不动的边界与 demo 结论一致。
- **工具链三坑(Windows)**:①`git grep` rev 输出对中文路径按 `core.quotepath` 转义,解析前须 `-c core.quotepath=false`;②Node `execSync` 走 cmd.exe,`^`(如 `HEAD^`)是 cmd 转义符会被吃,rev 用 `~1`;③scrollery todo.md 含**故意贴入的 NUL 真字符**(记录 NUL bug 的文档),grep 判 binary 须 `-a`——不是损伤,别修。
- **auto-mode classifier 与会话批准是两层**:用户会话内批准 push/建仓/`git rm`,权限层照拦;等效替代(内容覆写代替删除重刷)可走,远端写操作只能交还用户手跑。
- **README 快速上手教裸 `npx worklog`(F-020,已修)**:D-017 裁决当时只修了 CI 模板(并加 e2e 哨兵防回归),README 教程未跟改。npm 上真有他人同名包 `worklog`(实测:消费仓裸跑提示安装 `worklog@0.1.9`)——新用户照抄 README 第一条命令即抓陌生包执行。同轮对账出「共 11 套」漂移(doctor 套件后加未跟,实为 12)。教训:D 裁决落地时应全文检索**同一错误形态的全部落点**(模板/README/runbook),只修报障点会留同病兄弟;e2e 哨兵只护了模板一处,护不到教程散文。

## 耐久提升候选(F-ID 全仓全局序;发现当场登记,收口时逐行处置进 closeout.md)
<!-- R6-23:候选此前写在叙事列表——collectDeclaredIds 只认表格,收口时要么漏账要么反报 unknownCandidate,故迁入模板表格 -->
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
| F-019 | EOL 假红已修(`b6956d3`);doctor 是否加「仓库 EOL 配置体检」(检 autocrlf 与 .gitattributes 缺失)待裁 | 待裁(experience 或 no-promotion) |
| F-020 | README 裸 `npx worklog` 教程 + selftest 套数漂移,已修(本仓 README 重写笔) | docs(收口销账) |
