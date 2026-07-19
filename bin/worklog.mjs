#!/usr/bin/env node
// worklog-kit CLI 入口。thin-runner:引擎驻本包,消费仓只落配置 + docs + ci.yml。
// 用法见 `worklog`(无参)或 locales/<lang>.json 的 cli.usage。
import { loadConfig } from '../src/lib/config.mjs';
import { makeTranslator, resolveCli } from '../src/lib/i18n.mjs';
import { main as checkDocs, selftest as docsSelftest } from '../src/check-docs.mjs';
import { main as checkIndex, selftest as indexSelftest } from '../src/check-index.mjs';
import { main as buildIndex } from '../src/build-index.mjs';
import { indexMode } from '../src/lib/config.mjs';
import { main as skills, selftest as skillsSelftest } from '../src/install-skills.mjs';
import { main as init } from '../src/init.mjs';
import { main as doctor } from '../src/doctor.mjs';
import { main as upgrade, selftest as upgradeSelftest } from '../src/upgrade.mjs';
import { main as baseline } from '../src/baseline.mjs';
import { main as teamCmd } from '../src/team.mjs';
import { main as closeoutCmd } from '../src/closeout.mjs';
import { selftest as configSelftest } from '../src/lib/config.mjs';
import { main as selftestAll } from '../src/selftest.mjs';
import { mainStart, mainList, mainResume, mainNote, mainCheckpoint, mainNextId } from '../src/tasks.mjs';
import { validateArgs } from '../src/lib/cliargs.mjs';

const [, , cmd, ...args] = process.argv;
const root = process.cwd();
const isSelftest = args.includes('--selftest');

const { config, errors } = loadConfig(root);
// resolveCli():经 npx/`npm exec` 启动时,hint 里的 `worklog …` 印成 `npx worklog-kit …`
// (纯 npx 用户没有持久 bin,裸 `worklog` 会 command-not-found 或撞自遮蔽坑,README §16)。
const t = makeTranslator(config.lang || 'zh', resolveCli());

/** 校验命令(check/index):配置形状错时拒绝门禁(否则可能漏判)。 */
function requireGoodConfig() {
  if (errors.length) {
    for (const e of errors) console.error(t('cli.configShapeError', { msg: e }));
    process.exit(2);
  }
}

function dispatch() {
  // F-001:参数中央兜底——`--help` 永不执行命令(init --help 曾被当真跑,在 cwd stamp 文件),
  // 未知参数一律拒绝运行。各命令的局部校验保留作纵深(见 src/lib/cliargs.mjs)。
  if (cmd !== undefined) {
    const { help, unknown, missingValue } = validateArgs(cmd, args);
    if (help) { console.log(t('cli.usage')); return 0; }
    if (unknown.length) {
      console.error(t('cli.unknownFlag', { cmd, flags: unknown.join(' ') }));
      console.log(t('cli.usage'));
      return 2;
    }
    // R7-09 拆分修:flag 出现但缺值 ⇒ exit 2(flag 未出现才走各命令的文档化默认)
    if (missingValue.length) {
      console.error(t('cli.flagNeedsValue', { cmd, flags: missingValue.join(' ') }));
      console.log(t('cli.usage'));
      return 2;
    }
  }
  switch (cmd) {
    case 'init':
      return init({ root, t, args });
    case 'check':
      if (isSelftest) return docsSelftest();
      requireGoodConfig();
      return checkDocs({ root, config, t, args });
    case 'index': {
      if (isSelftest) return indexSelftest();
      requireGoodConfig();
      // D-009:`index build` / `index check` 显式子命令;裸 `worklog index` 按档别名并
      // 打印所指——现役脚本/CI 已固化裸 index,别名保兼容,打印防 CLI 层语义分叉。
      const [sub, ...rest] = args;
      if (sub === 'build') return buildIndex({ root, config, t, args: rest });
      if (sub === 'check') return checkIndex({ root, config, t, args: rest });
      console.log(t('cli.indexAlias', { mode: indexMode(config) }));
      return checkIndex({ root, config, t, args });
    }
    case 'skills':
      if (isSelftest) return skillsSelftest();
      return skills({ config, t, args });
    case 'config':
      // 目前只有 --selftest 一种用法(配置解析/校验的定点重跑);
      // 无 --selftest 时打印当前配置的加载结果,便于诊断「我的配置到底被读成什么」。
      if (isSelftest) return configSelftest();
      console.log(JSON.stringify(config, null, 2));
      requireGoodConfig();
      return 0;
    case 'baseline':
      requireGoodConfig();
      return baseline({ root, config, t, args });
    case 'team':
      // P3 阶段 4(D-029):solo→team 一次性迁移。会重写三件套,配置必须可信
      requireGoodConfig();
      return teamCmd({ root, config, t, args });
    case 'closeout':
      // F-013:收口机械步。agent 环境下本命令的工具权限提示即「用户批准收口」按钮
      requireGoodConfig();
      return closeoutCmd({ root, config, t, args });
    // ── 产品化机械命令(复审 §8.2):建档/清单/接续视图/分节追加/热区压缩/编号分配 ──
    case 'start':
      requireGoodConfig();
      return mainStart({ root, config, t, args });
    case 'list':
      requireGoodConfig();
      return mainList({ root, config, t, args });
    case 'resume':
      requireGoodConfig();
      return mainResume({ root, config, t, args });
    case 'note':
      requireGoodConfig();
      return mainNote({ root, config, t, args });
    case 'checkpoint':
      requireGoodConfig();
      return mainCheckpoint({ root, config, t, args });
    case 'next-id':
      requireGoodConfig();
      return mainNextId({ root, config, t, args });
    case 'upgrade':
      // `--selftest` 必须在真跑之前判。此前漏了这一支:`worklog upgrade --selftest`
      // 会被当成「带一个无关标志的真迁移」执行——施工时实测踩中,当场把本仓配置升版并
      // 抹掉全部注释(F-005)。其余命令都有这一支,唯独它没有,是**不一致本身**在咬人。
      if (isSelftest) return upgradeSelftest();
      // 刻意**不**过 requireGoodConfig:配置旧到过不了当前校验时,upgrade 正是那把梯子。
      // 拿新门拦住通往新门的路,就是 R5-C3 说的「只上门不给梯子」。
      return upgrade({ root, t, args });
    case 'selftest':
      return selftestAll();
    case 'doctor':
      return doctor({ root, t, args });
    case undefined:
    case '-h':
    case '--help':
      console.log(t('cli.usage'));
      return 0;
    default:
      console.error(t('cli.unknownCommand', { cmd }));
      console.log(t('cli.usage'));
      return 2;
  }
}

process.exit(dispatch());
