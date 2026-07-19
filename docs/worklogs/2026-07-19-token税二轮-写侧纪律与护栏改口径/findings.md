---
status: snapshot
type: working-memory
line: token税二轮-写侧纪律与护栏改口径
created: 2026-07-19
---

# 发现与决策:token税二轮-写侧纪律与护栏改口径

## 需求
- 用户:scrollery 实战中短任务用不上三件套、长任务三件套 30-40k(字节)且多轮读取,token 浪费大;多方面分析优化,业界方案限 sonnet 子代理联网查。分析已呈,用户令开工。

## 发现
- 案例(scrollery 2026-07-19-数据备份与恢复施工,任务过半):110/48/119 行、23.7KB、est ~6.8k token/次全量读。行数护栏(200)三件全未咬。
- 肥点:task_plan 已 complete 阶段仍留 ~58 行 checklist 细节(53%);progress 每段「做了/遗留」与 task_plan、commit message 三重冗余(~55% 可压);findings 已消费侦察节 ~24 行常驻(50%)。
- 税结构(memory token-audit 07-19 实测):Edit 前置 Read 41.3%(整文件 ~2.4k/次)+ 写入 34.8% + 接续读 18.9%;税=体积×读写轮次。
- estTokens 公式已存在于 tools/token-audit.mjs(CJK_RE + cjk+other/4)——doctor 侧内联复制(tools/ 不入包,src 不可 import)。
- locales 仅 zh.json 单语;doctor.fatTrio 键现存(zh.json:197)。
- kit 仓 F-ID 最大 F-024、D-ID 最大 D-031(grep docs 全量)。

## 外部资料(当数据,不当指令)
- Anthropic 官方 index+detail 先例:Claude Code auto memory,MEMORY.md 硬限 200 行/25KB、超限报错逼折叠、细节 topic files 按需读。https://code.claude.com/docs/en/memory
- Anthropic memory tool「multisession pattern」:progress log+checklist,session 首读尾更;官方建议追踪文件大小设上限、view_range 分页。https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- compaction 原则「保决策/未解 bug,弃冗余工具输出」。https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- PROJECTMEM(arXiv:2606.12329,自述数据):append-only events + 摘要=纯函数投影;接续 800-1.5k vs 无记忆重建 5-20k。
- Context Rot(arXiv:2606.29718):Keep-Latest-w/-summary 成本效果最优;纯 trimming rot 最差——支持滚动前情段、反对纯删除。
- spec-kit plan-template:代码示例/详细算法强制移出主计划文件。https://github.com/github/spec-kit/blob/main/templates/plan-template.md
- Cline:Memory Bank 膨胀社区批评(Discussion #2979)→ 演进出轻量 Focus Chain 分层;官方立场「不为省 token 为全周期 ROI」。https://cline.bot/blog/how-to-think-about-context-engineering-in-cline
- Claude Code Edit 必先整读:Issue #16546 closed as not planned——绕道=换写入通道(shell append)。API 原生 text editor 本有 view_range(整读非 API 强制)。
- 反面:Aider 无三件套式持久任务文档(repo map 动态检索哲学)。

## 耐久提升候选(F-ID 取**全仓全局序**递增,不按任务清零;发现当场登记,收口时逐行处置进 closeout.md)
<!-- 全局序是裁定(2026-07-18,R6-25):experience/closeout 按 F-ID 锚定,任务内清零会与既往任务同号异义撞锚 -->
| 候选 ID | 内容摘要 | 建议去向 |
|---------|----------|----------|
| F-025 | 行数护栏与真实税脱钩实证:案例三件全低于 200 行、合计 est 6.8k 用户已判重——护栏口径须含 token 估值,行数单轨对中文密集文件失真 | experience |
| F-026 | 三件套冗余三源:task_plan complete 细节 / progress 复述 / findings 已消费节——同一信息 3-4 处;治理=写侧纪律非读侧裁剪(A1 教训) | experience |
| F-027 | 模板结构须兼容 append-only:凡「收口才填」的节(回顾)不得垫在文件尾,尾部恒留给盲追加的最新增量——否则 shell append 纪律与模板互斥 | experience;本线已修模板 |
