// baseline:brownfield 档的存量违规豁免清单(D-008 / D-013,方案 §7.5)。
//
// 载体是**入库、受治理**的仓根文件 `.worklog-baseline.json` —— 它改变门禁判定,就必须
// 可 review、可 blame,与配置同级。放 .gitignore 或 ~/.cache 里等于让一个人在本地
// 单方面决定整个仓的门禁松紧。
//
// **check 永不自动吸收新违规**:再生成只经显式 `worklog baseline --update`。自动吸收
// 会让 baseline 一路退化成「自动豁免一切」——门还在,但它同意你做的任何事。
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { checkDocsAndLinks, checkCloseouts } from './check-docs.mjs';
import { checkIndex } from './check-index.mjs';
import { toBaselineEntries, loadBaseline, BASELINE_NAME, BASELINE_VERSION } from './lib/gate.mjs';
import { BASELINE_ELIGIBLE } from './lib/violations.mjs';
import { PKG_ROOT } from './lib/fsutil.mjs';
import { todayLocal } from './lib/dates.mjs';

const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

/** 全量扫一遍本仓,收集所有违规(两道门都扫——baseline 是跨门的仓级账) */
export function collectAll(root, config) {
  const violations = [];
  const report = (v) => violations.push(v);
  checkDocsAndLinks(root, config, report, false);
  checkCloseouts(root, config, report);
  checkIndex(root, config, report);
  return violations;
}

export function buildBaseline(root, config, today) {
  const all = collectAll(root, config);
  const entries = toBaselineEntries(all);
  const skipped = all.length - entries.reduce((n, e) => n + e.count, 0);
  return {
    doc: {
      version: BASELINE_VERSION,
      generatedAt: today,
      tool: `${PKG.name}@${PKG.version}`,
      note: '存量违规豁免清单(brownfield 档)。仅收录可豁免规则;图不变量与索引一致性永不豁免(D-013)。由 `worklog baseline --update` 显式再生成——check 永不自动吸收。',
      entries,
    },
    total: all.length,
    skipped,
  };
}

export function main({ root, config, t, args }) {
  if (!args.includes('--update')) {
    // 只读:报现状,不动文件。默认动作是**说明**,不是重写——一个会顺手改判定的默认动作太危险。
    // 判定走 loadBaseline 单一实现(R3-6):损坏/形状错/版本不认都报 exit 2
    //(配置/输入不可信一档),不裸崩异常栈,也不与门层各持一套「什么算坏账」。
    const lb = loadBaseline(root);
    if (lb.error) { console.error(t('baseline.corrupt', { name: BASELINE_NAME, msg: lb.error })); return 2; }
    if (!lb.baseline) { console.log(t('baseline.absent', { name: BASELINE_NAME })); return 0; }
    const b = lb.baseline;
    const n = (b.entries || []).reduce((s, e) => s + (e.count ?? 1), 0);
    console.log(t('baseline.status', { name: BASELINE_NAME, files: new Set((b.entries || []).map((e) => e.path)).size, n, at: b.generatedAt, tool: b.tool }));
    console.log(t('baseline.updateHint'));
    return 0;
  }
  if (config.profile !== 'brownfield') {
    // strict 档无视 baseline,给它生成一份纯属误导:文件在那儿、却什么也不做。
    console.error(t('baseline.notBrownfield', { profile: config.profile }));
    return 2;
  }
  const today = todayLocal(); // 日期戳本地日(B12)
  const { doc, total, skipped } = buildBaseline(root, config, today);
  const abs = join(root, BASELINE_NAME);
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  renameSync(tmp, abs); // 原子替换:不留半份 baseline
  const exempted = doc.entries.reduce((n, e) => n + e.count, 0);
  console.log(t('baseline.wrote', { name: BASELINE_NAME, files: new Set(doc.entries.map((e) => e.path)).size, n: exempted }));
  if (skipped) {
    // 不可豁免的那些必须当场说清楚,否则用户会以为 --update 之后就全绿了,
    // 然后被一个「我明明立过账」的红搞糊涂。
    console.log(t('baseline.skipped', { n: skipped, rules: [...BASELINE_ELIGIBLE].length }));
  }
  console.log(t('baseline.reviewHint', { total }));
  return 0;
}
