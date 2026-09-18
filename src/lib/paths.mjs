// 路径解析与仓根约束:本工具读取的本地路径都必须落在仓根内。
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本包根目录(本文件位于 src/lib/)。 */
export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 仓根内判定:绝对路径归一后仍位于 root 之下(root 自身视为在内)。 */
export function isInsideRoot(root, absPath) {
  const rel = relative(root, absPath);
  if (rel === '') return true;
  if (isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith(`..${sep}`);
}

/**
 * 解析仓根内路径。base 为解析起点;越界返回 null。
 * 目标已存在时按真实路径再复核一次,避免符号链接指向仓根之外。
 */
export function resolveInRoot(root, base, target) {
  const abs = resolve(base, target);
  if (!isInsideRoot(root, abs)) return null;
  if (existsSync(abs)) {
    let real;
    try {
      real = realpathSync(abs);
    } catch {
      return null;
    }
    if (!isInsideRoot(root, real)) return null;
  }
  return abs;
}

/** 仓根相对路径,分隔符归一为 /。 */
export function relToRoot(root, absPath) {
  const rel = relative(root, absPath);
  return rel === '' ? '.' : rel.split(sep).join('/');
}

/** 读取文本并剥除 BOM。 */
export function readText(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

export function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
