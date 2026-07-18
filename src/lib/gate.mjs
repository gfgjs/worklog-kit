// 门禁的共享判定层:profile(strict/brownfield)× baseline 豁免 × --warn-only。
// check-docs 与 check-index 都经此收口,免得两道门对同一个 profile 各有一套理解
//(R2-C1 式语义分叉在门层重演)。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { locOf, keyOf, BASELINE_ELIGIBLE } from './violations.mjs';
import { cmpCodePoints } from './slug.mjs';

export const BASELINE_NAME = '.worklog-baseline.json';
/** baseline 文件自身的格式版本(与配置的 schemaVersion 无关,各自演进) */
export const BASELINE_VERSION = 1;

/**
 * 退出码 / 豁免 / 降级的优先级矩阵(§7.5;D-002/D-013)。
 *
 * | 情形                    | strict | brownfield        | 叠加 --warn-only |
 * |-------------------------|--------|-------------------|------------------|
 * | 配置非法 / 内部错误     | exit 2 | exit 2            | **仍 exit 2**    |
 * | 存量违规(baseline 命中)| enforce(无视 baseline) | 豁免(计数报告,不静默) | 同左,再降级 |
 * | 新违规                  | enforce | enforce          | 报告但 exit 0    |
 * | 图不变量(阶段 3+)      | enforce | **enforce**(永不豁免,D-013) | 报告但 exit 0 |
 *
 * 两条边界值得写死在这里:
 * ①**配置非法不受任何降级影响**——`--warn-only` 降的是「你的文档有问题」,不是
 *   「工具读不懂你的配置」。后者意味着这次判定本身不可信,放行等于给一个假绿。
 * ②`--warn-only` 是**输出级别**,不是采纳档位(D-002 砍 advisory 的理由);它与
 *   profile 正交,可叠加。
 */
export function loadBaseline(root) {
  const p = join(root, BASELINE_NAME);
  if (!existsSync(p)) return { baseline: null };
  // 损坏/形状错/版本不认一律**显式报错**而非静默当无账(tier B B11):brownfield 档
  // 它改变判定——静默 null 会让全部豁免蒸发、满屏「新违规」,而真相是账本坏了。
  // 版本语义与 SUPPORTED_SCHEMA_VERSIONS 同哲学:不认识的版本一律拒,不猜。
  let b;
  try { b = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return { baseline: null, error: `解析失败:${e.message}` }; }
  if (!Array.isArray(b?.entries)) return { baseline: null, error: 'entries 缺失或非数组' };
  if (b.version !== BASELINE_VERSION) return { baseline: null, error: `version=${JSON.stringify(b.version)},本引擎只认 ${BASELINE_VERSION};请用匹配版本的 worklog-kit 重新 baseline --update` };
  return { baseline: b };
}

/**
 * 按 profile 与 baseline 切分违规。
 *
 * 条目带 **count** 是棘轮的关键:钥匙「路径 + 规则」会把同文件同规则的多条违规折叠
 * 成一条,若只记「有没有」,该文件该规则**将来新增的违规也自动豁免**——正是 D-008
 * 警告的「baseline 退化为自动豁免一切」,只是缩小了作用域。带 count 后:
 *   实际条数 ≤ 立账条数 → 整组豁免;
 *   实际条数 > 立账条数 → **该文件该规则的豁免整体作废、全部 enforce**。
 * 不去挑「哪几条是新的」:折叠后本就挑不出来,而挑错比不挑更坏。语义因此很好解释——
 * 「旧账可以留着,但不许在同一处再欠新的」。
 *
 * @returns {{enforced: Violation[], exempt: Violation[], ratchet: {key: string, was: number, now: number}[]}}
 */
export function partitionViolations(violations, baseline, profile) {
  if (profile !== 'brownfield' || !baseline) return { enforced: violations, exempt: [], ratchet: [] };
  const allow = new Map(baseline.entries.map((e) => [`${e.path} ${e.rule}`, e.count ?? 1]));
  const groups = new Map();
  for (const v of violations) {
    const k = keyOf(v);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const enforced = [], exempt = [], ratchet = [];
  for (const [k, vs] of groups) {
    // 不在允许清单的规则(index.* / 将来的图不变量)直接 enforce,不看 baseline
    const quota = BASELINE_ELIGIBLE.has(vs[0].rule) ? allow.get(k) : undefined;
    if (quota === undefined) { enforced.push(...vs); continue; }
    if (vs.length <= quota) { exempt.push(...vs); continue; }
    ratchet.push({ key: k, was: quota, now: vs.length });
    enforced.push(...vs);
  }
  return { enforced, exempt, ratchet };
}

/** 收集本仓当前全部可豁免违规 → baseline 条目(供 `baseline --update`) */
export function toBaselineEntries(violations) {
  const counts = new Map();
  for (const v of violations) {
    if (!BASELINE_ELIGIBLE.has(v.rule)) continue; // 不可豁免的规则不进 baseline
    const k = keyOf(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, count]) => {
      const i = k.lastIndexOf(' ');
      return { path: k.slice(0, i), rule: k.slice(i + 1), count };
    })
    // 码点序不用 localeCompare(第七轮 P2):baseline 是**入库账文件**,排序随环境
    // collation 漂会让两台机器 `--update` 产出不同字节——build-index 同一判据(M-10)。
    .sort((a, b) => (a.path === b.path ? cmpCodePoints(a.rule, b.rule) : cmpCodePoints(a.path, b.path)));
}

/**
 * 打印违规并给出退出码。
 * @returns {{exit: number, clean: boolean, enforced: number, exempt: number}}
 *   clean = 无 enforce 级违规(可打印 pass 文案)。
 *   enforced/exempt 分列计数(F-003):汇总行若把豁免挂账混进「违反」总数,豁免与真实
 *   违规在读数上同形——靶场实测 193 = 186 豁免 + 7 强制,真人被误导。调用方汇总只数 enforced。
 */
export function reportViolations({ violations, config, root, args, t }) {
  const warnOnly = args.includes('--warn-only');
  const lb = loadBaseline(root);
  // 账文件坏了且本档真读它 ⇒ exit 2(「配置非法/内部错误」一档,矩阵①:不受 --warn-only
  // 降级)。strict 档不读 baseline,不为一个不生效的文件翻门——留给 doctor/baseline 报。
  if (lb.error && config.profile === 'brownfield') {
    console.error(t('gate.baselineCorrupt', { name: BASELINE_NAME, msg: lb.error }));
    return { exit: 2, clean: false, enforced: 0, exempt: 0 };
  }
  const { enforced, exempt, ratchet } = partitionViolations(violations, lb.baseline, config.profile);

  for (const v of enforced) {
    console.error(`✗ ${locOf(v)}`);
    console.error(`    ${t(v.rule, v.params || {})}`);
  }
  // 豁免**单列报告、不静默**(§7.5):一个说「全绿」却偷偷咽下 80 条的门,
  // 会让人以为自己的仓是干净的。
  if (exempt.length) console.log(t('gate.baselineExempt', { n: exempt.length, name: BASELINE_NAME }));
  for (const r of ratchet) console.error(t('gate.ratchetBroken', { key: r.key, was: r.was, now: r.now }));

  const counts = { enforced: enforced.length, exempt: exempt.length };
  if (!enforced.length) return { exit: 0, clean: true, ...counts };
  if (warnOnly) { console.error(t('gate.warnOnly', { n: enforced.length })); return { exit: 0, clean: false, ...counts }; }
  return { exit: 1, clean: false, ...counts };
}
