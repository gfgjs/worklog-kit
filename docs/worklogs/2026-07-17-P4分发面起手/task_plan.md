---
status: snapshot
type: working-memory
line: P4分发面起手
created: 2026-07-17
---

# 任务计划:P4 分发面起手(F-004 模板漂移 + F-005 JSONC 注释往返)

## 目标
清偿 P2 收口遗留的两条分发面待办:`upgrade` 重写配置不再丢注释(F-005,外科编辑 + 等价断言 + 兜底);模板/skill 副本漂移可诊断、可带走(F-004,manifest 哈希三态判定 + doctor 报告 + upgrade 刷新)。全程门绿、负例挂 selftest。

## 当前阶段
已收口(2026-07-17,用户批)。候选账三行全处置(D-030/D-031 回写方案 §12;F-018 落分片待办),见 closeout.md。

## 阶段

### 阶段 1:F-005 JSONC 注释保全
- [x] `src/lib/jsoncedit.mjs`:JSONC 定位解析(value span)+ `replaceValue`/`appendItem` 两原语 + inline 序列化
- [x] 四迁移(v1→v5)+ reconcileGenerated 配置腿改走外科编辑;解析等价断言不过则回落 stringify(lossy 位,链上传染),丢注释警告只在真丢时打
- [x] selftest:jsoncedit 新套件(15 断言)+ upgrade 带注释 v1 fixture 全链升 v5 注释保全直证 + 重复键兜底告警;SUITES 登记(10 套)
- **状态:** done

### 阶段 2:F-004 模板漂移
- [x] `src/lib/templates.mjs`:五模板 + skill 渲染清单(renderManaged 三处同源)、EOL 归一 sha-256、五值判定(ok/missing/stale/customized/unknown)
- [x] manifest.json 增 `templates` 哈希表(D-030;buildManifest:缺失/一致记渲染 hash,相异保留旧基线或不记)
- [x] init 改走共享渲染 + manifest 记哈希;doctor 增漂移报告(信息级,含下一步指引);upgrade 增分发面对账步(stale 带走/missing 补齐/定制与无基线只报不动;stampedAt 不参与变更判定保幂等;零变更时注记照打)
- [x] selftest:templates 套件 15 断言 + upgrade F-004 五态 13 断言;SUITES 登记(11 套)
- **状态:** done

### 阶段 3:e2e 补强 + CI label
- [x] e2e D 场景:v1 配置以带注释 JSONC 原文入链,两枚哨兵注释活着走到 v5(两程 + 手编辑改档);第三程配置逐字节不动;F-004 消费链(升档补齐六件副本、skill 按 docsDir 派生、定制副本不覆盖);A 场景 manifest 六件基线断言
- [x] repro.yml step 名去写死计数(「全 8 套」实为 11 套;SUITES 注册制,数字写死必漂)
- **状态:** done

### 阶段 4:验收
- [x] 全量 selftest 11 套 exit 0;双门 exit 0;三件套回写;报告待裁收口(F-012)
- **状态:** done

## 关键决策
| 决策 | 理由 | 候选 ID |
|------|------|---------|
| manifest `templates` 哈希语义 = 「工具最后一次写入的内容 hash」 | 记录非工具写入会把用户定制误判为「未定制」,upgrade 随之覆写定制;方向性安全 = 宁可漏刷不可误刷 | D-030 |
| 注释保全 = 外科编辑 + 解析等价断言 + stringify 兜底 | 编辑产物解析后必须与语义计算结果全等,否则回落旧路径并如实告警——漂亮不牺牲正确 | D-031 |

## 错误账
| 错误 | 尝试 | 解法 |
|------|------|------|
