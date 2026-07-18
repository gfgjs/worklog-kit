---
id: 2026-07-18-doctor完善-EOL体检与主流程selftest
status: active
type: line
line: doctor完善-EOL体检与主流程selftest
created: 2026-07-18
---

# doctor完善-EOL体检与主流程selftest

doctor 完善线:承接两笔挂账——F-018(doctor `main()` 主流程无 selftest 覆盖,P4 收口落 status 待办)与 F-019(仓库 EOL 配置体检,P5 收口 no-promotion 门未锁死,用户 2026-07-18 裁重开)。交付:doctor 第 6 项「EOL 配置体检」(信息级不计退出码,层 1 验 `.gitattributes` 钉 LF、层 2 扫 `git ls-files --eol` 的 i/w 不一致)+ `main()` 主流程 selftest 覆盖。
