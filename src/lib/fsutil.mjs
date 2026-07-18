// 共享文件系统工具:目录遍历(带存在性守卫)、路径归一、原子写。
// 单一实现,供各门禁复用(设计方案 R3-6:防双引擎解析漂移)。
import { readdirSync, statSync, existsSync, mkdirSync, copyFileSync, renameSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 包根:本文件位于 src/lib/,上溯两级。
export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULT_SKIP = new Set(['node_modules', 'target', '.git', 'dist', 'build']);

/**
 * docsDir 子树专用 skip 集(R6-01)。DEFAULT_SKIP 按目录名任意深度跳过,是给**源码根**
 * 扫描准备的;文档树里 `build/`、`dist/` 是完全合理的目录名——沿用 DEFAULT_SKIP 会让
 * `docs/build/**` 整体逃过文档门,而 check-index 用裸 readdirSync 又看得见它:
 * 索引门逼你登记一个文档门根本不扫的目录,登记后三方一致全绿,名义覆盖、实际不扫。
 */
export const DOCS_SKIP = new Set(['.git']);

/**
 * 递归收集目录下指定扩展名文件。
 * §7.1:加存在性守卫——新项目缺某源码根时 readdirSync 会抛 ENOENT,守卫后返回空。
 * @param {string} dir 起始目录
 * @param {string[]} exts 扩展名(如 ['.md'])
 * @param {Set<string>} [skip] 跳过的目录名
 */
export function walk(dir, exts, skip = DEFAULT_SKIP, out = [], seen = new Set()) {
  if (!existsSync(dir)) return out; // 存在性守卫(§7.1)
  // 符号链接环守卫(第七轮 P2):walk 跟随 symlink(statSync 语义,刻意保留——链接进来的
  // 文档树也要扫),自指/互指链接曾可无限递归。真实路径去重,同一物理目录只进一次。
  let key; try { key = realpathSync(dir); } catch { return out; }
  if (seen.has(key)) return out;
  seen.add(key);
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; } // 悬空 symlink/竞态删除:跳该项,不拖垮整扫
    if (st.isDirectory()) walk(p, exts, skip, out, seen);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** 仓根相对路径,分隔符归一为 /(跨平台稳定输出)。
 *  root 以分隔符结尾(盘根仓 `C:\` / `/`)时 join 不再补分隔符,偏移须少切一字——
 *  固定 `+1` 会把相对路径的首字符吃掉。 */
export const relPath = (root, p) => p.slice(root.length + (root.endsWith(sep) ? 0 : 1)).replaceAll(sep, '/');

/** 原子写(tmp→rename;既有惯例):中断不留半截文件。单一实现,taskref 转发旧引用 */
export function writeAtomic(p, content) {
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, p);
}

/** 同卷原子写:先写临时文件再 rename,避免半写文件成为「看似已安装」的坏副本 */
export function atomicCopy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  copyFileSync(src, tmp);
  renameSync(tmp, dest);
}
