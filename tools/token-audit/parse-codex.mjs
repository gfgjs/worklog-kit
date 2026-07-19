// Codex 会话 adapter:JSONL 对象流 → 规范事件(纯函数,IO 在入口层)。
//
// 形态知识集中在此:session_meta.cwd 项目匹配、response_item 的
// function_call / function_call_output、event_msg.token_count 总量。
// Codex 全走 shell:含写入特征算写(apply_patch/heredoc/`>>`),输出侧只在非写时计读。
import { estTokens } from './estimator.mjs';
import { kindOf, taskOf, isShellWrite, CLI_RE } from './model.mjs';

/**
 * @param {object[]} objs 已解析 JSONL 行
 * @param {(ts?: string) => boolean} inWindow
 * @param {(cwd: string) => boolean} matchCwd session_meta.cwd 是否目标项目
 * @returns {{matched: boolean, events: object[]}} matched=false 时事件恒空(整会话不属本项目)
 */
export function parseCodexSession(objs, inWindow, matchCwd) {
  const events = [];
  const pending = new Map();
  let matched = false;
  let lastTotals = null;
  let seq = 0;
  for (const o of objs) {
    if (!inWindow(o.timestamp)) continue;
    const p = o.payload;
    if (!p) continue;
    if (o.type === 'session_meta' && p.cwd) {
      if (!matchCwd(p.cwd)) return { matched: false, events: [] };
      matched = true;
    }
    if (!matched) continue;
    if (o.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage)
      lastTotals = p.info.total_token_usage;
    if (o.type !== 'response_item') continue;
    if (p.type === 'function_call') {
      seq++;
      const args = String(p.arguments || '');
      const m = CLI_RE.exec(args);
      if (m) {
        pending.set(p.call_id, { cat: 'cli', sub: m[1] });
        events.push({ t: 'cli', sub: m[1], tokens: estTokens(args) });
      } else {
        const k = kindOf(args);
        if (k) {
          const isWrite = isShellWrite(args);
          if (isWrite) events.push({ t: 'write', kind: k, task: taskOf(args), path: null, tokens: estTokens(args), seq });
          pending.set(p.call_id, { cat: 'read', kind: k, task: taskOf(args), isWrite, seq });
        }
      }
    } else if (p.type === 'function_call_output' && pending.has(p.call_id)) {
      const pd = pending.get(p.call_id);
      pending.delete(p.call_id);
      let out = p.output;
      if (typeof out === 'object' && out) out = out.content || JSON.stringify(out);
      const tokens = estTokens(String(out || ''));
      if (pd.cat === 'read' && !pd.isWrite) events.push({ t: 'read', kind: pd.kind, task: pd.task, path: null, tokens, seq: pd.seq });
      else if (pd.cat === 'cli') events.push({ t: 'cli', sub: pd.sub, tokens, count: true });
    }
  }
  if (matched && lastTotals) {
    events.push({ t: 'usage', out: lastTotals.output_tokens || 0, inn: lastTotals.input_tokens || 0 });
  }
  return { matched, events };
}
