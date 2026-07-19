// Claude Code 会话 adapter:JSONL 对象流 → 规范事件(纯函数,IO 在入口层)。
//
// 形态知识集中在此:assistant.message.content[] 的 tool_use / usage,
// user.message.content[] 的 tool_result 与 skill 正文注入两形态
// (`Base directory …/planning` 正文块、`<command-name>…planning` 触发行)。
import { estTokens } from './estimator.mjs';
import { shortHash } from './estimator.mjs';
import { kindOf, taskOf, isShellWrite, CLI_RE } from './model.mjs';

function textOfResult(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
  return '';
}

/**
 * @param {object[]} objs 已解析的 JSONL 行(坏行/半行由调用方丢弃——active session 的
 *   末行常是半截 JSON,容错属 IO 层职责)
 * @param {(ts?: string) => boolean} inWindow 事件时间窗谓词
 * @returns {{events: object[]}} 规范事件序列(foldSession 消费)
 */
export function parseClaudeSession(objs, inWindow) {
  const events = [];
  const pending = new Map(); // tool_use id -> {cat, ...}
  let seq = 0;
  for (const o of objs) {
    if (!inWindow(o.timestamp)) continue;
    const msg = o.message;
    if (o.type === 'assistant' && msg) {
      if (msg.usage) {
        events.push({
          t: 'usage',
          out: msg.usage.output_tokens || 0,
          // cache 各桶并入 inn(golden 钉住:cache_read 也是真实计费面,只是费率不同)
          inn: (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0)
            + (msg.usage.cache_creation_input_tokens || 0),
        });
      }
      if (Array.isArray(msg.content)) for (const b of msg.content) {
        if (b.type !== 'tool_use') continue;
        seq++;
        const input = b.input || {};
        if (b.name === 'Skill' && /planning/.test(String(input.skill || ''))) {
          pending.set(b.id, { cat: 'skill' });
        } else if (b.name === 'Write' || b.name === 'Edit' || b.name === 'MultiEdit') {
          const fp = String(input.file_path || '');
          const k = kindOf(fp);
          if (k) events.push({ t: 'write', kind: k, task: taskOf(fp), path: fp, tokens: estTokens(JSON.stringify(input)), seq });
        } else if (b.name === 'Read') {
          const fp = String(input.file_path || '');
          const k = kindOf(fp);
          if (k) pending.set(b.id, { cat: 'read', kind: k, task: taskOf(fp), path: fp, seq });
        } else if (b.name === 'Bash' || b.name === 'PowerShell') {
          const cmd = String(input.command || '');
          const m = CLI_RE.exec(cmd);
          if (m) {
            pending.set(b.id, { cat: 'cli', sub: m[1] });
            events.push({ t: 'cli', sub: m[1], tokens: estTokens(cmd) });
          } else {
            const k = kindOf(cmd);
            if (k) {
              if (isShellWrite(cmd)) {
                // shell 写入(heredoc/`>>`/tee):命令输入含写入正文,按 write 计,不记 read;
                // 回显不进账(写命令的 stdout 不是读税)。复审 §3.5 漏记修的 canonical 落点。
                // 已知限界:一条命令触多文件时归 kindOf 首个命中类(golden 钉住此行为)。
                events.push({ t: 'write', kind: k, task: taskOf(cmd), path: null, tokens: estTokens(cmd), seq });
              } else {
                pending.set(b.id, { cat: 'read', kind: k, task: taskOf(cmd), path: null, seq });
              }
            }
          }
        }
      }
    } else if (o.type === 'user' && msg && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b.type === 'tool_result' && pending.has(b.tool_use_id)) {
          const p = pending.get(b.tool_use_id);
          pending.delete(b.tool_use_id);
          const text = textOfResult(b.content);
          const tokens = estTokens(text);
          if (p.cat === 'skill') events.push({ t: 'skill', tokens, hash: shortHash(text), body: true });
          else if (p.cat === 'read') events.push({ t: 'read', kind: p.kind, task: p.task, path: p.path, tokens, seq: p.seq });
          else if (p.cat === 'cli') events.push({ t: 'cli', sub: p.sub, tokens, count: true });
        } else if (b.type === 'text' && b.text) {
          if (/^Base directory for this skill: [^\n]*[\\/]planning\s*$/m.test(b.text.slice(0, 200))) {
            events.push({ t: 'skill', tokens: estTokens(b.text), hash: shortHash(b.text), body: true });
          } else if (/<command-name>[^<]*planning/.test(b.text)) {
            events.push({ t: 'skill', tokens: estTokens(b.text) });
          }
        }
      }
    }
  }
  return { events };
}
