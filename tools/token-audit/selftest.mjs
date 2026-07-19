// token-audit 自测:纯函数回归 + golden fixture 端到端(复审 P1-02:「度量核心零 fixture」的补课)。
//
// golden 覆盖面(报告点名清单):shell append(heredoc)、apply_patch、多文件单命令、
// cache(usage 各桶并入 inn)、重复盘符(mungedTail 同尾)、active session(末行半截 JSON 容错)。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  kindOf, taskOf, isShellWrite, CLI_RE, makeWindow, newAgg, foldSession, totalsOf, mungedTail,
} from './model.mjs';
import { shortHash } from './estimator.mjs';
import { parseClaudeSession } from './parse-claude.mjs';
import { parseCodexSession } from './parse-codex.mjs';
import { renderText, renderJson } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** JSONL 文本 → 对象数组;坏行(active session 的半截尾行)丢弃并计数 */
export function parseJsonl(text) {
  const objs = [];
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { objs.push(JSON.parse(line)); } catch { bad++; }
  }
  return { objs, bad };
}

export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} token-audit: ${name}`); if (!cond) failed++; };

  // ── 纯函数回归 ──────────────────────────────────────────────────────────
  assert(kindOf('docs/planning/2026-01-01-x/task_plan.md') === 'trio-task_plan', 'kindOf task_plan');
  assert(kindOf('docs\\planning\\x\\findings.md') === 'trio-findings', 'kindOf findings(反斜杠)');
  assert(kindOf('docs/worklogs/y/closeout.md') === 'worklogs-archive', 'kindOf 归档');
  assert(kindOf('src/foo.js') === null, 'kindOf 非 kit 产物返回 null');
  assert(taskOf('cat docs/planning/2026-07-19-甲任务/progress.md') === '2026-07-19-甲任务', 'taskOf 任务目录名');
  assert(taskOf('src/x.mjs') === null, 'taskOf 非 planning 路径 null');

  assert(isShellWrite("cat >> docs/planning/x/progress.md <<'EOF'"), 'shell 写:heredoc + >>');
  assert(isShellWrite('tee -a findings.md'), 'shell 写:tee');
  assert(isShellWrite('Set-Content progress.md'), 'shell 写:Set-Content');
  assert(isShellWrite('apply_patch'), 'shell 写:apply_patch(Codex)');
  assert(!isShellWrite('cat docs/planning/x/task_plan.md'), '纯读 cat 不算写');
  assert(!isShellWrite('tail -n 20 progress.md'), 'tail 读不算写');

  const cli = (s) => { const m = CLI_RE.exec(s); return m ? m[1] : null; };
  assert(cli('worklog check') === 'check', 'CLI:worklog check');
  assert(cli('node ./bin/worklog.mjs doctor') === 'doctor', 'CLI:worklog.mjs doctor(复审 §3.5(7) 修)');
  assert(cli('npx worklog-kit@0.1.0-alpha.2 index') === 'index', 'CLI:npx worklog-kit@ver index');
  assert(cli('{"command":["bash","-lc","worklog closeout mytask"]}') === 'closeout', 'CLI:Codex 序列化 arguments');
  assert(cli('worklog note 甲任务 --kind finding --stdin') === 'note', 'CLI:产品命令 note 已收编');
  assert(cli('echo worklogging along') === null, 'CLI:worklog 词中不误命中');

  const win = makeWindow('2026-07-01', '2026-07-19');
  assert(win('2026-07-10T12:00:00.000Z') === true, '窗内命中');
  assert(win('2026-06-30T23:00:00.000Z') === false, '窗前排除');
  assert(win('2026-07-20T00:00:00.000Z') === false, '窗后排除(until 含当日 23:59)');
  assert(win(undefined) === true, '缺时间戳 fail-open');
  assert(makeWindow(null, null)('2020-01-01') === true, '未给窗恒真');

  assert(shortHash('abc') === shortHash('abc') && shortHash('abc') !== shortHash('abd'), 'shortHash 稳定且区分');
  // 重复盘符 golden:换盘符残留的项目目录同尾归并
  assert(mungedTail('C:\\workspace\\scrollery') === mungedTail('D:\\workspace\\scrollery'), 'mungedTail 盘符无关同尾');

  // ── Claude golden(端到端:fixture → adapter → fold → totals)────────────
  {
    const { objs, bad } = parseJsonl(readFileSync(join(HERE, 'fixtures', 'claude-golden.jsonl'), 'utf8'));
    assert(bad === 1, 'active session:末行半截 JSON 被容错丢弃(恰 1 行)');
    const { events } = parseClaudeSession(objs, makeWindow(null, null));
    const agg = newAgg();
    agg.sessions++;
    foldSession(agg, events);
    assert(agg.realIn === 1000 && agg.realOut === 10, 'cache golden:usage 三桶并入 inn(100+900),out=10');
    assert(agg.skillBodyN === 1 && agg.skillBody > 0 && Object.keys(agg.skillHashes).length === 1, 'skill 正文计次 + 版本哈希分桶');
    const tp = agg.kinds['trio-task_plan'];
    assert(tp && tp.rPre === 10 && tp.rPreN === 1, '读归因:task_plan 读后有同路径 Edit ⇒ 前置读(40 ascii=10 tok)');
    assert(tp.w > 0 && tp.wN === 1, 'Edit 写入计 write');
    const fd = agg.kinds['trio-findings'];
    assert(fd && fd.rPure === 5 && fd.rPureN === 1, '读归因:findings 无后续写 ⇒ 主动读(20 ascii=5 tok)');
    assert(fd.w > 0 && fd.wN === 1, '多文件 golden:单命令提两文件归 kindOf 首个命中类(findings,已知限界钉住)');
    const pg = agg.kinds['trio-progress'];
    assert(pg && pg.w > 0 && pg.wN === 1 && pg.rPure === 0 && pg.rPureN === 0, 'shell append golden:heredoc 计 write,回显不计读');
    assert(agg.cli.check && agg.cli.check.n === 1 && agg.cli.check.t > 0, 'CLI:worklog.mjs check 输入+输出同桶,完成计次');
    const tk = agg.tasks['2026-07-19-golden任务'];
    assert(tk && tk.w > 0 && tk.rPre > 0 && tk.rPure > 0, '任务分桶:golden任务 读写归因齐');
    assert(agg.kitSessions === 1, '触 kit 会话计数');
    const { kitTotal } = totalsOf(agg);
    assert(kitTotal > 0 && renderText(agg, { projectDir: 'x', matchedDirs: [] }).includes('golden任务'), '渲染:任务维度出现在文本报告');
    assert(renderJson(agg, { projectDir: 'x', matchedDirs: [] }).kitTotal === kitTotal, 'renderJson 与 totalsOf 同数(单源)');
  }

  // ── Codex golden ────────────────────────────────────────────────────────
  {
    const { objs, bad } = parseJsonl(readFileSync(join(HERE, 'fixtures', 'codex-golden.jsonl'), 'utf8'));
    assert(bad === 0, 'codex fixture 全行合法');
    const match = (cwd) => mungedTail(cwd) === mungedTail('C:\\workspace\\golden-proj');
    const { matched, events } = parseCodexSession(objs, makeWindow(null, null), match);
    assert(matched === true, 'session_meta.cwd 命中目标项目');
    const agg = newAgg();
    agg.sessions++;
    foldSession(agg, events);
    assert(agg.kinds['trio-progress']?.w > 0, 'apply_patch golden:计 write(trio-progress)');
    assert(agg.kinds['trio-findings']?.rPure === 10, 'codex shell 读:输出 40 ascii=10 tok 计主动读');
    assert(agg.cli.closeout?.n === 1, 'codex CLI:closeout 完成计次');
    assert(agg.realIn === 1234 && agg.realOut === 56, 'token_count 总量入账');
    // 非目标项目:整会话零事件
    const miss = parseCodexSession(objs, makeWindow(null, null), () => false);
    assert(miss.matched === false && miss.events.length === 0, '非目标 cwd 整会话跳过');
  }

  console.log(failed ? `\n✗ token-audit selftest 失败 ${failed} 项` : '\n✓ token-audit selftest 全部通过');
  return failed ? 1 : 0;
}
