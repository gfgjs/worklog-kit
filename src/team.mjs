// `worklog team <任务>`:solo→team 一次性显式迁移(设计件 §4;D-029)。
//
// 四步机械件,全部可 --dry-run 预览:
//   1. task_plan frontmatter 写入 `mode: team` + `owner`;
//   2. progress.md 整体搬进迁移引导事件 `progress/events/<迁移时刻>-<owner>-00.md`
//      (不按会话标题拆分——拆分靠猜结构,猜错即丢史;seq 00 保留给引导事件);
//   3. 既有裸候选 ID(F-NNN/D-NNN)全量改写为 F-<owner>-NNN——solo 期作者即 owner,
//      语义无损;此步是 E5「team 强制命名空间」的梯子(F-001:不得只上门不给梯子)。
//      改写范围 = 三件套内**已声明候选集合**的词边界出现(声明表 + 叙事提及一并改,
//      防提及链断);不碰集合外的任意 [FD]-\d{3} 字面(可能指别的任务)。
//   4. 原子写(tmp→rename)。
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter, parseTables } from './lib/frontmatter.mjs';
import { relPath } from './lib/fsutil.mjs';
import { isValidAuthor, CANDIDATE_COL } from './check-docs.mjs';
import { resolveTaskDir, insertFrontmatterLines, writeAtomic } from './lib/taskref.mjs';

const BARE_ID_RE = /^[FD]-\d{3}$/;

export function main({ root, config, t, args }) {
  const dry = args.includes('--dry-run');
  let ownerArg = '';
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') continue;
    if (a === '--owner') { if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) ownerArg = args[++i]; continue; }
    if (!a.startsWith('-')) positionals.push(a);
  }
  const nameArg = positionals[0];
  if (!nameArg) { console.error(t('team.cmdUsage')); return 2; }
  const r = resolveTaskDir(root, config, nameArg);
  if (!r.ok) {
    console.error(t(r.reason === 'ambiguous' ? 'task.ambiguous' : 'task.notFound',
      { name: nameArg, base: `${config.docsDir}/planning`, dirs: (r.dirs ?? []).join(', ') }));
    return 2;
  }
  const dir = r.dir;
  const rel = relPath(root, dir);
  const tp = join(dir, 'task_plan.md');
  if (!existsSync(tp)) { console.error(t('task.noTaskPlan', { dir: rel })); return 2; }
  const tpRaw = readFileSync(tp, 'utf8');
  if ((parseFrontmatter(tpRaw).data.mode ?? '').trim() === 'team') { console.error(t('team.cmdAlreadyTeam', { dir: rel })); return 2; }
  if (existsSync(join(dir, 'progress'))) { console.error(t('team.cmdHasProgressDir', { dir: rel })); return 2; }

  // owner:--owner 显式优先;缺省试 git config user.name。取不到或不合短标识字符集即拒——
  // owner 是必填语义(E1),且 git 用户名常含空格,静默塞进文件名/候选 ID 只会换个门红。
  let owner = ownerArg;
  if (!owner) {
    try { owner = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim(); } catch { owner = ''; }
  }
  if (!isValidAuthor(owner)) { console.error(t('team.cmdBadOwner', { got: owner || '无' })); return 2; }

  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  // 事件文件名是**瞬时戳**,刻意保 UTC(B12 裁定的例外):它是跨机器排序键,
  // 本地时区会让两地协作者对同一时刻各排各的序。日期戳(收口日等)才走本地日。
  const ts = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
  const eventRel = `progress/events/${ts}-${owner}-00.md`;
  const progressP = join(dir, 'progress.md');
  const hasProgress = existsSync(progressP);

  const bare = new Set();
  for (const f of ['findings.md', 'task_plan.md']) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    for (const tb of parseTables(readFileSync(p, 'utf8'))) {
      const col = tb.header.findIndex((h) => CANDIDATE_COL.test(h));
      if (col === -1) continue;
      for (const row of tb.rows) { const c = (row[col] ?? '').trim(); if (BARE_ID_RE.test(c)) bare.add(c); }
    }
  }

  console.log(t('team.cmdPlanned', { dir: rel }));
  console.log(`  · ${t('team.cmdStepMode', { owner })}`);
  console.log(`  · ${hasProgress ? t('team.cmdStepMigrate', { event: eventRel }) : t('team.cmdStepSeed', { event: eventRel })}`);
  if (bare.size) console.log(`  · ${t('team.cmdStepRename', { ids: [...bare].sort().join(', '), owner })}`);
  if (dry) { console.log(t('team.cmdDryRun')); return 0; }

  const renameIn = (txt) => {
    let out = txt;
    for (const id of bare) {
      const re = new RegExp(`(?<![\\w-])${id}(?![\\w-])`, 'g');
      // 函数替换,不走 replacement string(R7-07):owner 含 `$&`/`$'` 时字符串形态
      // 会按替换模板展开,`F-$&-001` 这类坏 ID 直接写盘。
      out = out.replace(re, () => `${id.slice(0, 2)}${owner}${id.slice(1)}`);
    }
    return out;
  };
  // insertFrontmatterLines 对「整篇仅 `---`」这类无法定位 frontmatter 的文件返 null——
  // 不接住的话 renameIn(null) 直接 TypeError 裸崩,用户看到的是异常栈不是诊断。
  const nextTp = insertFrontmatterLines(tpRaw, ['mode: team', `owner: ${owner}`]);
  if (nextTp === null) { console.error(t('team.cmdBadTaskPlan', { file: `${rel}/task_plan.md` })); return 2; }
  // 写盘带回滚(R7-07 半迁移):此前顺序 tp→findings→事件→删 progress.md,事件写
  // 失败时 tp/findings 已改、mode 已 team,重跑被「已是 team」拒——卡死半迁移态。
  // 现在 progress.md **最后**才删;中途任何失败恢复 tp/findings 原文、拆掉半建的
  // progress/(该目录入口处已验证过原本不存在,拆的必是本次所建)。
  const fnd = join(dir, 'findings.md');
  const fndRaw = existsSync(fnd) ? readFileSync(fnd, 'utf8') : null;
  try {
    writeAtomic(tp, renameIn(nextTp));
    if (fndRaw !== null && bare.size) writeAtomic(fnd, renameIn(fndRaw));
    mkdirSync(join(dir, 'progress', 'events'), { recursive: true });
    const iso = `${now.toISOString().slice(0, 19)}Z`;
    const body = hasProgress ? renameIn(readFileSync(progressP, 'utf8')) : '';
    writeAtomic(join(dir, ...eventRel.split('/')),
      `# 迁移引导事件(solo→team)\n\n> ${iso} 由 \`worklog team\` 迁移;${hasProgress ? '以下为原 progress.md 全文。' : '原任务无 progress.md,自此起以事件记进度。'}\n\n${body}`);
    if (hasProgress) rmSync(progressP);
  } catch (e) {
    try {
      writeAtomic(tp, tpRaw);
      if (fndRaw !== null) writeAtomic(fnd, fndRaw);
      rmSync(join(dir, 'progress'), { recursive: true, force: true });
    } catch { /* 回滚自身失败:诊断行仍指路,人工按原文恢复 */ }
    console.error(t('team.cmdFailed', { dir: rel, msg: e.message }));
    return 2;
  }
  console.log(t('team.cmdDone', { dir: rel }));
  return 0;
}
