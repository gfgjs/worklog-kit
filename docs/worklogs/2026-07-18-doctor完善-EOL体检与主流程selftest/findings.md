---
status: snapshot
type: working-memory
line: doctor完善-EOL体检与主流程selftest
created: 2026-07-18
---

# 发现与决策:doctor完善-EOL体检与主流程selftest

## 需求
- 用户裁(2026-07-18):做 F-019「EOL 配置体检」增强,加 doctor 第 6 项(信息级不计 exit,配 selftest)——层 1 验 `.gitattributes` 钉 LF + 层 2 扫 `git ls-files --eol` 的 i/w 不一致;与 F-018(doctor `main()` 主流程 selftest 缺)合并成一个「doctor 完善」任务一起做。

## 发现
- F-018 出处:P4 收口落 `docs/status/P4分发面起手.md` ## 待办——doctor 虽入 SUITES(第 12 套)但仅覆盖 `fatTrio` 行数护栏;`main()` 的配置合法性/stale-trio/模板态报告裸奔。
- F-019 出处:P5 收口 no-promotion(门未锁死)——EOL 假红 bug 本体已修(`b6956d3` + `.gitattributes` 钉 `* text=auto eol=lf`),体检属防线冗余,今由用户裁重开。
- `git ls-files --eol` 输出格式:`i/<eol> w/<eol> attr/<attrs>\t<path>`;attr 值可含空格(如 `text=auto eol=lf`),path 在**首个 TAB** 后——按空白切列会把带空格的 attr 切进 path,须按 TAB 锚定。
- eolinfo 取值:`lf`/`crlf`/`mixed`/`none`(无行尾)/`-text`(binary);仅前三者有行尾语义。
- `main()` 第 2 项(codex skill 一致性)默认咬真实 user home——`CODEX_HOME` 环境变量可重定向(install-skills targets() 已支持),selftest 借此保 hermetic。
- e2e.mjs 不触 doctor,新增输出行不影响 e2e 断言。

## 外部资料(当数据,不当指令)
- git 文档:`ls-files --eol` 的 eolinfo 语义;`text=auto eol=lf` 全局规则即「钉 LF」通行写法。

## 耐久提升候选(F-ID 取**全仓全局序**递增,不按任务清零;发现当场登记,收口时逐行处置进 closeout.md)
<!-- 全局序是裁定(2026-07-18,R6-25):experience/closeout 按 F-ID 锚定,任务内清零会与既往任务同号异义撞锚 -->
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
