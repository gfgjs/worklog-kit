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
3. **默认拒发**(复审 P1-05):公开面由入库的 `.sync-allowlist.json` 显式声明(`dir/`=整树,
   `file`=单文件),不在清单的路径导出时剔除并按顶层聚合报告——漏登记 = 不公开,
   而不是漏 exclude = 公开。初次生成:`--init-allowlist`,review 后入库;加行即扩公开面,须过 review。
4. **终检即门**:词表 + 通用模式(control bytes / 白名单外邮箱 / 用户目录路径)对**导出树 +
   `npm pack` exact tgz 内容**双面扫描,另对公仓**全 refs 历史**扫词表;**零命中才许 apply**;
   命中即停,清完重跑(公史命中属人工裁决件,自动流程只停不修)。不信自觉,只信扫描器。
5. **身份勾连件永不导出**:含身份分析、私史勾连的文档(如深度 review 报告)记入词表文件的
   `excludePaths`,导出前整文件剔除(私有路径名不入日志,只报序号+长度)。
6. **导出树门禁必绿**:脚本在导出树内跑 `check` + `index`(`--selftest` 加全量);
   镜像不许比源仓的门禁标准低。
7. **npm 发布只从公开仓干净树发**,不从私仓工作树发——工作树可能带 CRLF 等本地污染,
   `git archive` 快照(走 `.gitattributes` 钉 LF)才是可信发布面。
8. **机械门只认已知词**:转公开级别的节点上,人工补一轮 CamelCase 全量扫描 + 领域词表
   扫描,新词回填词表。常态防新增靠这条兜底。
9. **收口前快扫**:长任务归档进 `docs/worklogs/` 之前(`worklog closeout` 之前,或手写
   closeout.md 落笔后),对该任务目录跑一次 `node tools/sync-public.mjs --scan-only
   docs/planning/<任务目录>`——归档态文档比在施态更容易被当「反正是内部记录」随手写进
   真实值(2026-07-19 实证:closeout.md 阶段结论写进了一个内部代号词)。零命中再收口,
   比等下次完整 sync 才发现要早一步,且改的是未定案文档而非事后回改 worklogs 快照。

## 事务模型(复审 P1-05 落地)

一切 mutate 先落**临时克隆**(disposable clone):导出 → allowlist/排除净化 → 三面终检 →
门禁 → 临时克隆内 overlay+commit;任一步失败整个临时目录丢弃,常驻公仓克隆与远端零接触。
`--apply` 的最后一步才 `fetch 临时克隆 + merge --ff-only` 推进常驻公仓——非 ff 即拒,
不存在「半覆盖工作树 + 人工复原命令」这条路。dry-run 全程不碰常驻公仓。

## 标准流程

```bash
node tools/sync-public.mjs                  # dry-run:导出 + 净化 + 三面终检 + 临时克隆 diff 预览后整体丢弃
node tools/sync-public.mjs --apply          # 零命中 + diff 合意后:临时克隆 commit → ff 常驻公仓
node tools/sync-public.mjs --apply --push   # 同上并推 origin/main
node tools/sync-public.mjs --init-allowlist # 初次:从净化后导出树生成 .sync-allowlist.json(review 后入库)
node tools/sync-public.mjs --scan-only [路径]  # 独立诊断:只扫工作树(缺省整仓,可传子路径),不碰公仓/不 pack;收口前快扫用这条
```

公仓克隆缺省在 `../worklog-kit-public`(`--public <path>` 可改);离线跳过齐平检查用
`--offline`;commit 信息用 `--message` 覆写(缺省 `sync: 私源净化快照 <日期>`)。

> **环境无关(Windows)**:脚本自动定位 GNU tar(Git 自带 `usr/bin/tar.exe`)解压导出快照,
> 不吃调用方 shell——PowerShell 与 Git Bash 跑均可。System32 的 `tar.exe` 是 bsdtar,啃不动
> git archive 的 UTF-8 中文路径头(报 `Invalid empty pathname`),故脚本显式绕开。若报「找不到
> GNU tar」,装 Git for Windows(即带 `usr/bin/tar.exe`)或从 Git Bash 跑。

## 半自动边界(诚实声明)

脚本能机械保证的只有:已知词零命中(导出树/tgz/公史三面)、无 control bytes、无白名单外
邮箱与用户目录路径、allowlist 默认拒发、排除表剔除、门禁绿。它**不能**识别未进词表的新
敏感值——那靠纪律 2(不写入)与纪律 8(节点人工补扫)双保险。快照式同步天然不带
commit message 与历史,私史结构不泄。
