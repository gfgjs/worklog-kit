// token-audit 规范事件模型(复审 P1-02 模块化):分类器 + 事件折叠 + 账本形状。
//
// 分层:parse-claude / parse-codex 两个 adapter 把各自 JSONL 形态解析成**同一种事件**,
// 本模块把事件折叠进账本(读归因、任务分桶、skill 版本分桶都在这一层,单一实现);
// report.mjs 只渲染。估算器与 doctor 同源(estimator.mjs 转发 src/doctor.mjs)。
//
// 事件形状(adapter 产出契约):
//   { t:'usage', out, inn }                          真实计费侧(含 cache 各桶)
//   { t:'skill', tokens, hash?, body? }              skill 正文注入(body=true 计次)
//   { t:'write', kind, task, path?, tokens, seq }    写入(Write/Edit/shell 写/apply_patch)
//   { t:'read',  kind, task, path?, tokens, seq }    读(归因 pre/pure 在折叠时判)
//   { t:'cli',   sub, tokens }                       CLI 输入或输出(同桶累计)
import { estTokens } from './estimator.mjs';

// ── 产物分类(canonical:两 adapter 共用,双引擎解析零漂移)──────────────────
export function kindOf(str) {
  if (!str) return null;
  if (/docs[\\/]planning[\\/]/i.test(str)) {
    if (/task_plan\.md/i.test(str)) return 'trio-task_plan';
    if (/findings\.md/i.test(str)) return 'trio-findings';
    if (/progress\.md/i.test(str)) return 'trio-progress';
    return 'planning-other';
  }
  if (/docs[\\/]worklogs[\\/]/i.test(str)) return 'worklogs-archive';
  if (/docs[\\/]runbooks[\\/]closeout\.md/i.test(str)) return 'runbook-closeout';
  if (/\.worklogrc|\.worklog-baseline\.json|\.worklog[\\/]/.test(str)) return 'kit-config';
  return null;
}

/** 任务分桶:planning 路径的任务目录名(复审 P1-02:此前无 task 维度,不能归因到任务) */
export function taskOf(str) {
  const m = /docs[\\/]planning[\\/]([^\\/"'\s]+)/i.exec(String(str || ''));
  return m ? m[1] : null;
}

// CLI 子命令识别:兼收 `worklog check`、`npx worklog-kit@ver check`、`node …/worklog.mjs doctor`
// 三形态(复审 §3.5(7):旧正则漏 `worklog.mjs` 形式)。产品命令六件同批收编。
export const CLI_RE =
  /worklog(?:-kit)?(?:@[\w.-]+)?(?:\.mjs)?["'\s]+(init|check|index|skills|doctor|selftest|baseline|upgrade|closeout|team|start|list|resume|note|checkpoint|next-id)\b/;

// shell 写入特征:heredoc(`<<`)、重定向追加(`>>`)、tee、PowerShell 写 cmdlet、Codex
// apply_patch。命中即把命令输入(含 heredoc 正文)按 write 计,而非误记成 read(复审 §3.5)。
export const SHELL_WRITE_RE = /apply_patch|>>|<<|\btee\b|Set-Content|Add-Content|Out-File/i;
export function isShellWrite(cmd) { return SHELL_WRITE_RE.test(String(cmd || '')); }

// description 固定税:skill 2026-07-12 装机起征;2026-07-18 起 desc 243→173
export const INSTALL_TS = new Date('2026-07-12').getTime();
export const SHRINK_TS = new Date('2026-07-18').getTime();
export const DESC_OLD = 243, DESC_NEW = 173;

// 项目目录 → Claude project 目录名匹配。munge 规则:`:` 与路径分隔符均替换为 `-`,
// 如 C:\workspace\scrollery → c--workspace-scrollery。换盘符残留(d--…)按
// 「去掉盘符前缀的尾部」同尾并入(golden:重复盘符),重复 session 靠 basename+size 去重。
export function mungedTail(abs) {
  return String(abs).replaceAll(/[:\\/]/g, '-').replace(/^[A-Za-z]--/, '').toLowerCase();
}

// 事件时间窗谓词(复审 §3.5(3):按事件时间而非文件 mtime)。无/坏时间戳 fail-open。
export function makeWindow(since, until) {
  const lo = since ? Date.parse(since) : -Infinity;
  const hi = until ? Date.parse(until + 'T23:59:59.999Z') : Infinity;
  return (ts) => {
    if (!ts) return true;
    const m = Date.parse(ts);
    return Number.isNaN(m) || (m >= lo && m <= hi);
  };
}

// ── 账本 ──────────────────────────────────────────────────────────────────
export function newAgg() {
  return {
    sessions: 0, kitSessions: 0, dupSkipped: 0,
    skillBody: 0, skillBodyN: 0,
    skillHashes: {}, // skill 正文 shortHash -> 出现该版本的会话数(A/B 版本分桶)
    kinds: {},       // kind -> {w,wN,rPre,rPreN,rPure,rPureN}
    tasks: {},       // 任务目录名 -> {w,rPre,rPure,n}(任务归因维度)
    cli: {},         // 子命令 -> {t,n}
    realOut: 0, realIn: 0,
    descSessionsOld: 0, descSessionsNew: 0,
  };
}
export const kindBucket = (agg, k) =>
  agg.kinds[k] ?? (agg.kinds[k] = { w: 0, wN: 0, rPre: 0, rPreN: 0, rPure: 0, rPureN: 0 });
const taskBucket = (agg, task) =>
  agg.tasks[task] ?? (agg.tasks[task] = { w: 0, rPre: 0, rPure: 0, n: 0 });
export const cliBucket = (agg, sub) => agg.cli[sub] ?? (agg.cli[sub] = { t: 0, n: 0 });

/**
 * 把**一个会话**的事件折叠进账本。读归因规则(单一实现):同路径其后有写 = Edit 前置读
 * (harness 强制整读);否则主动/接续读。返回该会话是否触 kit(kitSessions 由此累计)。
 */
export function foldSession(agg, events) {
  let touchedKit = false;
  const reads = [];
  const writeSeqByPath = new Map();
  const sessionHashes = new Set();
  for (const e of events) {
    switch (e.t) {
      case 'usage':
        agg.realOut += e.out || 0; agg.realIn += e.inn || 0;
        break;
      case 'skill':
        agg.skillBody += e.tokens;
        if (e.body) agg.skillBodyN++;
        if (e.hash) sessionHashes.add(e.hash);
        touchedKit = true;
        break;
      case 'write': {
        const kb = kindBucket(agg, e.kind);
        kb.w += e.tokens; kb.wN++;
        if (e.task) { const tb = taskBucket(agg, e.task); tb.w += e.tokens; tb.n++; }
        if (e.path) {
          if (!writeSeqByPath.has(e.path)) writeSeqByPath.set(e.path, []);
          writeSeqByPath.get(e.path).push(e.seq);
        }
        touchedKit = true;
        break;
      }
      case 'read':
        reads.push(e);
        touchedKit = true;
        break;
      case 'cli': {
        const cb = cliBucket(agg, e.sub);
        cb.t += e.tokens;
        if (e.count) cb.n++;
        touchedKit = true;
        break;
      }
      default: break;
    }
  }
  for (const re of reads) {
    const kb = kindBucket(agg, re.kind);
    const writes = re.path ? (writeSeqByPath.get(re.path) || []) : [];
    const pre = writes.some((ws) => ws > re.seq);
    if (pre) { kb.rPre += re.tokens; kb.rPreN++; }
    else { kb.rPure += re.tokens; kb.rPureN++; }
    if (re.task) {
      const tb = taskBucket(agg, re.task);
      (pre ? (tb.rPre += re.tokens) : (tb.rPure += re.tokens)); tb.n++;
    }
  }
  for (const h of sessionHashes) agg.skillHashes[h] = (agg.skillHashes[h] || 0) + 1;
  if (touchedKit) agg.kitSessions++;
  return touchedKit;
}

/** 汇总派生量(report 与 --json 共用,数字单源) */
export function totalsOf(agg) {
  const descTax = agg.descSessionsOld * DESC_OLD + agg.descSessionsNew * DESC_NEW;
  let W = 0, RPRE = 0, RPURE = 0;
  for (const k of Object.values(agg.kinds)) { W += k.w; RPRE += k.rPre; RPURE += k.rPure; }
  let CLI = 0, CLIN = 0;
  for (const c of Object.values(agg.cli)) { CLI += c.t; CLIN += c.n; }
  return { descTax, W, RPRE, RPURE, CLI, CLIN, kitTotal: W + RPRE + RPURE + agg.skillBody + CLI + descTax };
}

export { estTokens };
