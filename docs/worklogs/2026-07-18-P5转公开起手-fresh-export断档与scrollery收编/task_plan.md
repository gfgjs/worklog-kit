---
status: snapshot
type: working-memory
line: P5转公开起手-fresh-export断档与scrollery收编
created: 2026-07-17
---

# 任务计划:P5 转公开起手——fresh-export 断档与 scrollery 收编

## 目标
用户三项批准落地:①本仓 push;②转公开走 fresh-export 断历史(R4-18/D-010);③scrollery 正式迁移。第四项(撤 Codex home skill)裁定**不撤**。

## 当前阶段
全部阶段 done(2026-07-18 远端三步实证完成);任务收口待批(涉及开线补实体,见第六轮 review R6-21)

## 阶段

### 阶段 1:no-leak 值样例合成化(fresh-export 前置)
- [x] R4-18 六值样例 + todo 分节名合成化(设计 §4.1 item2 ④/§8.1 表、P2 findings),形态与字母锚点 F/K/T 保真,原处标注
- [x] 代码 fixture 违 D-004 两处换净(e2e `legacy_2020`/`存量治理`,check-docs `巡检修复(F)`/`丙线完善(K)`)
- [x] 上限后新增漏网清除:真实任务名 ×2、真实组件名 ×1(原词不复录,见 git 私史);CamelCase 全量扫描无同类
- [x] 私仓名泛化 ×5(原词不复录);密钥/邮箱/用户名扫描零命中
- **状态:** done(`1aeb166` + `7333670`)

### 阶段 2:fresh-export 建档
- [x] `git archive HEAD` 导出 → `c:\workspace\worklog-kit-public`,git init 单根 commit(hash 不入本文——导出含本三件套,钉 hash 即自指漂移;终值见 memory/会话报告),作者 `gfgjs <gfgjs@users.noreply.github.com>`(QQ 邮箱问题随断档消解)
- [x] 导出树内 selftest 12 套 + check + index 全绿;私料终检零命中(98 文件)
- [x] 途中挖出并修复 EOL 假红 bug(见 findings),`b6956d3` + `.gitattributes` 钉 LF
- **状态:** done

### 阶段 3:scrollery 正式迁移(分支 `feat/worklog-kit-migration`,只本地 commit)
- [x] 第一段 `2a9f376`:枚举 ASCII 化 160 篇(映射表自 demo d310af1 实测提取)+ init/upgrade 对账(54 线实体播种、登记表退役)+ supersedes 散文值手修 1 + baseline 143 条,双门绿(246 文档)
- [x] 第二段 `07372b9`:todo 标题预清洗 16/23(路1)+ generated 档翻转 + 54 分片播种(4 自动命中)+ 历史 closeout 台账改靶 10 行,双门绿(300 文档)+ index build 正常
- **状态:** done

### 阶段 4:远端操作(classifier 拦 push/建仓,交用户命令包)+ 回写
- [x] 三件套 + memory 回写
- [x] 用户手跑:私史归档仓 push、公开仓建仓 push、转公开、alpha.1 重发布——四步均已发生并实证(2026-07-18:双端 main==origin/main;公开仓 public;npm latest=alpha=0.1.0-alpha.1)
- **状态:** done(2026-07-18 销账;此前台账记「待手跑」系远端操作完成后未回账,R6-22)

## 关键决策
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| 断档路线 = 「origin 改名归档 + 新建同名公开仓推 fresh 史」,不走 force-push 覆写 | force-push 后旧 objects 在 GitHub 侧仍可能经 API 按 SHA 取到,私料泄露向量正是 fresh-export 要堵的 | |
| 导出首 commit 作者 = `gfgjs <gfgjs@users.noreply.github.com>` | GitHub noreply 惯例,复用 npm author 名;用户可改后重建(单 commit,零成本) | |
| 值样例替换同时落现仓一笔 commit(非只改导出) | 现仓与公开仓 tip 内容一致,后续开发不漂移;现仓历史仍含真实值,但它本就永不公开 | |
| scrollery 祖先版 skill 以「内容覆写≡渲染」收编,不走删除重刷 | classifier 拦 `git rm`;覆写后 classify 判 ok、manifest 记渲染 hash,效果等同且少一步 | |
| todo.md 内 NUL 字节不修 | 实为 scrollery 自家文档**记录 NUL bug 时贴入的真字符**,是内容不是损伤;grep 用 `-a` 绕过 | |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
| 导出树 selftest 假红 2 项 | 疑导出损坏 | 实为 EOL 皮实性 bug(见 findings F-019 候选),修测试 + .gitattributes |
| demo 映射提取两次空表 | `git grep` rev 模式 | ①`core.quotepath` 转义中文路径致 regex 落空;②`execSync` 走 cmd.exe,`^` 是转义符吃掉了 rev 后缀——改 `~1` + 关 quotepath |
