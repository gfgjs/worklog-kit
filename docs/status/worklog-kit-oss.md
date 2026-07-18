---
id: 2026-07-16-status-worklog-kit-oss
status: active
type: rolling-status
line: worklog-kit-oss
created: 2026-07-16
---

# worklog-kit-oss · 滚动状态

- 现况(2026-07-18):**P1–P5 全收口**。npm 已发布 `worklog-kit@0.1.0-alpha.2`(`latest`/`alpha` 双针均指之;registry 冒烟:裸 install + 13 套 selftest 绿;公仓 git tag `v0.1.0-alpha.2`);公开仓已建并推平(fresh-export 断档基线,其后净化快照同步)。双源模型已裁并落地:本仓为唯一开发源,公开仓为净化镜像——同步走 `tools/sync-public.mjs`,流程契约见 `docs/runbooks/sync-public.md`;发布流程见 `docs/runbooks/npm-release.md`。selftest **13 套**;配置 schemaVersion **v5**(generated 档)。第六轮全仓深度 Review 行动序已清(引擎 P1/P2 + §5 nit + 三决策);P5 收口台账见 `docs/worklogs/2026-07-18-P5转公开起手-fresh-export断档与scrollery收编/`。

## 待办(2026-07-16 自 todo.md 迁入)

- **远程 CI 首跑绿**(来源:建仓与v0.3基线 / F-002)。run `29209040905` 4s failure = **billing 阻断,非代码**(account payments failed / spending limit)。用户裁 2026-07-13:**暂不管 CI**,保留 GitHub-hosted 现状,billing 恢复即自动绿;本地 `npm run selftest` 为现行证据标准。2026-07-18 注:仓已转公开,hosted minutes 转免费,billing 阻断大概率随之解除——待下次 push 后实证首绿再销此账,未实证前保留。
  - **副作用须知**:CI 挂 + 无 pre-commit hook(§4.1 item4 明裁不做)= 本仓门禁**从未被机械强制过**,历次提交的 `worklog check` 均为自愿跑。这使 P1.5 指标「绕过次数」成为假读数(见方案 §12 P1.5 行 / L10)。
- **Codex 侧个人 skill 副本同步**(来源:建仓与v0.3基线 / F-002)。`worklog skills --check` / `doctor` 报本机 `~/.codex/skills/planning/SKILL.md` 与包内通用化新版有字节级漂移(仍是 Scrollery 专属旧版措辞)。修法:`worklog skills --force`。用户裁 2026-07-13:暂缓。属**本机**一致性,不进仓库 CI(R2-M4)。
- **npm `latest` dist-tag 随最新发布走,alpha 版照常接管**(用户裁 2026-07-18,**推翻**同日早前「latest 保留给正式版」裁定,第六轮 review §5 记账随之作废)。纪律:`npm publish` 默认打 `latest` 不加 `--tag`;每版随手 `npm dist-tag add worklog-kit@<版> alpha` 维持双针(供显式钉 `alpha` 渠道的消费方,与 alpha.1 首发双针现状一致);正式 `1.0.0` 无特殊 tag 地位。流程权威档:`docs/runbooks/npm-release.md`。
