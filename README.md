# worklog-kit

把「工程文档纪律」做成 **CI 可强制**、并配套 **AI working-memory 工作流**的开发者工具——让文档从「靠自觉」变成「合并前置条件」。自 [Scrollery](https://github.com/gfgjs/scrollery) 项目自研的两层记忆体系抽取、通用化、产品化。

> **状态**:npm 已发布 `worklog-kit@0.1.0-alpha.2`(`latest`/`alpha` 双 dist-tag)·**v0.3 施工基线 · P1–P5 已收口**(纯中文首发)。GitHub 公开仓以 **fresh-export 断档基线**发布(R4-18:私有施工史本地归档,真实值样例已合成化),其后由净化快照同步持续镜像(`tools/sync-public.mjs`,契约见 `docs/runbooks/sync-public.md`)。
> 设计单一真源:[docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md](docs/designs/2026-07-12-工作记忆治理体系开源工具化方案.md)。

## 它解决什么

- **易失层**:AI agent 的长任务过程记录(`task_plan`/`findings`/`progress` 三件套)散在上下文里,一 compaction 就丢。
- **永久层**:团队文档(设计/决策/审查/手册)靠自觉维护,移动不修链、归档不留横幅、经验不沉淀——无人机械兜底。
- **蒸馏缝**:易失层里的耐久价值(踩过的坑、拍的板)在任务收口时**逐候选提升**进永久层,由 CI 静态门校验不漏不错。

市面工具多只做其一(纯 AI memory 框架无 CI 纪律;纯 docs linter 无 agent 喂料)。worklog-kit 把两层咬合 + 静态门做成一个可 `init` 的开发者工具。

## 先读这 20 秒:包名 ≠ 命令名

- 运行要求:Node ≥ 20。消费仓**不必**是 Node 项目(`init` 不写 `package.json`)。
- **包名是 `worklog-kit`,装出来的命令(bin)叫 `worklog`,两者不同。**
  - 一次性调用一律写包名:`npx worklog-kit <子命令>` ✅
  - **别跑裸 `npx worklog ...`** ❌:npm 上另有他人的同名包 `worklog`,无本地 bin 时 npx 会按包名把它抓来执行(同名不报错,静默跑别人的)。
  - CI 里钉到精确版本:`npx --yes --package worklog-kit@<ver> worklog <cmd>`——版本浮动 = 门禁判定浮动。`init` stamp 的 workflow 已按此写好,无需手写。

## 五分钟上手(新仓)

**第 1 步 · init**。在你的仓库根:

```bash
npx worklog-kit init
```

实际输出(节选):

```text
· profile=strict(自动判定:stamp 前 docsDir 已有既存 .md ⇒ 存量仓;无则 strict。可用 --profile 覆盖)
✓ 写入 .claude/skills/planning/SKILL.md
✓ 写入 .worklogrc.jsonc
✓ 写入 docs/README.md
✓ 写入 docs/runbooks/closeout.md
✓ 写入 .worklog/templates/task_plan.md
✓ 写入 .github/workflows/docs-governance.yml
…
✓ init 完成。下一步:填实 docs/README 与 .worklogrc.jsonc,跑 `worklog check`。
```

stamp 出四类东西:

| 类 | 内容 | 干什么 |
|---|---|---|
| docs 骨架 | `docs/README.md`(目录职责表)、`designs/ reviews/ decisions/ runbooks/ lines/ planning/ worklogs/ archive/` 八目录、`docs/todo.md`、`docs/experience.md`、示例工作线 `docs/lines/文档治理.md` | 文档之家 + 各类知识的固定落点 |
| 配置 | `.worklogrc.jsonc`、`.worklog/manifest.json`(记录引擎版本)、`.worklog/templates/`(三件套 + closeout 模板) | 门禁契约 + 任务模板 |
| CI | `.github/workflows/docs-governance.yml`(已钉精确包版本) | 合并前强制双门 |
| AI 接口 | `.claude/skills/planning/SKILL.md` | Claude Code 的 `/planning` 长任务工作流 |

**第 2 步 · 验证开箱即绿**:

```bash
npx worklog-kit check
npx worklog-kit index
```

```text
✓ docs 门禁通过(断链+frontmatter+位置+收口;6 个文档,0 个代码/配置文件)
✓ 索引不变量门通过(目录表 + worklogs 登记 双向一致;…)
```

**第 3 步 · commit 全部 init 产物**。push 后 CI 生效——从此新违规挡合并。

**第 4 步 · 按需调整**(不急,默认值即可跑):

- 把 `docs/README.md` 目录职责表的描述换成你项目的真话;`.worklogrc.jsonc` 按需增删 type/disposition。增删目录须 config `dirs`、职责表、实际目录**三处同步**——不一致索引门会红,兜底不靠记性。
- 只想要 AI 长任务记忆、不要全套治理:`npx worklog-kit init --skill-only`。

## 走完一个任务:开工 → 记录 → 收口(真实示例)

下面每步的命令与输出都在一个 fresh init 的仓里实跑验证过。

**开工**。建任务目录 `docs/planning/<YYYY-MM-DD>-<任务名>/`,从 `.worklog/templates/` 抄 `task_plan.md` / `findings.md` / `progress.md` 三件套,frontmatter 填:

```yaml
---
status: active
type: working-memory
line: 文档治理        # 引用 docs/lines/ 下工作线实体的文件名;开新线 = 新建实体文件
created: 2026-07-17
---
```

(用 Claude Code 的话,直接 `/planning`,skill 会替你建齐;无 AI 手抄模板同样成立。)

**干活中**。过程记录写三件套;凡值得留下的坑/决策,**发现当场**登记进 `findings.md` 的候选表:

```markdown
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
| F-001 | CI 钉版原因:裸 npx 会解析到他人同名包 | experience |
```

**收口**(判断件照 stamp 到你仓的 `docs/runbooks/closeout.md`,机械件一条命令):

1. 先做提升:把 F-001 真写进 `docs/experience.md`(新增「§CI 调用必须钉包名+版本」一节)。
2. 写 `closeout.md`(模板在 `.worklog/templates/`),每个候选恰好一行:

```markdown
| 候选 ID | disposition | target | locator | 去重证据 | N/A 理由 | verified |
|---------|-------------|--------|---------|----------|----------|----------|
| F-001 | experience | repo:docs/experience.md | §CI 调用必须钉包名+版本 | new | — | yes |
```

3. 跑收口机械步:

```bash
npx worklog-kit closeout 接入CI门禁 --summary "CI 门禁接线 + 钉版经验入库"
```

```text
收口机械步(docs/planning/2026-07-17-接入CI门禁 → docs/worklogs/2026-07-17-接入CI门禁):
  · status → snapshot:task_plan.md / findings.md / progress.md / closeout.md
  · 整目录迁入 worklogs(fs rename + 尽力 git add)
  · worklogs README「已归档任务」节追加登记行
✓ docs 门禁通过(断链+frontmatter+位置+收口;10 个文档,0 个代码/配置文件)
✓ 索引不变量门通过(…)
```

4. review diff 后 commit。命令刻意**不代提交**——收口 commit 属用户批准语义。

到此蒸馏缝闭环:过程记忆归档进 `worklogs/`,耐久价值(F-001)提升进永久层,`check` 门保证候选不漏不错——漏一行、target 不存在、verified 不是 `yes`,都直接红。

## 存量仓渐进采纳(brownfield)

已有一堆 docs 的仓不必先还清旧账。`init` 自动判档(docsDir 已有 `.md` ⇒ brownfield),旧债显式立账、只对新增违规执法:

```bash
npx worklog-kit init                # 自动判档 brownfield
npx worklog-kit check               # 先看全部存量违规(此时与 strict 同判,不静默放松)
npx worklog-kit baseline --update   # 为存量债立账,写 .worklog-baseline.json(review 这份 diff 再 commit)
npx worklog-kit check               # 存量豁免、新增违规照红
```

之后每次 `check` 会亮账本横幅,提醒债还在:

```text
· 存量豁免 143 条(命中 .worklog-baseline.json;brownfield 档。这些不是「没问题」,是「记账挂起」——清一条删一条)
✓ docs 门禁通过(…)
```

三条边界:①baseline **只豁免 per-file 存量债**,索引一致性与图不变量(双权威/重复 id/断 supersedes)**永不豁免**(D-013);②条目带 count 做**棘轮**——同一处再欠新的,该豁免整体作废;③`check` **永不自动吸收**新违规,立账只经显式 `baseline --update`。

工具升版后:`npx worklog-kit upgrade --dry-run` 预览配置迁移(逐级、可回滚),确认后去掉 `--dry-run` 真跑。

## 三道门禁

| 门 | 查什么 |
|---|---|
| `check` | 活区断链(1a)、代码引用 docs 可达(1b)、frontmatter 枚举、archive 横幅、**closeout 收口契约**(含仓根 containment、固定列 schema、三件套完整性) |
| `index` | `config.dirs` ↔ 目录职责表 ↔ 实际目录**三方**一致、worklogs 归档 ↔ 登记双向 |
| `skills` | `/planning` skill 分发到 agent home(install/check/dry-run/force;`--check` 双向文件集合) |

## 命令总览

| 命令 | 干什么 |
|---|---|
| `init [--skill-only] [--profile <档>]` | stamp 全套(或仅 skill);自动判 strict/brownfield |
| `check` | docs 门禁(上表) |
| `index` | 索引门;`index build` / `index check` 显式子命令,裸 `index` 按档执行 |
| `closeout <任务> [--summary <一句话>] [--dry-run]` | 收口机械步:三件套 status 翻转 + 迁 worklogs + 登记 + 双门 |
| `baseline --update` | brownfield 存量债立账 |
| `upgrade [--dry-run]` | 配置 schema 逐级迁移(v1→…→v5),注释保全 |
| `skills [--check\|--force]` | `/planning` skill 装到本机 agent home(Codex)/ 验一致性 |
| `doctor` | 本机诊断:配置合法性 + skill 一致性 + 模板副本漂移 + stale trio + 三件套行数护栏 + 仓库 EOL 体检 |
| `config` | 打印配置实际加载结果(「我的配置到底被读成什么」) |
| `team <任务>` | solo→team 一次性迁移(progress 改 events/ 承载) |
| `selftest` | 全量自检 13 套 |

## closeout 收口契约(蒸馏缝的机械强制点)

长任务收口时,三件套声明的耐久候选(`F-NNN`/`D-NNN`)在 `closeout.md` 处置表中**恰好各一行**,由 `check` 校验:

- **disposition** ∈ 配置声明的结构化规则;按 `targetKind` 分派校验:
  - `docs` → `repo:<路径>` 且**验存**;`fixed` → 固定靶点(如 `docs/todo.md`,由 `init` 造出);
  - `frozen-ref` → `repo:<路径>@<commit>`(只验 grammar,永不回改);`none` → `—` 且须 N/A 理由。
- 一切 `repo:` 路径须**解析后仍在仓根内**:`repo:../x.md` 即便磁盘上真有也非法——验存的语义是「落点在本仓、随本仓演进」,不是「磁盘上有这个文件」。
- 处置表**列名/列数/顺序**固定(按位置解构,列漂移会静默错位取值)。
- 候选**全覆盖不重不漏**、一候选恰好一行;`verified` 只接受 `yes`,**含 `no-promotion`**(「不提升」也是要有人确认已做完的决定)。

无 AI 用户照收口手册(`worklog init` 会 stamp 到你仓里的 `docs/runbooks/closeout.md`;源见 [templates/runbook-closeout.md](templates/runbook-closeout.md))手动走通同一 start→closeout 流程——门禁是唯一机械强制点,不依赖任何 agent。

## 配置(`.worklogrc.jsonc`)

机器面(字段名/枚举值/disposition 元模型)锁 **ASCII canonical**;展示面(报错/索引标签)由 `locales/<lang>.json` 本地化。MVP 仅 `zh`。校验 schema:[schema/worklogrc.v5.schema.json](schema/worklogrc.v5.schema.json)(随 `schemaVersion` 版本化,v1–v5 各存一份,`worklog upgrade` 逐级迁移)。

## 设计取舍(v0.3 已裁)

- **索引产物不入库**(gitignore + 按需 `worklog index`)→ 真零合并冲突;无 drift gate。
- **工作线** = `lines/<slug>.md` 实体(P2)而非中心分配字母——撞名成 git add/add 冲突,合并时原生暴露。
- **采纳梯度** = 显式 profile 两档:`strict` / `brownfield`(D-002),边界见上节;`--warn-only` 是与 profile 正交的全局输出标志。
- **thin-runner** 拓扑:引擎驻本包,消费仓只落配置 + docs + ci.yml → semver 升级即 `npm update`。

三轮深审 28 项裁决与回写台账见设计文档 §15–§18。

## 来源与许可

引擎逻辑抽取自 Scrollery 公开镜像(Apache-2.0,单一版权人),本仓以 **MIT** 重新发布。详见 [LICENSE](LICENSE) 与设计方案 §11。

## 开发

零运行期依赖。跑全部自检:

```bash
npm run selftest   # = worklog selftest:config/lib-core/cliargs/jsoncedit/templates/upgrade/gate + 三门 fixture + skills + doctor + e2e,共 13 套
```

各门也可定点重跑(`worklog check --selftest` 等)。**e2e 不是可选套件**:本仓就是包
(package == repo),于是消费者才会撞上的断裂——包内 `templates/` 在这里永远存在、
配置永远已配好、bin 永远在本地——在单元测里结构性不可见。e2e 在临时目录里造一个
**非 Node** 消费仓,走完 `init → start → closeout → 双门绿 → 制造违规变红`,是唯一
能看见消费路径的一套。
