// 展示面本地化:报错/CLI 文案外置到 locales/<lang>.json,经查表输出。
// MVP 仅 zh catalog;fallback 链即 zh 自身(R2-m2)。加英文只是新增一份 catalog、零改逻辑。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PKG_ROOT } from './fsutil.mjs';

const DEFAULT_LANG = 'zh';

// ── 命令引导词的运行期改写 ────────────────────────────────────────────────
// 展示文案里的 CLI 命令一律以 **bin 名 `worklog`** 书写(装好后 PATH 上就是它)。
// 但纯 npx 用户没有持久 bin:裸敲 `worklog …` 要么 command-not-found,要么被 npm 上
// 他人的同名包 `worklog` 静默劫持(自遮蔽坑,见 README §16)。故检出「本进程经 npx /
// `npm exec` 启动」时,把命令引导词从 `worklog` 换成 `npx <包名>`,令打印出的每条 hint
// 可直接复制粘贴。
//
// 判据(经 locales 全量枚举验证:26 命中,余 `docs/worklogs/`、`.worklogrc.jsonc`、
// 包名 `worklog-kit` 皆非命令、皆不动):只动「命令引导位」——反引号或(半/全角)冒号
// 紧接 `worklog`、且其后为空格(即后面确实跟着子命令)。默认 cli='worklog' 时零改写,
// 保证所有内部调用方(e2e、doctor selftest 断译文子串)逐字节稳定;npx 感知只在真实
// CLI 入口(bin/worklog.mjs)显式 opt-in。
const CLI_LEAD = /([`:：])worklog(?= )/g;

/** 包名(npx 形态用它,读 package.json 不硬编码以防漂移)。 */
function pkgName() {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).name || 'worklog-kit';
  } catch { return 'worklog-kit'; }
}

/**
 * 解析本次运行应展示的 CLI 引导词。
 * - `WORKLOG_KIT_CLI` 显式覆盖(测试/别名用户)⇒ 原样采用。
 * - 经 npx / `npm exec` 启动(npm_command==='exec',实测信号)⇒ `npx <包名>`,hint 可直接跑。
 *   注:`npm run <script>` 走 npm_command==='run-script'(非 'exec'),此时 bin 已在本地
 *   node_modules/.bin,故正确保持裸 `worklog`,不误加 npx 前缀。
 * - 其余(装了 bin 直接跑,无 npm_command)⇒ 裸 `worklog`,即用户 PATH 上的名字。
 */
export function resolveCli(env = process.env) {
  if (env.WORKLOG_KIT_CLI) return env.WORKLOG_KIT_CLI;
  if (env.npm_command === 'exec') return `npx ${pkgName()}`;
  return 'worklog';
}

/** 把一段已渲染文本里的命令引导词改写为目标 CLI 名。cli='worklog' 时原样返回(热路径短路)。 */
export function rewriteCli(text, cli) {
  if (cli === 'worklog') return text;
  return text.replace(CLI_LEAD, (_m, lead) => `${lead}${cli}`);
}

/** 载入语言 catalog;缺失回退到默认语言。 */
export function loadCatalog(lang = DEFAULT_LANG) {
  const path = join(PKG_ROOT, 'locales', `${lang}.json`);
  const fallback = join(PKG_ROOT, 'locales', `${DEFAULT_LANG}.json`);
  const file = existsSync(path) ? path : fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * 构造翻译函数 t(key, params)。缺 key 时返回 key 本身(不崩;暴露漏译)。
 * 占位符形如 {name},由 params 对象替换。
 */
export function makeT(catalog, cli = 'worklog') {
  return (key, params = {}) => {
    const s = catalog[key];
    if (s === undefined) return key; // 缺 key fallback:返回 key 名,便于发现漏译
    // 单趟替换(R6-§5):正则一次扫描,每个 {占位符} 只查一次 params。
    // 顺序 replaceAll 循环会让先替入的参数值里的字面 {otherKey} 被后续迭代二次展开(模板注入);
    // 单趟扫描的替换结果不回喂扫描器,消除该二次展开。params 缺的占位符原样留存(暴露漏译)。
    const out = s.replace(/\{([^{}]+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    // 命令引导词改写在参数替换**之后**:令占位符值里的命令(如未来 hint 传入路径含命令)
    // 也一并归一;默认 cli='worklog' 时 rewriteCli 短路返回,零开销、零改写。
    return rewriteCli(out, cli);
  };
}

/** 便捷:按语言直接取 t。cli 缺省 'worklog'(规范名);真实 CLI 入口传 resolveCli() 开启 npx 感知。 */
export function makeTranslator(lang, cli = 'worklog') {
  return makeT(loadCatalog(lang), cli);
}
