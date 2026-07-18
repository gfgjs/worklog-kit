// `worklog closeout <任务>`(F-013;设计件 §6):收口**机械步**收进一条命令。
//
// 边界:判断件(closeout.md 处置表、滚动状态现况、方案回写)仍由人/AI 先写好,
// 命令在 closeout.md 缺席时拒绝执行。agent 环境下本命令走工具权限提示——
// 「用户批准收口」由此从纸面契约(F-012)变成真实按钮;closeout 加 approved 字段
// 类方案是假强制(AI 照样能填),权限提示是当前唯一有牙齿的机械锚点。
//
// 全程**不 commit**:收口 commit 属用户批准语义,命令只把工作树摆到一眼可 review 的状态。
// 迁移用 fs rename + 尽力 `git add`(rename 推断在 diff 时按内容判定,不依赖 git mv;
// 这让命令在非 git 环境/e2e temp 仓也能走通,失败只降级为提醒)。
import { existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter, escapeRe, makeFenceSkipper } from './lib/frontmatter.mjs';
import { relPath } from './lib/fsutil.mjs';
import { TRIO } from './lib/docmeta.mjs';
import { teamDeclOf, main as checkDocs } from './check-docs.mjs';
import { main as checkIndex } from './check-index.mjs';
import { resolveTaskDir, stripTaskDate, flipStatusSnapshot, writeAtomic } from './lib/taskref.mjs';
import { indexHeadings } from './lib/config.mjs';
import { todayLocal } from './lib/dates.mjs';

export function main({ root, config, t, args }) {
  const dry = args.includes('--dry-run');
  let summary = '';
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') continue;
    if (a === '--summary') { if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) summary = args[++i]; continue; }
    if (!a.startsWith('-')) positionals.push(a);
  }
  const nameArg = positionals[0];
  if (!nameArg) { console.error(t('closeout.cmdUsage')); return 2; }
  const r = resolveTaskDir(root, config, nameArg);
  if (!r.ok) {
    console.error(t(r.reason === 'ambiguous' ? 'task.ambiguous' : 'task.notFound',
      { name: nameArg, base: `${config.docsDir}/planning`, dirs: (r.dirs ?? []).join(', ') }));
    return 2;
  }
  const dir = r.dir;
  const rel = relPath(root, dir);

  // 前置:三件齐(team 档 progress 承载 = progress/events/,与 R5-M1 门同一判据)+ closeout.md 已写
  const teamCtx = teamDeclOf(dir);
  const pieces = ['task_plan.md', 'findings.md', teamCtx.team ? 'progress/events' : 'progress.md', 'closeout.md'];
  for (const f of pieces) {
    if (!existsSync(join(dir, ...f.split('/')))) { console.error(t('closeout.cmdMissingPiece', { dir: rel, file: f })); return 2; }
  }
  // E6 前置同门禁:team 任务须由 owner 具名收口(门在合并时咬,命令在起跑线就咬)
  if (teamCtx.team) {
    const got = (parseFrontmatter(readFileSync(join(dir, 'closeout.md'), 'utf8')).data.owner ?? '').trim();
    if (!got || got !== teamCtx.owner) { console.error(t('closeout.cmdOwnerGate', { owner: teamCtx.owner || '无', got: got || '无' })); return 2; }
  }

  const today = todayLocal(); // 收口日=命令执行日,本地日(既有惯例;B12 起全工具日期戳同源)
  const destName = `${today}-${stripTaskDate(r.name)}`;
  const wl = join(root, config.docsDir, 'worklogs');
  const dest = join(wl, destName);
  if (existsSync(dest)) { console.error(t('closeout.cmdDestExists', { dest: relPath(root, dest) })); return 2; }
  const readmeP = join(wl, 'README.md');
  // 归档节标题走集中兜底层(R6-§5):config.index 是浅合并,用户只声明 {mode} 时
  // 直读 config.index.archivedHeading 得 undefined。indexHeadings 逐键兜底,与 init/
  // check-index/upgrade 同一处标题真相,避免 closeout 登记节找错标题。
  const heading = indexHeadings(config).archivedHeading;

  const flipTargets = [...TRIO, 'closeout.md'].filter((f) => existsSync(join(dir, f)));
  console.log(t('closeout.cmdPlanned', { dir: rel, dest: relPath(root, dest) }));
  for (const f of flipTargets) console.log(`  · ${t('closeout.cmdStepFlip', { file: f })}`);
  console.log(`  · ${t('closeout.cmdStepMove')}`);
  console.log(`  · ${t('closeout.cmdStepReadme', { heading })}`);
  if (dry) { console.log(t('closeout.cmdDryRun')); return 0; }

  // 1. status → snapshot(BOM/行尾原样;无 status 行提示人工核,不静默)
  for (const f of flipTargets) {
    const p = join(dir, f);
    const flipped = flipStatusSnapshot(readFileSync(p, 'utf8'));
    if (flipped === null) console.log(t('closeout.cmdNoStatusLine', { file: f }));
    else writeAtomic(p, flipped);
  }
  // 2. 归档迁移
  mkdirSync(wl, { recursive: true });
  renameSync(dir, dest);
  // 3. worklogs README 登记行(插到「已归档任务」节末尾;摘要不给则留待填占位——
  //    摘要是判断件,机械步只保证登记行存在且含反引号目录名,满足索引门)
  const row = `- ${stripTaskDate(r.name)} — ${today} — ${summary || '(收口摘要待填,见 closeout.md 阶段结论)'} — \`${destName}/\``;
  if (!existsSync(readmeP)) {
    console.log(t('closeout.cmdReadmeMissing', { path: relPath(root, readmeP), row }));
  } else {
    const raw = readFileSync(readmeP, 'utf8');
    // 各行保留自身行尾(insertDirRow 同款先例;B13):原实现 split(/\r?\n/) + join(主导行尾)
    // 会把混合行尾文件整体归一——真变更(一行登记)淹没在满屏 EOL 噪声里。
    const lines = raw.split(/(?<=\n)/);
    // 锚定匹配(与 check-index 同契约):原 includes(heading) 是子串命中,
    // 「## 历史已归档任务说明」这类标题会被抢先当登记节,行插错节。
    // 围栏感知(B8):围栏里的 `## 已归档任务` 是示例,既不作节起点、也不终结节。
    const headingRe = new RegExp(`^#{1,6}\\s+${escapeRe(heading)}(?=\\s|$)`);
    const skip = makeFenceSkipper();
    const inCode = lines.map((l) => skip(l));
    const hi = lines.findIndex((l, i) => !inCode[i] && headingRe.test(l));
    if (hi === -1) {
      console.log(t('closeout.cmdReadmeMissing', { path: relPath(root, readmeP), row }));
    } else {
      let insertAt = hi + 1;
      for (let i = hi + 1; i < lines.length; i++) {
        if (!inCode[i] && /^#{1,6}\s/.test(lines[i])) break;
        if (lines[i].trim() !== '') insertAt = i + 1;
      }
      // 行尾随插入点邻行走;邻行是文件末行且无行尾时先补齐(insertDirRow 同款)
      const anchor = lines[insertAt - 1];
      const eol = anchor.endsWith('\r\n') ? '\r\n' : '\n';
      if (!/\n$/.test(anchor)) lines[insertAt - 1] = `${anchor}${eol}`;
      lines.splice(insertAt, 0, `${row}${eol}`);
      writeAtomic(readmeP, lines.join(''));
    }
  }
  // 4. 尽力 git 暂存(失败降级为提醒;非 git 环境照常走完)
  try {
    execFileSync('git', ['add', '-A', '--', rel, relPath(root, dest), relPath(root, readmeP)], { cwd: root, stdio: 'ignore' });
  } catch (e) {
    console.log(t('closeout.cmdGitSkipped', { msg: (e?.message ?? String(e)).split('\n')[0] }));
  }
  // 5. 双门复验(进程内;门红则本命令 exit 1——机械步已落盘,红的是内容,交回人手)
  console.log('');
  const c1 = checkDocs({ root, config, t, args: [] });
  const c2 = checkIndex({ root, config, t, args: [] });
  console.log(`\n${t('closeout.cmdReminders')}`);
  console.log(t('closeout.cmdDone', { dest: relPath(root, dest) }));
  return c1 || c2 ? 1 : 0;
}
