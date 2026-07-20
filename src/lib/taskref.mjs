// 任务目录解析 + frontmatter 原位编辑(P3 阶段 4:`worklog-kit team` / `worklog-kit closeout` 共用)。
//
// 编辑函数的纪律与 insertIdLine 同款(docmeta.mjs):BOM 与行尾**原样保留**——
// 收口/迁移命令的职责不包括顺手重排用户文件的格式,否则真变更淹没在 EOL 噪声里。
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FM_DELIM_RE } from './frontmatter.mjs';
// 原子写驻 fsutil(文件系统工具的家);此处转发保住既有 `from './lib/taskref.mjs'` 引用
export { writeAtomic } from './fsutil.mjs';

/** 任务目录名的日期前缀(planning=开工日 / worklogs=收口日) */
export const TASK_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

export const stripTaskDate = (dirName) => dirName.replace(TASK_DATE_PREFIX, '');

/**
 * 按任务名解析 planning 下的任务目录。先试全目录名精确匹配,再试剥日期前缀匹配
 * (NFC 归一,D-007)——用户口中的「任务名」通常不带开工日。多义即拒,不猜。
 * @returns {{ok: true, dir: string, name: string} | {ok: false, reason: 'notFound'|'ambiguous', dirs?: string[]}}
 */
export function resolveTaskDir(root, config, name) {
  // R6-12:任务名是**目录名**,不是路径——含分隔符或 `.`/`..` 即拒。不消毒的话
  // `worklog-kit closeout ..\..\x` 可解析到仓外并 ok:true,下游 renameSync 会真迁移。
  if (!name || /[\\/]/.test(name) || name === '.' || name === '..') return { ok: false, reason: 'notFound' };
  const base = join(root, config.docsDir, 'planning');
  if (!existsSync(base)) return { ok: false, reason: 'notFound' };
  const exact = join(base, name);
  if (existsSync(exact) && statSync(exact).isDirectory()) return { ok: true, dir: exact, name };
  const want = name.normalize('NFC');
  const hits = readdirSync(base).sort().filter((n) => {
    const p = join(base, n);
    return statSync(p).isDirectory() && stripTaskDate(n).normalize('NFC') === want;
  });
  if (hits.length === 1) return { ok: true, dir: join(base, hits[0]), name: hits[0] };
  return hits.length ? { ok: false, reason: 'ambiguous', dirs: hits } : { ok: false, reason: 'notFound' };
}

/**
 * 在 frontmatter 顶端插入若干行;整篇无 frontmatter 则新建一块(trio 允许无头,
 * `mode: team` 声明需要一个家)。返回新全文。
 */
export function insertFrontmatterLines(raw, lines) {
  const bom = raw.charCodeAt(0) === 0xfeff ? '﻿' : '';
  const text = bom ? raw.slice(1) : raw;
  const nl = text.indexOf('\n');
  const first = nl === -1 ? text : text.slice(0, text[nl - 1] === '\r' ? nl - 1 : nl);
  // 开栏判定走 FM_DELIM_RE 单一实现(N1):`---oops` 不是 frontmatter,给它**新建**块,
  // 不把声明行插进 parseFrontmatter/门禁都不认的伪块。
  if (!FM_DELIM_RE.test(first)) return `${bom}---\n${lines.join('\n')}\n---\n\n${text}`;
  if (nl === -1) return null;
  // 行尾按首行自己的行尾判(insertIdLine 同款:混合行尾文件全文探测会插错位置)
  const eol = text[nl - 1] === '\r' ? '\r\n' : '\n';
  const cut = nl + 1;
  return `${bom}${text.slice(0, cut)}${lines.join(eol)}${eol}${text.slice(cut)}`;
}

/**
 * 把 frontmatter 块内的 `status:` 行改为 `status: snapshot`,块外正文一个字节不动。
 * 无 frontmatter 或块内无 status 行返回 null(调用方提示人工核,不静默)。
 */
export function flipStatusSnapshot(raw) {
  const bom = raw.charCodeAt(0) === 0xfeff ? '﻿' : '';
  const text = bom ? raw.slice(1) : raw;
  // 开/收栏判定与 FM_DELIM_RE 同语义(`---` + 尾随空白;N1 后 parseFrontmatter 已同标),
  // 此处因需捕获行尾自带展开式正则——改动界定规则时两处须同批动。
  const m = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text);
  if (!m) return null;
  if (!/^status\s*:/m.test(m[2])) return null;
  const body = m[2].replace(/^status\s*:.*$/m, 'status: snapshot');
  return `${bom}${m[1]}${body}${text.slice(m[1].length + m[2].length)}`;
}
