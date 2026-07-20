// CLI 参数兜底层(F-001):求助永不执行,手滑永不静默。
//
// 病灶:`worklog-kit init --help` 此前不识别该 flag——于是「求助」被当成「开工」,直接在
// cwd 执行 init,真仓 stamp 出 8 处文件(2026-07-16 靶场亲历,靠隔离区回滚)。
// upgrade 早为同型风险自带 KNOWN_FLAGS 拒收(F-010:`--dry-runn` 少个字母 = 预览变真迁移);
// 本层把该范式提升为**全命令**中央契约:
//   - `-h`/`--help` 在任何命令下只打印用法,绝不执行;
//   - 不认识的参数(flag 或裸位置参数)一律拒绝运行,exit 2 由 bin 统一给。
// 各命令的局部校验(upgrade 的 KNOWN_FLAGS、init 的 --profile 枚举)保留作纵深,不撤。
export const COMMAND_ARGS = {
  init: { flags: ['--dry-run', '--skill-only'], valueFlags: ['--profile'] },
  check: { flags: ['--selftest', '--warn-only', '--links-only'] },
  index: { flags: ['--selftest', '--warn-only'], positionals: ['build', 'check'] },
  skills: { flags: ['--selftest', '--check', '--dry-run', '--force'], valueFlags: ['--target', '--home'] },
  config: { flags: ['--selftest'] },
  baseline: { flags: ['--update'] },
  upgrade: { flags: ['--selftest', '--dry-run'] },
  doctor: { flags: ['--verbose', '--json'] },
  selftest: { flags: [] },
  // P3 阶段 4:任务名是**任意**字符串(含中文),走 freePositional 档而非枚举白名单
  team: { flags: ['--dry-run'], valueFlags: ['--owner'], freePositional: true },
  closeout: { flags: ['--dry-run'], valueFlags: ['--summary'], freePositional: true },
  // 产品化机械命令(复审 §8.2)
  start: { flags: ['--dry-run'], valueFlags: ['--mode'], freePositional: true },
  list: { flags: ['--active', '--ready', '--json'] },
  resume: { flags: ['--compact', '--full'], freePositional: true },
  note: { flags: ['--stdin'], valueFlags: ['--kind'], freePositional: true },
  checkpoint: { flags: ['--stdin', '--dry-run'], freePositional: true },
  'next-id': { flags: ['--json'] },
};

/**
 * @returns {{help: boolean, unknown: string[], missingValue: string[]}}
 *   help=true ⇒ 只打用法;unknown/missingValue 非空 ⇒ 拒绝执行(exit 2 由 bin 统一给)
 */
export function validateArgs(cmd, args) {
  const spec = COMMAND_ARGS[cmd];
  if (!spec) return { help: false, unknown: [], missingValue: [] }; // 未登记的命令归 dispatch 的 default 分支管
  const flags = new Set(spec.flags ?? []);
  const valueFlags = new Set(spec.valueFlags ?? []);
  const positionals = new Set(spec.positionals ?? []);
  const unknown = [];
  const missingValue = [];
  let help = false;
  let positionalUsed = false; // 位置参数至多一个(当前只有 index 的子命令)
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') { help = true; continue; }
    if (valueFlags.has(a)) {
      // 值随下一个 token;缺席或本身是 flag ⇒ 缺值,中央层即拒(R7-09 拆分修,第七轮
      // 复核 §4.3:「flag 出现但缺值」是手滑,exit 2;「flag 未出现」回落文档化默认是 UX,
      // 保留)。旧裁「缺值不在此层报」已推翻:`skills --target` 少打值曾静默装到默认位置,
      // 与 F-001「多给的东西不当无害忽略」同型——少给的也不当。
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) { i++; continue; }
      missingValue.push(a);
      continue;
    }
    if (flags.has(a)) continue;
    // freePositional:恰一个任意位置参数(任务名,含中文);第二个照旧拒——
    // 「多给的东西不当无害忽略」是本层的全部要义,自由档只放宽取值域不放宽数量
    if (!a.startsWith('-') && (positionals.has(a) || spec.freePositional) && !positionalUsed) { positionalUsed = true; continue; }
    unknown.push(a);
  }
  return { help, unknown, missingValue };
}

// ── selftest ────────────────────────────────────────────────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-cliargs: ${name}`); if (!cond) failed++; };
  const v = validateArgs;

  assert(v('init', ['--help']).help === true, 'init --help 只求助(F-001 病灶:此前直接执行 stamp)');
  assert(v('check', ['-h']).help === true, '-h 全命令同义');
  assert(v('init', ['--halp']).unknown.join() === '--halp', '手滑 flag 被拒(--halp)');
  assert(v('init', ['--dry-run', '--skill-only']).unknown.length === 0, 'init 合法 flag 全过');
  assert(v('init', ['--profile', 'brownfield']).unknown.length === 0, '取值 flag 连值一起过(--profile <v>)');
  assert(v('init', ['brownfield']).unknown.join() === 'brownfield', '裸位置参数对 init 不合法');
  assert(v('upgrade', ['--dry-runn']).unknown.join() === '--dry-runn', 'upgrade 手滑 --dry-runn 中央层即拒(F-010 同型,纵深第一道)');
  assert(v('index', ['build']).unknown.length === 0, 'index build 合法');
  assert(v('index', ['check', '--warn-only']).unknown.length === 0, 'index check + 门级 flag 合法');
  assert(v('index', ['bild']).unknown.join() === 'bild', 'index 子命令拼错被拒(bild 不再静默落进裸别名)');
  assert(v('index', ['build', 'check']).unknown.join() === 'check', '位置参数至多一个');
  assert(v('skills', ['--target', 'codex', '--check']).unknown.length === 0, 'skills 取值 flag + 模式 flag 合法');
  assert(v('baseline', ['--update']).unknown.length === 0 && v('baseline', ['--updte']).unknown.length === 1, 'baseline 正反例');
  assert(v('nonesuch', ['--whatever']).unknown.length === 0 && v('nonesuch', []).help === false, '未登记命令不在此层管(dispatch default 已拒)');
  assert(v('closeout', ['P3多人软肋施工', '--dry-run']).unknown.length === 0, 'closeout 中文任务名 + --dry-run 合法(freePositional)');
  assert(v('closeout', ['甲任务', '乙任务']).unknown.join() === '乙任务', 'freePositional 仍至多一个(多给即拒)');
  assert(v('team', ['甲任务', '--owner', '小明']).unknown.length === 0, 'team 任务名 + --owner 取值合法');
  assert(v('team', ['--ownr', 'x']).unknown.join() === '--ownr', 'team 手滑 flag 被拒(--ownr;整条命令 exit 2,后随值不再有机会被误用)');
  // ── 产品化机械命令(复审 §8.2)──
  assert(v('start', ['甲任务', '--mode', 'lite', '--dry-run']).unknown.length === 0, 'start 中文任务名 + --mode 取值合法');
  assert(v('note', ['甲任务', '--kind', 'finding', '--stdin']).unknown.length === 0, 'note 三参齐合法');
  assert(v('note', ['甲任务', '--kind']).missingValue.join() === '--kind', 'note --kind 缺值被拒(R7-09 同契约)');
  assert(v('checkpoint', ['甲任务', '--stdim']).unknown.join() === '--stdim', 'checkpoint 手滑 flag 被拒');
  assert(v('next-id', ['--json']).unknown.length === 0 && v('next-id', ['多余']).unknown.join() === '多余', 'next-id 正反例(无 freePositional,裸参数拒)');
  assert(v('resume', ['甲任务', '--full']).unknown.length === 0 && v('list', ['--ready', '--json']).unknown.length === 0, 'resume/list 合法组合全过');
  // ── R7-09 拆分修:flag 出现但缺值 ⇒ 拒;flag 未出现 ⇒ 不关此层(命令自走默认)──
  assert(v('skills', ['--target']).missingValue.join() === '--target', 'R7-09:尾置取值 flag 缺值被拒(曾静默装到默认位置)');
  assert(v('skills', ['--target', '--check']).missingValue.join() === '--target', 'R7-09:取值 flag 后随另一 flag 也算缺值');
  assert(v('team', ['甲任务', '--owner']).missingValue.join() === '--owner', 'R7-09:--owner 缺值被拒(曾回落 git user.name)');
  assert(v('init', ['--profile', 'brownfield']).missingValue.length === 0, 'R7-09:带值即无缺值报告');
  assert(v('skills', []).missingValue.length === 0, 'R7-09:flag 未出现不算缺值(回落默认是文档化 UX,保留)');

  console.log(failed ? `\n✗ cliargs selftest 失败 ${failed} 项` : '\n✓ cliargs selftest 全部通过');
  return failed ? 1 : 0;
}
