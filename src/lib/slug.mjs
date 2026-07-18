// 工作线 slug 派生(D-007,方案 §4.1 item2 ⑤)。
//
// **中文(及一般 Unicode)文件名是一等公民**——用户裁 2026-07-16:「中文文件名必须支持,
// 是我现在开发项目的第一需求,以后真遇到失灵了再修」。故本模块不做 ASCII 化、不做转写,
// 中文原样保留;R3-1「机器面锁 ASCII」的适用范围已修正:**文件名归使用者内容面**。
//
// 规则四步(与 SKILL.md 的任务目录名规则同源,故 F-001「slug 自动派生、人工只复核」
// 对中文值继续成立):
//   ① 剥 `(X)` 字母尾 —— 实测 Scrollery 的 `line` 值有 `名(X)` 混合形态,字母是旧的中心
//      登记号,语义在前半段;剥掉它 slug 才是人读得懂的名字。
//   ② 剔除文件系统非法字符 `\ / : * ? " < > |`
//   ③ 空格 → `-`
//   ④ **NFC 归一** —— macOS 产 NFD、Windows/Linux 产 NFC,同一个中文名在两台机器上会是
//      两个不同的字节串;不归一则 Q7 的卖点「撞名 = git add/add 冲突」会被静默绕过:
//      两人各建一个「看起来同名」的文件,git 视作两个文件,冲突不发生、撞名不暴露。

/** 文件系统非法字符(Windows 最严,取其为共同下界) */
const ILLEGAL = /[\\/:*?"<>|]/g;

/** 尾部的中心登记字母号:`名(X)` / `名（X）`,允许前置空格 */
const TRAILING_LETTER = /[（(]\s*[A-Za-z]\s*[)）]\s*$/u;

/**
 * 由 `line` 值派生 slug(D-007 四步)。
 * @param {string} line 工作线名(中文可)
 * @returns {string} slug;输入全是非法字符时返回空串(调用方须自行判空)
 */
export function slugify(line) {
  return String(line ?? '')
    .replace(TRAILING_LETTER, '')
    .replace(ILLEGAL, '')
    .trim()
    .replace(/\s+/g, '-')
    .normalize('NFC');
}

/** 是否已是 NFC 形态(门禁对 `lines/`、`status/` 文件名断言此条,D-007) */
export const isNFC = (s) => String(s).normalize('NFC') === String(s);

/**
 * 取 `名(X)` 混合形态的尾部字母号(大写归一);无则 null。
 * 迁移的三类失配报告要用它:野号 = 值里的字母不在登记表(§4.1 item2 ④ ③类)。
 */
export function letterTail(line) {
  const m = /[（(]\s*([A-Za-z])\s*[)）]\s*$/u.exec(String(line ?? ''));
  return m ? m[1].toUpperCase() : null;
}

/**
 * 排序比较器 = **Unicode 码点序,等价于 UTF-8 字节序**(§7.2 M-10 的可执行契约)。
 * 不用 `a < b`:那是 UTF-16 **码元**序——增补平面字符(U+10000+)的高代理段
 * 小于 U+E000..U+FFFF,'😀' 会排在 '�' 之前,与 UTF-8 字节序相反(build-index
 * selftest 钉住这对负例)。不用 localeCompare:答案随环境 collation 变,两台机器
 * 产出不同字节。自 build-index 迁驻 lib(第七轮 P2):gate 的 baseline 账文件排序
 * 同需字节确定,而 lib 不得反向 import src——单一实现落 lib 这层。
 */
export function cmpCodePoints(a, b) {
  const A = [...String(a)], B = [...String(b)];
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = A[i].codePointAt(0) - B[i].codePointAt(0);
    if (d) return d;
  }
  return A.length - B.length;
}
