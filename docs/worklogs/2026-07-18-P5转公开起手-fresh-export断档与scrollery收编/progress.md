---
status: snapshot
type: working-memory
line: P5转公开起手-fresh-export断档与scrollery收编
created: 2026-07-17
---

# 进度日志:P5 转公开起手——fresh-export 断档与 scrollery 收编

## 会话:2026-07-17
- 做了:no-leak 值样例合成化(`1aeb166`/`7333670`)→ EOL bug 修复(`b6956d3`)→ fresh-export 建档(`worklog-kit-public@38c7190`,作者 noreply)→ scrollery 两段收编(`2a9f376`/`07372b9`,分支 `feat/worklog-kit-migration`)。push/建仓/转公开被 auto-mode classifier 拦,命令包交用户。
- 验证:kit 仓 selftest 12 套全绿 + 双门 exit 0(45 文档);导出树 selftest/check/index 全绿 + 私料扫描零命中(98 文件);scrollery 双门绿(check 300 文档/143 豁免,index 不变量 + build)。
- 遗留:①远端命令包待用户手跑(私史归档、建公开仓、转公开);②npm 上 0.1.0-alpha.0 的 README 是旧状态行,重发 alpha.1 可对齐(非必须);③scrollery 19 个 todo 分节待人工归并;④迁移分支合回 dev 由用户裁。

## 会话:2026-07-18
- 做了:遗留①②销账——远端三步(私史归档 push、公开仓建+转公开、alpha.1 重发布)均已由用户执行并实证;双源模型经用户裁落地(私仓唯一开发源→公仓净化镜像:`tools/sync-public.mjs` + `docs/runbooks/sync-public.md` + gitignored 本地词表),首次净化同步已 commit 并 push;第六轮 review 行动序开工(引擎 P1 四条 + CI 硬化 + 本散文销账批)。
- 验证:双端 main==origin/main;首次同步终检 103 文件零命中,导出树 check/index/selftest 12 套全绿。
- 遗留:③scrollery 19 个 todo 分节人工归并;④迁移分支合回 dev 待裁;本任务收口待批(开线补实体 R6-21 + 收口动作须用户批)。

## 回顾(收口 2026-07-18 填)
- 亮点:「先演习后正式」流程收益实证——demo 剧本 365→0 收敛在真仓重放为 316→144→1→0,唯一手修同型(supersedes 散文值),demo 报的两 rebase bug 修后真仓零断链。fresh-export 断历史堵住 force-push 后旧 objects 仍可按 SHA 经 API 取的泄露向量。
- 教训:①R4-18「上限后不再新增泄漏」这类纪律**无机械门就会被违反**(含规则制定参与者本人 07-16/17 又引入两个真实值),CamelCase + 领域词表全量扫描可作转公开前标准终检,常态防新增仍靠自觉;②修一个报障点要扫同型全部落点(F-020 已提升 experience);③Windows 工具链三坑(`core.quotepath` 转义中文路径、`execSync` 走 cmd.exe 吃 `^`、todo.md 故意贴入的 NUL 真字符须 `grep -a`)。
- 意外:导出树 selftest 假红 2 项,起初疑导出损坏,实为 EOL 皮实性 bug(fixture 对已是 CRLF 的内容再 `\n→\r\n` 造 `\r\r\n`)——`git archive` 按 autocrlf 转行尾即便 blob 是 LF,fresh-export 恰好提前踩爆公开后 Windows 用户 clone 必撞的坑;修 fixture + `.gitattributes` 钉 LF(F-019,bug 本体已修,体检增强 no-promotion)。
