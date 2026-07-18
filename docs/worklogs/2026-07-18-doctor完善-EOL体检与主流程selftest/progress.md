---
status: snapshot
type: working-memory
line: doctor完善-EOL体检与主流程selftest
created: 2026-07-18
---

# 进度日志:doctor完善-EOL体检与主流程selftest

<!-- 验证行怎么填(F-005):门禁末行须在**全部内容落盘后**才跑得出来——顺序是
     先写占位 → 跑门 → 回填真实末行(改动了再复跑)。别倒过来抄一行旧输出充数。 -->

## 会话:2026-07-18
- 做了:开线(line 实体 + status 分片 + 三件套);doctor 第 6 项 EOL 体检(`hasGlobalLfPin`/`eolMismatches` 纯函数 + main() 接线,execFileSync 直调 git、quotepath=off、非 git 仓降级跳过)+ zh.json 四键;F-018 selftest 扩容(captureMain 夹具:截 console + CODEX_HOME 重定向,覆盖配置三态/stale 阈值边界/模板 missing/EOL git fixture 三态,doctor 套件 6→30 断言);F-020 同型落点四处同步(cli.usage、README doctor 行、doctor.mjs 头注、SUITES 标签——cli.usage 与 README 行还欠着「模板副本漂移」旧账一并补);P4 分片 F-018 待办销账。
- 验证:`worklog check` exit 0(61 文档)+ `worklog index` 绿 + `npm run selftest` 全绿(12 套,含 e2e);doctor 真仓冒烟报「✓ EOL 体检通过」;selftest 首跑咬出 v2 最小配置缺 types/dispositions 的 fixture 错,补齐后绿。
- 做了(续):commit `a1fd54a`;sync-public `--offline --apply --selftest` 落公仓快照 `c3c77c6`(--offline 因上轮 6ed72fb 待推非分叉,导出树双门 + selftest 12 套绿)。
- 遗留:收口待用户批(F-018/F-019 两账清,candidates 空表);私仓 `02415bd`+`a1fd54a`、公仓 `6ed72fb`+`c3c77c6` 待用户 push。

## 回顾(收口 2026-07-18 填)
- 亮点:captureMain 夹具模式(截 console + 环境变量重定向外部依赖)让 CLI `main()` 可 hermetic 直测——可复用到其它命令主流程补测;真 zh catalog 断译文子串,顺路把「代码引 key、catalog 没加」的漏译纳入覆盖(makeT 缺 key 静默返 key,fake t 测不出)。
- 教训:F-020 再兑现——cli.usage 与 README 的 doctor 行早已欠「模板副本漂移」一项,本次加第 6 项时一并补;枚举型散文(检查项/套数清单)每动一次须全文检索同型落点。
- 意外:「v2 最小合法配置」比直觉大——schema 必填 `types`(对象形)+ `dispositions`,只给 schemaVersion/docsDir/dirs/status 会假红;fixture 照 config selftest 的 base 抄全才绿。
