---
id: 2026-07-18-公私双源净化同步
status: active
type: runbook
line: worklog-kit-oss
created: 2026-07-18
---

# 公私双源净化同步手册

> 双源模型(2026-07-18 裁,取代「公开仓单源」):**私仓 = 唯一开发源**(与消费靶场联动迭代),
> **公开仓 = 净化快照镜像**(不带私史,fresh-export 断档纪律的常态化)。npm 发布一律出自公开仓。
> 执行体:[tools/sync-public.mjs](../../tools/sync-public.mjs)。

## 纪律清单(违反任意一条即停)

1. **改动一律在私仓做**,公开仓只收 `sync:` 快照 commit。公开仓意外领先(临时热修)时,
   先回灌私仓(`git format-patch` + `git apply`,commit 注明「回灌自公开仓克隆 <hash>,内容等同」),
   推平后才许再 sync——脚本前置检查会拦「公仓 main ≠ origin/main」。
2. **原词不复录**:真实敏感值(身份、私仓名、内部任务/组件名、本机路径)不写入任何 tracked
   文件——包括「记录已清除某词」的记录本身(meta 泄漏,已多次实证)。新发现的泄漏词
   **只加进 `.sync-blocklist.local.json`**(gitignored,永不入库);该文件丢失时从私史
   no-leak commits 的删除行重提取。
3. **终检即门**:词表 + 通用模式(control bytes / 白名单外邮箱 / 用户目录路径)对导出树
   全文件扫描,**零命中才许 apply**;命中即停,清完重跑。不信自觉,只信扫描器。
4. **身份勾连件永不导出**:含身份分析、私史勾连的文档(如深度 review 报告)记入词表文件的
   `excludePaths`,导出前整文件剔除。
5. **导出树门禁必绿**:脚本在导出树内跑 `check` + `index`(`--selftest` 加全量);
   镜像不许比源仓的门禁标准低。
6. **npm 发布只从公开仓干净树发**,不从私仓工作树发——工作树可能带 CRLF 等本地污染,
   `git archive` 快照(走 `.gitattributes` 钉 LF)才是可信发布面。
7. **机械门只认已知词**:转公开级别的节点上,人工补一轮 CamelCase 全量扫描 + 领域词表
   扫描,新词回填词表。常态防新增靠这条兜底。

## 标准流程

```bash
node tools/sync-public.mjs              # dry-run:导出 + 终检 + diff 预览,公仓复原不留痕
node tools/sync-public.mjs --apply      # 终检零命中 + diff 合意后:落公仓 commit
node tools/sync-public.mjs --apply --push   # 同上并推 origin/main
```

公仓克隆缺省在 `../worklog-kit-public`(`--public <path>` 可改);离线跳过齐平检查用
`--offline`;commit 信息用 `--message` 覆写(缺省 `sync: 私源净化快照 <日期>`)。

> **环境无关(Windows)**:脚本自动定位 GNU tar(Git 自带 `usr/bin/tar.exe`)解压导出快照,
> 不吃调用方 shell——PowerShell 与 Git Bash 跑均可。System32 的 `tar.exe` 是 bsdtar,啃不动
> git archive 的 UTF-8 中文路径头(报 `Invalid empty pathname`),故脚本显式绕开。若报「找不到
> GNU tar」,装 Git for Windows(即带 `usr/bin/tar.exe`)或从 Git Bash 跑。

## 半自动边界(诚实声明)

脚本能机械保证的只有:已知词零命中、无 control bytes、无白名单外邮箱与用户目录路径、
排除表剔除、门禁绿。它**不能**识别未进词表的新敏感值——那靠纪律 2(不写入)与纪律 7
(节点人工补扫)双保险。快照式同步天然不带 commit message 与历史,私史结构不泄。
