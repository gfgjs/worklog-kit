// gate 层 selftest:profile × baseline × --warn-only 的优先级矩阵。
// 单独成文件(而非塞进 gate.mjs)是因为它要造临时仓、引 check-* 两道门,
// 而 gate.mjs 被两道门反过来引——放一起就成环。
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { partitionViolations, toBaselineEntries, reportViolations, BASELINE_NAME, loadBaseline } from './gate.mjs';
import { BASELINE_ELIGIBLE } from './violations.mjs';
import { DEFAULTS } from './config.mjs';
import { main as checkDocs } from '../check-docs.mjs';
import { main as baselineCmd } from '../baseline.mjs';
import { RC_PROFILE_LINE, RC_DIRS_LINE, CI_PROFILE_PLACEHOLDER, CI_EXTRA_LINE } from '../init.mjs';
import { PKG_ROOT } from './fsutil.mjs';

const t = (k, p = {}) => `${k} ${Object.values(p).join(' ')}`;
const quiet = (fn) => {
  const log = console.log, err = console.error;
  const out = [];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try { return { code: fn(), out: out.join('\n') }; } finally { console.log = log; console.error = err; }
};

const V = (file, rule, line) => ({ file, rule, line });

export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-gate: ${name}`); if (!cond) failed++; };

  // ── 1. partition:profile × baseline 的核心语义 ──────────────────────────
  const bl = (entries) => ({ version: 1, entries });
  {
    const vs = [V('docs/old.md', 'docs.statusInvalid')];
    const b = bl([{ path: 'docs/old.md', rule: 'docs.statusInvalid', count: 1 }]);
    assert(partitionViolations(vs, b, 'strict').enforced.length === 1, 'strict 档无视 baseline(命中也 enforce)');
    assert(partitionViolations(vs, b, 'brownfield').exempt.length === 1, 'brownfield 档命中 baseline 即豁免');
    assert(partitionViolations(vs, null, 'brownfield').enforced.length === 1, 'brownfield 但无 baseline ⇒ 行为同 strict(不静默放松)');
    assert(partitionViolations(vs, bl([]), 'brownfield').enforced.length === 1, '未立账的违规照常 enforce');
  }
  // ── 2. 棘轮:同文件同规则的违规数不许涨 ───────────────────────────────────
  {
    const two = [V('docs/old.md', 'docs.brokenLink', 3), V('docs/old.md', 'docs.brokenLink', 9)];
    const three = [...two, V('docs/old.md', 'docs.brokenLink', 12)];
    const b = bl([{ path: 'docs/old.md', rule: 'docs.brokenLink', count: 2 }]);
    const ok = partitionViolations(two, b, 'brownfield');
    assert(ok.exempt.length === 2 && ok.enforced.length === 0 && ok.ratchet.length === 0, '违规数等于立账数 ⇒ 整组豁免');
    const one = partitionViolations([two[0]], b, 'brownfield');
    assert(one.exempt.length === 1 && one.ratchet.length === 0, '清掉一条后仍豁免(不要求恰好相等)');
    const grew = partitionViolations(three, b, 'brownfield');
    // 折叠后挑不出「哪条是新的」,故整组作废——挑错比不挑更坏
    assert(grew.enforced.length === 3 && grew.exempt.length === 0 && grew.ratchet.length === 1, '违规数涨了 ⇒ 该文件该规则豁免整体作废、全部 enforce');
    assert(grew.ratchet[0].was === 2 && grew.ratchet[0].now === 3, '棘轮报告立账数与现数');
  }
  // ── 3. D-013:不可豁免的规则,立了账也没用 ───────────────────────────────
  {
    const vs = [V('docs/README.md', 'index.dirTableUnlisted')];
    // 手工伪造一条 index.* 的 baseline 条目——即便有人这么写,也必须不生效
    const b = bl([{ path: 'docs/README.md', rule: 'index.dirTableUnlisted', count: 1 }]);
    assert(partitionViolations(vs, b, 'brownfield').enforced.length === 1, 'D-013:index.* 不在允许清单 ⇒ 即使 baseline 里有也 enforce');
    assert(toBaselineEntries(vs).length === 0, 'D-013:不可豁免的规则不会被 --update 写进 baseline');
    assert(!BASELINE_ELIGIBLE.has('closeout.verifiedInvalid'), 'D-013:closeout.* 不可豁免(核心承诺不打折)');
    assert([...BASELINE_ELIGIBLE].every((r) => r.startsWith('docs.')), '允许清单当前只含 per-file 的 docs.* 存量债');
  }
  // ── 4. toBaselineEntries:同文件同规则折叠计数 ───────────────────────────
  {
    const vs = [V('a.md', 'docs.brokenLink', 1), V('a.md', 'docs.brokenLink', 2), V('b.md', 'docs.missingType')];
    const e = toBaselineEntries(vs);
    assert(e.length === 2 && e.find((x) => x.path === 'a.md').count === 2, '同文件同规则折叠为一条并计数');
  }
  // ── 5. 端到端:brownfield + --update + --warn-only 的退出码矩阵 ──────────
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-gate-'));
    try {
      const write = (rel, s) => { const p = join(root, ...rel.split('/')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
      // 一篇存量坏文档:status/type 非法 + 缺 line —— 全是 baseline 该管的那类 per-file 旧债
      //(主语是这个文件,且机器派生不出正确值)。**id/created 刻意给齐**:它们归
      // `upgrade` 那把梯子(§4.1 item1「两把梯子」),混进来会让这里到底在测哪把梯子说不清。
      write('docs/legacy.md', '---\nid: 2020-01-01-legacy\nstatus: bogus\ntype: nope\ncreated: 2020-01-01\n---\n\n# 旧文档\n');
      const cfg = (over) => ({ ...DEFAULTS, docsDir: 'docs', sourceRoots: [], ...over });

      assert(quiet(() => checkDocs({ root, config: cfg({ profile: 'strict' }), t, args: [] })).code === 1, 'strict + 存量违规 ⇒ exit 1');
      assert(quiet(() => checkDocs({ root, config: cfg({ profile: 'brownfield' }), t, args: [] })).code === 1, 'brownfield 未立账 ⇒ 仍 exit 1');
      assert(quiet(() => checkDocs({ root, config: cfg({ profile: 'strict' }), t, args: ['--warn-only'] })).code === 0, '--warn-only ⇒ 报告但 exit 0');

      // strict 档下拒绝生成 baseline:该档无视它,生成纯属误导
      assert(quiet(() => baselineCmd({ root, config: cfg({ profile: 'strict' }), t, args: ['--update'] })).code === 2
        && !existsSync(join(root, BASELINE_NAME)), 'strict 档拒绝生成 baseline(exit 2 且零写入)');

      // 立账后转绿
      const bf = cfg({ profile: 'brownfield' });
      assert(quiet(() => baselineCmd({ root, config: bf, t, args: ['--update'] })).code === 0, 'baseline --update exit 0');
      assert(existsSync(join(root, BASELINE_NAME)), 'baseline 文件已落盘');
      assert(quiet(() => checkDocs({ root, config: bf, t, args: [] })).code === 0, '立账后 brownfield ⇒ exit 0(存量豁免)');
      assert(quiet(() => checkDocs({ root, config: cfg({ profile: 'strict' }), t, args: [] })).code === 1, '同一份 baseline 下 strict 仍 exit 1(无视 baseline)');

      // 豁免须单列报告、不静默
      const r = quiet(() => checkDocs({ root, config: bf, t, args: [] }));
      assert(r.out.includes('gate.baselineExempt'), '豁免命中单列报告(不静默咽下)');

      // 新增违规照常红(baseline 只护立账过的那些)
      write('docs/fresh.md', '---\nstatus: bogus\ntype: nope\n---\n\n# 新文档\n');
      assert(quiet(() => checkDocs({ root, config: bf, t, args: [] })).code === 1, '新文件的新违规照常 enforce');
      rmSync(join(root, 'docs', 'fresh.md'));

      // 棘轮:在**已立账的文件**里再加一条同规则违规
      const b0 = loadBaseline(root).baseline;
      const linkRule = b0.entries.some((e) => e.rule === 'docs.brokenLink');
      write('docs/legacy.md', '---\nstatus: bogus\ntype: nope\n---\n\n# 旧文档\n\n[断](./gone.md)\n');
      const r2 = quiet(() => checkDocs({ root, config: bf, t, args: [] }));
      assert(!linkRule && r2.code === 1, '在已立账文件里新增**未立账规则**的违规 ⇒ enforce');

      // D-013 的结构保证,直证一次:baseline **立不了 idMissing 的账**。
      // 它不是「装工具前就有、且工具修不了」的存量债——`worklog-kit upgrade` 一个命令就能真修好;
      // 给它开豁免等于用「记账挂起」替掉一条真能走通的路,那笔账会一直挂在那里。
      write('docs/noid.md', '---\nstatus: active\ntype: design\nline: x\ncreated: 2020-01-01\n---\n\n# 没有号的文档\n');
      assert(quiet(() => baselineCmd({ root, config: bf, t, args: ['--update'] })).code === 0, '含 idMissing 时 baseline --update 仍 exit 0(它只是立不了这条的账)');
      const r3 = quiet(() => checkDocs({ root, config: bf, t, args: [] }));
      assert(r3.code === 1, '立账后 idMissing 依旧 enforce ⇒ baseline 豁免不了它(D-013)');
      assert(!loadBaseline(root).baseline.entries.some((e) => e.rule === 'docs.idMissing'), 'idMissing 根本没进 baseline 文件(结构上不可入账,不是靠判定时再滤掉)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  // ── 5b. F-003:分列计数——汇总只数强制,豁免挂账不混入 ─────────────────────
  // 靶场实测:总行「193 处违反」= 186 豁免 + 7 强制,豁免与真实违规在读数上同形,
  // 真人被误导(且被 dev-C 独立再证)。机制保证:reportViolations 返回分列计数,
  // 两道门的汇总行只拿 enforced。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-gate-f003-'));
    try {
      writeFileSync(join(root, BASELINE_NAME), JSON.stringify({ version: 1, entries: [{ path: 'docs/old.md', rule: 'docs.statusInvalid', count: 1 }] }));
      const vs = [V('docs/old.md', 'docs.statusInvalid'), V('docs/new.md', 'docs.missingType')];
      const r = quiet(() => reportViolations({ violations: vs, config: { profile: 'brownfield' }, root, args: [], t })).code;
      assert(r.exit === 1 && r.enforced === 1 && r.exempt === 1, 'reportViolations 分列 enforced/exempt(1 强制 + 1 豁免,不再合报 2)');
      const clean = quiet(() => reportViolations({ violations: [vs[0]], config: { profile: 'brownfield' }, root, args: [], t })).code;
      assert(clean.exit === 0 && clean.clean === true && clean.exempt === 1, '全部命中豁免 ⇒ clean 且 exempt 计数在案(绿也不吞账)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  // ── 5c. tier B B11:baseline 账文件不可信 ⇒ brownfield exit 2(不静默当无账)──
  // 账文件改变门禁判定:损坏时静默当 null 会让全部豁免蒸发、满屏「新违规」,
  // 而真相是账本坏了——用户会去修文档而不是修账。版本不认与损坏同罚。
  {
    const root = mkdtempSync(join(tmpdir(), 'wk-gate-b11-'));
    try {
      const vs = [V('docs/old.md', 'docs.statusInvalid')];
      const bp = join(root, BASELINE_NAME);
      writeFileSync(bp, '{坏 json');
      let r = quiet(() => reportViolations({ violations: vs, config: { profile: 'brownfield' }, root, args: [], t }));
      assert(r.code.exit === 2 && r.out.includes('gate.baselineCorrupt'), 'B11:损坏账文件 + brownfield ⇒ exit 2 且报成因');
      r = quiet(() => reportViolations({ violations: vs, config: { profile: 'brownfield' }, root, args: ['--warn-only'], t }));
      assert(r.code.exit === 2, 'B11:--warn-only 不降级坏账 exit 2(矩阵①:判定不可信不放行)');
      writeFileSync(bp, JSON.stringify({ version: 99, entries: [] }));
      r = quiet(() => reportViolations({ violations: vs, config: { profile: 'brownfield' }, root, args: [], t }));
      assert(r.code.exit === 2 && r.out.includes('99'), 'B11:version 不认 ⇒ exit 2(与 SUPPORTED_SCHEMA_VERSIONS 同哲学)');
      r = quiet(() => reportViolations({ violations: vs, config: { profile: 'strict' }, root, args: [], t }));
      assert(r.code.exit === 1, 'B11:strict 档不读 baseline,坏账不翻门(仍按违规 exit 1)');
      const cmd = quiet(() => baselineCmd({ root, config: { profile: 'brownfield' }, t, args: [] }));
      assert(cmd.code === 2, 'B11:baseline 报告模式对 version 不认同报 exit 2(loadBaseline 单一实现)');
      writeFileSync(bp, JSON.stringify({ version: 1, entries: [{ path: 'docs/old.md', rule: 'docs.statusInvalid', count: 1 }] }));
      r = quiet(() => reportViolations({ violations: vs, config: { profile: 'brownfield' }, root, args: [], t }));
      assert(r.code.exit === 0 && r.code.exempt === 1, 'B11:合法账文件照旧豁免(回归)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // ── 6. 模板 profile/dirs 行字面量仍在(否则 init 的替换会静默 no-op)───────
  {
    const src = readFileSync(join(PKG_ROOT, 'templates', 'worklogrc.jsonc'), 'utf8');
    assert(src.includes(RC_PROFILE_LINE), `模板含 ${RC_PROFILE_LINE} 字面量(init 据此写入实际 profile;重排模板会在此当场炸,而不是把每个 brownfield 仓静默 stamp 成 strict)`);
    assert(src.includes(RC_DIRS_LINE), `模板含 ${RC_DIRS_LINE} 字面量(init 据此写入实况派生的 dirs;F-002——no-op 即每个 brownfield 仓复刻漏收)`);
    // P3 阶段 5:CI 模板的按档占位符同钉(no-op = 每份 CI 都自称 <PROFILE> 档且丢附加步)
    const ci = readFileSync(join(PKG_ROOT, 'templates', 'ci-github.yml'), 'utf8');
    assert(ci.includes(CI_PROFILE_PLACEHOLDER), `CI 模板含 ${CI_PROFILE_PLACEHOLDER} 占位符(R2-M4 按 profile 生成的替换点)`);
    assert(ci.includes(CI_EXTRA_LINE), 'CI 模板含按档附加步占位行(brownfield 的 baseline 报告步由此注入)');
  }

  console.log(failed ? `\n✗ gate selftest 失败 ${failed} 项` : '\n✓ gate selftest 全部通过');
  return failed ? 1 : 0;
}
