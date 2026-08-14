// 全量 selftest 聚合器(设计方案 §10)。
// 各门保留自己的 `--selftest` 以便定点重跑;本入口是 CI 与 npm run selftest 的单一门面,
// 新增套件只须登记到 SUITES —— 避免「加了套件但 CI 脚本没加」这类只在事后才发现的漏跑。
import { selftest as configSelftest } from './lib/config.mjs';
import { selftest as coreSelftest } from './lib/core.selftest.mjs';
import { selftest as cliargsSelftest } from './lib/cliargs.mjs';
import { selftest as jsonceditSelftest } from './lib/jsoncedit.mjs';
import { selftest as templatesSelftest } from './lib/templates.mjs';
import { selftest as docsSelftest } from './check-docs.mjs';
import { selftest as indexSelftest } from './check-index.mjs';
import { selftest as skillsSelftest } from './install-skills.mjs';
import { selftest as doctorSelftest } from './doctor.mjs';
import { selftest as upgradeSelftest } from './upgrade.mjs';
import { selftest as gateSelftest } from './lib/gate.selftest.mjs';
import { selftest as buildSelftest } from './build-index.mjs';
import { selftest as tasksSelftest } from './tasks.mjs';
import { selftest as e2eSelftest } from './e2e.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PKG_ROOT } from './lib/fsutil.mjs';

function externalToolSelftest(script, args = [], { skipDuringRelease = false, env } = {}) {
  // release-selftest --full 会在已安装包内再次跑 `worklog-kit selftest`。此环境哨兵
  // 只跳过外层已经在执行的真包/度量工具，避免 release→selftest→release 递归；正常
  // 仓库 CI/selftest 没有哨兵，两套都是真正强制套件。
  if (skipDuringRelease && process.env.WORKLOG_RELEASE_SELFTEST_ACTIVE === '1') {
    console.log('✓ 外部工具套件由当前 release-selftest 外层覆盖（防递归）');
    return 0;
  }
  const p = join(PKG_ROOT, ...script.split('/'));
  if (!existsSync(p)) {
    // `tools/` 是仓库 CI/发布工具，不在 npm files 清单；已安装包的产品 selftest
    // 保持可运行。源码仓（有 .git）若入口丢失则必须红，不能把聚合漏接悄悄降级。
    if (!existsSync(join(PKG_ROOT, '.git'))) {
      console.log(`✓ 已安装包不分发仓库工具，跳过:${script}`);
      return 0;
    }
    console.error(`✗ 源码仓外部工具套件入口缺失:${p}`);
    return 1;
  }
  try {
    execFileSync(process.execPath, [p, ...args], { cwd: PKG_ROOT, stdio: 'inherit', ...(env ? { env: { ...process.env, ...env } } : {}) });
    return 0;
  } catch { return 1; }
}

const SUITES = [
  ['config', configSelftest],
  ['lib-core(frontmatter/taskref/fsutil 纯函数)', coreSelftest],
  ['cliargs(F-001 未知参数兜底)', cliargsSelftest],
  ['jsoncedit(F-005 注释保全)', jsonceditSelftest],
  ['templates(F-004 副本三态判定)', templatesSelftest],
  ['upgrade', upgradeSelftest],
  ['gate(profile/baseline/warn-only)', gateSelftest],
  ['check-docs', docsSelftest],
  ['check-index', indexSelftest],
  ['build-index', buildSelftest],
  ['install-skills', skillsSelftest],
  ['doctor(main 主流程+EOL 体检+行数护栏)', doctorSelftest],
  ['tasks(产品命令 start/list/resume/note/checkpoint/next-id)', tasksSelftest],
  ['token-audit(解析/跨窗 cumulative delta)', () => externalToolSelftest('tools/token-audit.mjs', ['--selftest'])],
  ['sync-public(fs walker/symlink/containment)', () => externalToolSelftest('tools/sync-public.mjs', ['--fs-selftest'])],
  // R2-01 回归:以**敌意 env**(npm_config_allow_scripts 预置)spawn release-selftest——
  // 模拟「npm run selftest」的 env 注入,证明消费仓 install 对宿主 allow-scripts 免疫。
  // 有人日后撤掉 release-selftest 内的清洗,本套件即使直接「node bin/worklog.mjs selftest」也会红。
  ['release-selftest(唯一 tgz 真包消费链,敌意 allow-scripts env)', () => externalToolSelftest('tools/release-selftest.mjs', [], { skipDuringRelease: true, env: { npm_config_allow_scripts: 'koffi,node-pty' } })],
  // e2e 排最后但**不是可选的**:本仓 == 包,消费者才会撞的断裂在单元测里结构性
  // 不可见(dogfood 遮蔽)。它是唯一能看见消费路径的一套。
  ['e2e', e2eSelftest],
];

export function main() {
  const failed = [];
  for (const [name, run] of SUITES) {
    console.log(`\n── ${name} ──`);
    if (run() !== 0) failed.push(name);
  }
  if (failed.length) { console.error(`\n✗ selftest 失败套件:${failed.join(', ')}`); return 1; }
  console.log(`\n✓ selftest 全部通过(${SUITES.length} 套)`);
  return 0;
}
