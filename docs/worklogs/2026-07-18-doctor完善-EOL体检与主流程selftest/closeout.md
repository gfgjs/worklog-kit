---
id: 2026-07-18-doctor完善-EOL体检与主流程selftest-closeout
status: snapshot
type: closeout
line: doctor完善-EOL体检与主流程selftest
created: 2026-07-18
---

# 收口处置:doctor完善-EOL体检与主流程selftest

<!-- 每个在 findings/task_plan 声明表登记的候选(F-*/D-*),此处恰好一行。
     本任务声明表为空(零候选),处置表如实零行——两笔输入账 F-018/F-019 系上游任务
     (P4/P5)收口时已处置的候选,本任务是其承接执行,不重复登账。
     列序固定:候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified -->

| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|

## 处置说明

- **零候选**:施工未挖出新的耐久提升项——EOL 体检的设计取舍(信息级/两层判据/降级跳过)已尽数落在 task_plan 关键决策表与代码注释,无须另立候选;「修同型全部落点」教训系 F-020 既有经验的再兑现,不重复登账。
- **输入账去向**:F-018(P4 分片待办)已销账划线,指针指本线 status 分片;F-019(P5 closeout no-promotion 门未锁死)由用户裁重开,本任务落地后该账自然闭合——P5 closeout 行是收口时点判断,不回改。

## 阶段结论

- **阶段 1(EOL 体检,F-019)**:doctor 第 6 项,信息级不计退出码。层 1 `hasGlobalLfPin` 验 `.gitattributes` 全局 `eol=lf`;层 2 `eolMismatches` 扫 `git ls-files --eol` 的 index/worktree 行尾不一致(binary/none 跳过,path 按首个 TAB 锚定)。execFileSync 直调 git + `core.quotepath=off`;非 git 仓降级「体检跳过」。zh.json 四键,告警均带修法。
- **阶段 2(main() selftest,F-018)**:doctor 套件 6→30 断言。captureMain 夹具(截 console + CODEX_HOME 重定向,不触真实 home);覆盖配置合法/坏/旧三态、stale-trio 14/20 天阈值边界、模板 missing 态、EOL 纯函数边界 + git fixture 三态(git 不可用降级跳过,与产品行为同构)。
- **阶段 3(同型落点与销账,F-020 纪律)**:cli.usage / README doctor 行 / doctor.mjs 头注 / SUITES 标签四处同步,顺手补两处欠账的「模板副本漂移」;套数仍 12 无漂移;P4 分片 F-018 待办销账。
- **验证**:`worklog check` exit 0(61 文档)+ `worklog index` 绿 + `npm run selftest` 12 套全绿(含 e2e);真仓 doctor 冒烟「✓ EOL 体检通过」。commit `a1fd54a` + 台账 `85f60ee`;公仓快照 `c3c77c6`/`c4528ee`。
- **遗留**:无本任务专属遗留;§5 tier B 决策清单另行呈裁(与本任务无耦合)。
