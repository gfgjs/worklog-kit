---
status: snapshot
type: working-memory
line: doctor完善-EOL体检与主流程selftest
created: 2026-07-18
---

# 任务计划:doctor完善-EOL体检与主流程selftest

## 目标
doctor 补两笔挂账:①第 6 项「仓库 EOL 配置体检」(F-019 重开)——信息级不计退出码,层 1 验 `.gitattributes` 全局钉 LF,层 2 扫 `git ls-files --eol` 的 index/worktree 行尾不一致;②`main()` 主流程 selftest 覆盖(F-018)——配置合法/坏/旧三态、stale-trio、模板态报告、EOL 三态,全部走 fixture 临时仓。

## 当前阶段
全阶段 done,收口待用户批

## 阶段

### 阶段 1:EOL 体检(F-019)
- [x] doctor.mjs:`hasGlobalLfPin()` / `eolMismatches()` 纯函数 + main() 第 6 项接线(execFileSync 直调 git,非 git 仓跳过)
- [x] zh.json:eolOk / eolNoPin / eolMismatch / eolSkip 四键
- **状态:** done

### 阶段 2:main() 主流程 selftest(F-018)
- [x] captureMain 夹具(截获 console + CODEX_HOME 重定向,不触真实 home)
- [x] 覆盖:配置合法(缺文件走默认)/坏配置计 problems/旧版只提示;stale-trio 含 14/20 天阈值边界;模板 missing 态;EOL 纯函数边界 + git fixture 三态(git 不可用降级跳过)
- **状态:** done

### 阶段 3:同型落点销账与验证
- [x] F-020 纪律:检索「三件套行数护栏」「12 套」「本机诊断」落点——cli.usage / README doctor 行 / doctor.mjs 头注 / SUITES 标签四处同步(套数仍 12,无套数漂移)
- [x] P4 分片 F-018 待办销账;门禁全绿(check 61 文档/index/selftest 12 套含 e2e)
- [x] commit `a1fd54a` + sync-public 公仓快照 `c3c77c6`(--offline --apply --selftest;--offline 因上轮 6ed72fb 待推非分叉,导出树双门 + selftest 12 套绿)
- **状态:** done

## 关键决策
<!-- 需收口提升的决策编 D-001 递增填「候选 ID」列;仅会话内有效的留空 -->
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| EOL 体检信息级,不计退出码 | 用户裁(2026-07-18);历史仓修 EOL 属大动作(renormalize 全仓 diff),硬门会拦住只想跑体检的人,与 fatTrio/模板漂移同档 | |
| 层 2 只报 i≠w(两侧均为 lf/crlf/mixed 时),binary/none 跳过 | 用户给的判据即 i/w 不一致;`-text`/`none` 无行尾语义,报了是噪声 | |
| git 直调走 execFileSync 不走 shell | scrollery 实测 execSync 走 cmd.exe 吃 `^`(F-020 教训);另 `-c core.quotepath=off` 保中文路径样例可读 | |
| selftest 用真 zh catalog 断言译文子串 | 用 fake t 断 key 名会漏「代码引了 key、catalog 没加」的漏译(t 缺 key 返回 key 本身,静默降级) | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
| selftest 旧版配置 case 假红:v2 fixture 只给 schemaVersion/docsDir/dirs/status,被 schema 判缺必需键 | 1 | v2 最小合法须含对象形 `types` + `dispositions`(照 config selftest 的 base 抄全) |
