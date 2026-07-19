// 渲染层(纯函数):账本 → 文本报告 / JSON 对象。数字全部来自 totalsOf,单源。
import { totalsOf, DESC_OLD, DESC_NEW } from './model.mjs';

export function renderJson(agg, ctx) {
  const totals = totalsOf(agg);
  return { projectDir: ctx.projectDir, matchedDirs: ctx.matchedDirs, ...totals, agg };
}

export function renderText(agg, ctx) {
  const { descTax, W, RPRE, RPURE, CLI, CLIN, kitTotal } = totalsOf(agg);
  const L = [];
  const fmt = (n) => n.toLocaleString('en-US');
  const pct = (x) => (kitTotal ? ((100 * x) / kitTotal).toFixed(1).padStart(5) + '%' : '    -');
  const row = (label, t, extra = '') =>
    L.push(`  ${label.padEnd(22)}${fmt(t).padStart(12)}  ${pct(t)}${extra ? '  ' + extra : ''}`);

  L.push('', '══ worklog-kit token 税扫账 ══');
  L.push(`项目:${ctx.projectDir}`);
  const winNote = ctx.since || ctx.until ? `  | 时间窗 ${ctx.since || '…'}~${ctx.until || '…'}` : '';
  L.push(`Claude 目录:${ctx.matchedDirs.join(', ') || '(无)'}  | 会话 ${agg.sessions}(触 kit ${agg.kitSessions},去重跳过 ${agg.dupSkipped})${winNote}`);
  L.push('', `kit 税合计:${fmt(kitTotal)} token(fold 级估值 ±30%,计费口径未实测,勿直接换算)`, '');

  L.push('── 机制维度 ──');
  row('Edit 前置 Read', RPRE);
  row('写入(Write/Edit/shell)', W);
  row('主动读/接续读', RPURE);
  row('skill 正文注入', agg.skillBody, `${agg.skillBodyN} 次`);
  row('CLI 输出', CLI, `${CLIN} 次`);
  row('description 固定税', descTax, `${agg.descSessionsOld}×${DESC_OLD} + ${agg.descSessionsNew}×${DESC_NEW} 会话`);

  L.push('', '── 产物维度 ──');
  const kindRows = Object.entries(agg.kinds)
    .map(([k, v]) => [k, v.w + v.rPre + v.rPure, v])
    .sort((a, b) => b[1] - a[1]);
  for (const [k, t, v] of kindRows) row(k, t, `写${v.wN} 前置读${v.rPreN} 主动读${v.rPureN}`);

  // 任务维度(复审 P1-02:归因到任务;skill/CLI/desc 是会话级横摊,不入任务行)
  const taskRows = Object.entries(agg.tasks)
    .map(([k, v]) => [k, v.w + v.rPre + v.rPure, v])
    .sort((a, b) => b[1] - a[1]);
  if (ctx.task) {
    L.push('', `── 任务维度(--task ${ctx.task})──`);
    const hit = taskRows.filter(([k]) => k.includes(ctx.task));
    if (!hit.length) L.push(`  (无匹配任务;现有:${taskRows.map(([k]) => k).join(', ') || '无'})`);
    for (const [k, t, v] of hit) row(k, t, `写${v.w} 前置读${v.rPre} 主动读${v.rPure}(事件 ${v.n};skill/CLI/desc 属会话级,不入本行)`);
  } else if (taskRows.length) {
    L.push('', '── 任务维度 top 10(读写归因;会话级横摊不入行,--task <名> 看单任务)──');
    for (const [k, t, v] of taskRows.slice(0, 10)) row(k, t, `事件 ${v.n}`);
    if (taskRows.length > 10) L.push(`  …另 ${taskRows.length - 10} 任务`);
  }

  if (CLIN) {
    L.push('', '── CLI 子命令 ──');
    for (const [sub, c] of Object.entries(agg.cli).sort((a, b) => b[1].t - a[1].t))
      row(`worklog ${sub}`, c.t, `${c.n} 次`);
  }

  const hashes = Object.entries(agg.skillHashes).sort((a, b) => b[1] - a[1]);
  if (hashes.length) {
    L.push('', '── skill 版本分桶(注入正文 shortHash × 会话数)──');
    for (const [h, n] of hashes) L.push(`  ${h}  ${n} 会话`);
    if (hashes.length > 1) L.push('  (多版本并存 = 采样跨越 skill 改版;before/after A/B 须按此分桶,勿混算)');
  }
  L.push('');
  return L.join('\n');
}
