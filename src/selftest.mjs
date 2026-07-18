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
import { selftest as e2eSelftest } from './e2e.mjs';

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
