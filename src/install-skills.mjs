// skill 分发安装器。通用化自 Scrollery scripts/install-skills.mjs——去 Scrollery 专属
// 默认路径:源改为**本工具包内** skills/planning(thin-runner 拓扑,R2-M3),目标为
// agent home(Codex ~/.codex)。保留 install/check/dry-run/force 四模、冲突默认拒绝
// (exit 2)、备份 + 同卷原子替换、SHA-256 级(字节比对)一致性。
//
// 检查边界(R2-M4):--check 是**本机** onboarding 一致性检查(个人 skill 副本),
// 不进仓库 CI(CI 的 fixture HOME 没有个人副本);仓库 CI 只跑 --selftest。
// Claude Code 刻意不在目标表内:它直接加载项目 .claude/,做 user 级镜像反而会让
// personal skill 按官方优先级遮蔽 project skill。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { PKG_ROOT, atomicCopy } from './lib/fsutil.mjs';

/** 目标注册表:每个目标 = 源目录 + home 解析 + home 下落点。 */
export function targets() {
  return {
    codex: {
      src: join(PKG_ROOT, 'skills', 'planning'),
      defaultHome: () => process.env.CODEX_HOME || join(homedir(), '.codex'),
      destUnder: (home) => join(home, 'skills', 'planning'),
    },
  };
}

function collectFiles(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out; // 目标侧首次安装前不存在
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

// `--force` 留下的备份是本工具自己写的,不算「目标侧多余文件」——否则用过一次
// --force 的机器会从此永远 check 红,把用户训练成无视这道检查。
const isOwnBackup = (rel) => /\.bak-\d{14}$/.test(rel);

/**
 * 对比源与目标,给出每个文件状态:missing | same | differs | extra。
 * R4-09/R5-M5:**双向**比较。原实现只遍历源文件,于是上游删掉的旧文件会永远留在
 * 用户的 skill 目录里,而 `--check` 报「全部同步」——一个已被上游删除的 skill 片段
 * 仍会被 agent 加载,那正是「同步」二字要排除的状态。
 */
function plan(srcDir, destDir) {
  const items = collectFiles(srcDir).map((rel) => {
    const src = join(srcDir, rel);
    const dest = join(destDir, rel);
    let state = 'missing';
    if (existsSync(dest)) state = readFileSync(src).equals(readFileSync(dest)) ? 'same' : 'differs';
    return { rel, src, dest, state };
  });
  const srcRels = new Set(items.map((i) => i.rel));
  for (const rel of collectFiles(destDir)) {
    if (srcRels.has(rel) || isOwnBackup(rel)) continue;
    items.push({ rel, src: null, dest: join(destDir, rel), state: 'extra' });
  }
  return items;
}

/**
 * 执行安装/检查。返回 {exit, actions};不直接 process.exit(便于 selftest 复用)。
 * @param {object} o - {srcDir, destDir, mode:'install'|'check'|'dry-run', force, t}
 */
export function run(o) {
  const t = o.t || ((k) => k);
  const items = plan(o.srcDir, o.destDir);
  const actions = [];
  const differs = items.filter((i) => i.state === 'differs');
  const missing = items.filter((i) => i.state === 'missing');
  const extra = items.filter((i) => i.state === 'extra');

  if (o.mode === 'check') {
    const KEY = { same: 'skills.checkSynced', missing: 'skills.checkMissing', differs: 'skills.checkDrift', extra: 'skills.checkExtra' };
    for (const i of items) actions.push(t(KEY[i.state], { rel: i.rel }));
    return { exit: differs.length || missing.length || extra.length ? 1 : 0, actions };
  }
  if (differs.length && !o.force && o.mode !== 'dry-run') {
    for (const i of differs) actions.push(t('skills.conflict', { dest: i.dest }));
    actions.push(t('skills.conflictHint'));
    return { exit: 2, actions };
  }
  for (const i of [...missing, ...differs]) {
    if (o.mode === 'dry-run') { actions.push(`[dry-run] ${i.dest}`); continue; }
    if (i.state === 'differs') {
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      copyFileSync(i.dest, `${i.dest}.bak-${stamp}`); // 备份带时间戳,回滚=改回原名
    }
    atomicCopy(i.src, i.dest);
    actions.push(t(i.state === 'differs' ? 'skills.replace' : 'skills.install', { dest: i.dest }));
  }
  // 多余文件只报不删:install 的职责是「把源装上」,删用户目录里的东西是另一种权力。
  // --check 会为此返回 1,由人来决定删不删。
  for (const i of extra) actions.push(t('skills.extraKept', { dest: i.dest }));
  if (!missing.length && !differs.length && !extra.length) actions.push(t('skills.synced'));
  return { exit: 0, actions };
}

/** 门禁主入口 */
export function main({ config, t, args }) {
  const getOpt = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
  const reg = targets();
  const target = reg[getOpt('--target') || 'codex'];
  if (!target) { console.error(t('skills.unknownTarget', { targets: Object.keys(reg).join(', ') })); return 2; }
  if (!existsSync(target.src)) { console.error(t('skills.srcMissing', { src: target.src })); return 2; }
  const home = getOpt('--home') || target.defaultHome();
  const mode = args.includes('--check') ? 'check' : args.includes('--dry-run') ? 'dry-run' : 'install';
  const result = run({ srcDir: target.src, destDir: target.destUnder(home), mode, force: args.includes('--force'), t });
  for (const a of result.actions) console.log(a);
  return result.exit;
}

// ── selftest:自建临时 src + fixture HOME,绝不触碰真实 user-home ─────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-skills: ${name}`); if (!cond) failed++; };
  const src = mkdtempSync(join(tmpdir(), 'wk-skills-src-'));
  const home = mkdtempSync(join(tmpdir(), 'wk-skills-home-'));
  try {
    const srcDir = join(src, 'planning');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'SKILL.md'), '# 源 skill\n内容 v1\n');
    const destDir = join(home, 'skills', 'planning');
    const skill = join(destDir, 'SKILL.md');

    // 1. 全新安装:产物字节等于源
    let r = run({ srcDir, destDir, mode: 'install' });
    assert(r.exit === 0 && existsSync(skill) && readFileSync(skill).equals(readFileSync(join(srcDir, 'SKILL.md'))), '全新安装产物与源一致');
    // 2. 幂等:重跑无动作
    r = run({ srcDir, destDir, mode: 'install' });
    assert(r.exit === 0, '重复安装幂等 exit 0');
    // 3. check 同步态 exit 0
    assert(run({ srcDir, destDir, mode: 'check' }).exit === 0, 'check 同步态 exit 0');
    // 4. 篡改:check 报漂移(exit 1);默认安装拒绝(exit 2)且未覆盖
    writeFileSync(skill, '被本地篡改');
    assert(run({ srcDir, destDir, mode: 'check' }).exit === 1, 'check 漂移态 exit 1');
    r = run({ srcDir, destDir, mode: 'install' });
    assert(r.exit === 2 && readFileSync(skill, 'utf8') === '被本地篡改', '冲突默认拒绝且不覆盖');
    // 5. dry-run 零写入
    r = run({ srcDir, destDir, mode: 'dry-run' });
    assert(r.exit === 0 && readFileSync(skill, 'utf8') === '被本地篡改', 'dry-run 零写入');
    // 6. force:备份存在=篡改前,替换后=源
    r = run({ srcDir, destDir, mode: 'install', force: true });
    const baks = readdirSync(destDir).filter((n) => n.startsWith('SKILL.md.bak-'));
    assert(r.exit === 0 && baks.length === 1 && readFileSync(join(destDir, baks[0]), 'utf8') === '被本地篡改'
      && readFileSync(skill).equals(readFileSync(join(srcDir, 'SKILL.md'))), 'force 先备份再原子替换');
    // 7. 自己留的 .bak- 备份不算多余(否则用过一次 --force 就永远 check 红)
    assert(run({ srcDir, destDir, mode: 'check' }).exit === 0, 'force 后 check 回绿(自留备份不计多余)');
    // 8. R4-09/R5-M5:目标侧多余文件(上游已删的旧版残留)须被 --check 报出。
    //    run() 默认 t 是 (k)=>k,只回 key 不拼参数,故此处传个会拼参数的测试 translator——
    //    否则只能断言退出码,断言不到「报的是哪个文件」。
    const tt = (k, p = {}) => `${k} ${Object.values(p).join(' ')}`;
    const stale = join(destDir, 'OLD-REMOVED.md');
    writeFileSync(stale, '上游已删除的旧文件');
    r = run({ srcDir, destDir, mode: 'check', t: tt });
    assert(r.exit === 1 && r.actions.some((a) => a.startsWith('skills.checkExtra') && a.includes('OLD-REMOVED.md')), 'check 报出目标侧多余文件');
    // 9. install 不删多余文件(装上源是它的职责;删用户目录是另一种权力)
    r = run({ srcDir, destDir, mode: 'install' });
    assert(r.exit === 0 && existsSync(stale), 'install 保留多余文件不删');
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
  console.log(failed ? `\n✗ install-skills selftest 失败 ${failed} 项` : '\n✓ install-skills selftest 全部通过');
  return failed ? 1 : 0;
}
