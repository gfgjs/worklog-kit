---
id: 2026-07-18-npm发布
status: active
type: runbook
line: worklog-kit-oss
created: 2026-07-18
---

# npm 发布手册

> 双源模型下,**npm 包一律出自公开仓净化快照的干净树**(承 [sync-public](sync-public.md) 纪律 6):
> 词表硬门在 publish 之前,泄漏防线靠流程顺序,不靠人眼。私仓工作树可能带 CRLF 等本地污染,
> `git archive` 快照(走 `.gitattributes` 钉 LF)才是可信发布面。

## dist-tag 纪律(用户裁 2026-07-18,推翻同日早前「latest 保留给正式版」裁定)

- **`latest` 随最新发布走,alpha 版照常接管**:发布用 `npm publish --tag latest`——
  npm 对 prerelease 版本**强制显式 `--tag`**(裸 `npm publish` 直接报错拒发),显式指 `latest` 即满足。
- 同时维持 `alpha` 双针:`npm dist-tag add worklog-kit@<版本> alpha`(供显式钉 `alpha`
  渠道的消费方,与 alpha.1 首发的 `latest`/`alpha` 双针现状一致)。
- 正式版无特殊 tag 地位:`1.0.0` 发布即 latest,同现行,无接管仪式。

## 前提检查(任一不满足即停)

1. 私仓 `main` clean 且 local==origin(改动全部收口、该 push 的已 push)。
2. `npm whoami` 认得出人——401 即先 `npm login`(auth 归用户手持,不入任何 tracked 文件)。
   2FA 账号 publish 时还要一次性口令(`--otp=<6位>` 或浏览器授权),此步天然人工,不可自动化。
3. 版本号已裁定(prerelease 递增 `0.1.0-alpha.N`;正式版语义另裁)。

## 标准流程(顺序即防线,不可调换)

1. **私仓 bump 版本**:`package.json` 的 `version` 改新值,单独 commit
   (`chore(version): <新版本>——<一句发布理由>`)。版本号只在私仓改——公开仓永远只收
   `sync:` 快照,禁止公仓先发、私仓回灌的倒挂路(alpha.1 走过一次,不再)。
2. **私仓门绿**:`npm run selftest` + `npm run check` + `npm run index` 全 exit 0。
3. **私仓 push**(须用户批准)。
4. **净化同步**:`node tools/sync-public.mjs --apply --selftest`——终检零命中 + 导出树
   双门 + 全量 selftest 绿才落公仓 commit;公仓 push(或 `--apply --push` 一步)。
5. **公仓干净树发布**:
   ```bash
   cd ../worklog-kit-public
   npm publish --dry-run        # 先看 tarball 清单:只该有 bin/src/locales/schema/skills/templates + 包务件
   npm publish --tag latest     # prerelease 强制显式 --tag(实测 alpha.2);2FA 账号须 --otp=<6位> 或浏览器授权
   npm dist-tag add worklog-kit@<版本> alpha   # 双针
   ```
6. **公仓打 tag**(承 alpha.1 惯例):`git tag v<版本> && git push origin v<版本>`。
7. **验证**:
   ```bash
   npm view worklog-kit dist-tags versions
   npx --yes --package worklog-kit@<版本> worklog selftest   # registry 冒烟:装得上、跑得绿。须在仓外目录跑(见「实测坑」自遮蔽)
   ```

## 发布后

- **消费仓升 pin 不自动**(D-017 钉版纪律):各消费仓 CI 钉精确版本,升 pin=升门禁语义。
  先在消费仓本地干跑新版 `worklog check` / `index` / `baseline` 看红绿变化,绿了再改 CI 钉版行。
- 私仓 status 分片(`docs/status/worklog-kit-oss.md`)现况行更新已发版本号。

## 实测坑(alpha.2 发布撞出)

- **EOTP 报错 ≠ 发布失败**:2FA 浏览器授权流下,终端先报 `EOTP` 退出,但浏览器完成授权后
  **原请求可能已放行**。重试撞 `403 You cannot publish over the previously published
  versions` 即证据:**已发成**,先 `npm view worklog-kit versions time` 核实,勿当故障排查。
- **`npm dist-tag add` 同受 OTP 门**(写操作一律要):拨针也须 `--otp` 或浏览器授权,人工步。
- tag 校验:`npm view worklog-kit@<版> dist.shasum` 对本地 `npm pack --dry-run` 的 shasum,
  指纹一致 = 线上物即验净物。
- **npx 冒烟须在仓外目录跑**(自遮蔽陷阱):在本仓(或公仓克隆)内跑
  `npx --package worklog-kit@<版>` 时,若本地 package.json 恰为同名同版,npm exec 判定
  spec 已被本地工程满足而**跳过安装**,直接找 PATH 上的 `worklog` 报 not recognized——
  假故障。换任意仓外目录即正常;消费仓不受影响(其 package.json 非同名)。

## 回滚(诚实声明)

- **不 unpublish**:72 小时窗口外不可行,窗口内也会打断已钉版的消费仓 CI。
- 坏版处置:`npm deprecate worklog-kit@<坏版> "<原因,指向替代版>"` + 立即发修复版。
  dist-tag 指错时用 `npm dist-tag add` 拨回,不动已发 tarball。
