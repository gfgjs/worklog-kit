// 共享解析:YAML frontmatter(浅层 key: value)与管道表。
// 单一实现供 check-docs / check-index / init 复用(R3-6)。

/** 正则字面量转义(单一实现:check-docs/check-index/upgrade/closeout 共用,R3-6) */
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 代码围栏跟踪器(``` / ~~~)。每行**按顺序**喂入(带不带行尾均可),返回该行是否属于
 * 围栏(含围栏定界行自身)。围栏内是示例不是数据——1a/1b 已确立此语义;单一实现供
 * parseTables / section / upgrade 节扫描 / closeout 登记节共用,否则「两门对同一语法
 * 的两种读法」必漂移(tier B B8:节扫描家族此前 fence-blind,围栏示例标题被当真分节)。
 */
export function makeFenceSkipper() {
  let open = null; // 开栏定界符 {ch, len};null = 栏外
  return (line) => {
    const m = /^\s*(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (m) {
      const ch = m[1][0], len = m[1].length;
      if (!open) { open = { ch, len }; return true; } // 开栏(info string 合法)
      // 关栏三条件(CommonMark;第七轮 P2:单布尔曾让 ``` 与 ~~~ 互开互关):
      // 同字符、不短于开栏、其后仅空白——``` 栏内的 ~~~/更短定界/带 info 的同形行都是内容
      if (ch === open.ch && len >= open.len && m[2].trim() === '') open = null;
      return true;
    }
    return !!open;
  };
}

/** frontmatter 开/收栏行:恰 `---`,容尾随空白。开栏判定的**单一实现**(N1,第七轮复核 §3):
 *  parseFrontmatter/insertFrontmatterLines/insertIdLine 此前各写各的(`startsWith('---')`
 *  连 `---oops` 也认),与 flipStatusSnapshot 的严判分叉——同一文件门认、收口不认,
 *  closeout 静默降级「请人工核」。 */
export const FM_DELIM_RE = /^---[ \t]*$/;

/**
 * 解析文档 frontmatter。仅支持浅层 `key: value`(本工具 frontmatter 无嵌套需求)。
 * @returns {{ hasFm: boolean, data: Record<string,string>, body: string }}
 */
export function parseFrontmatter(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // 剥 BOM
  const lines = text.split(/\r?\n/);
  // 开/收栏均走 FM_DELIM_RE(N1):`---oops`/`----` 不是开栏,`  ---`(带前导空白)不是收栏
  if (!FM_DELIM_RE.test(lines[0] ?? '')) return { hasFm: false, data: {}, body: text };
  const end = lines.findIndex((l, i) => i > 0 && FM_DELIM_RE.test(l));
  if (end === -1) return { hasFm: false, data: {}, body: text };
  const data = {};
  for (const l of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(l);
    if (m) data[m[1]] = m[2].trim();
  }
  return { hasFm: true, data, body: lines.slice(end + 1).join('\n') };
}

/**
 * 转义感知的管道表切分(F-023)。CommonMark 里 `\|` 是**字面竖线**、非列界;旧实现
 * `split('|')` 见竖线就切,格内一个 `\|` 就断出幻影列,靠位置解构的门(closeout 处置表
 * `[id, disp, target, …]`)整排错位 → 假报候选 ID/tableSchema。此处逐字扫描:遇 `|` 数其前
 * **连续**反斜杠——奇数=被转义(留作格内容)、偶数(含 0)=真列界。
 *
 * 切完只把 `\|` **反转义**为 `|` 一种(门要的是列分对=读数正确);其余反斜杠序列
 * (正则字面量 `\s`/`\d`、`\\` 等)**逐字留**,不做全 CommonMark 反转义——那会碰坏
 * 格内正则字面量(D 记:范围窄化只保分隔符完整,非渲染保真)。首/尾结构竖线留下的空串
 * 剥掉(`| a | b |` → 两格);内部/真尾随空列保形(`| a | b | |` → 三格,末格空)。
 */
export function splitRow(l) {
  const s = l.trim();
  const cells = [];
  let buf = '';
  let bs = 0; // 当前位置前的连续反斜杠数(奇偶定 `|` 是否被转义)
  for (const ch of s) {
    if (ch === '|' && bs % 2 === 0) { cells.push(buf); buf = ''; bs = 0; continue; }
    buf += ch;
    bs = ch === '\\' ? bs + 1 : 0;
  }
  cells.push(buf);
  if (cells.length > 1 && cells[0].trim() === '') cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.replace(/\\\|/g, '|').trim());
}

/**
 * 极简管道表解析:返回 {header, rows}[]。转义管道 `\|` 由 splitRow 认作字面竖线(F-023)。
 * 分隔行(|---|)不计入 rows。
 */
export function parseTables(text) {
  const tables = [];
  let cur = null;
  let sawSep = false;
  const inCode = makeFenceSkipper();
  for (const l of text.split(/\r?\n/)) {
    // 围栏内是示例不是数据:不跳的话,findings 里一张围栏示例候选表会被当成真声明,
    // 产出幻影候选。围栏行(含定界行)顺手闭合当前表。
    if (inCode(l)) { if (cur) { tables.push(cur); cur = null; } continue; }
    if (/^\s*\|/.test(l)) {
      if (!cur) { cur = { header: splitRow(l), rows: [] }; sawSep = false; }
      // 分隔行只认 header 后第一行(CommonMark)。原实现把**任意位置**的全 `-`/`:` 行
      // 都当分隔行丢——处置表/声明表里一行占位 `| - | - |` 会静默消失,门读表即漏账。
      else if (!sawSep && cur.rows.length === 0 && /^[\s|:-]+$/.test(l)) sawSep = true;
      else cur.rows.push(splitRow(l));
    } else if (cur) { tables.push(cur); cur = null; }
  }
  if (cur) tables.push(cur);
  return tables;
}

/**
 * 取 heading 匹配行之后、下一个同级或更高级 ## 之前的行(节抽取)。
 * @param {string} text 全文
 * @param {RegExp} headingRe 匹配起始 heading 的正则
 */
export function section(text, headingRe) {
  const lines = text.split(/\r?\n/);
  // 围栏内的 `## x` 是示例不是节界:既不作起始命中,也不提前终结上一节(B8)
  const skip = makeFenceSkipper();
  const inCode = lines.map((l) => skip(l));
  const start = lines.findIndex((l, i) => !inCode[i] && headingRe.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (!inCode[i] && /^##\s/.test(lines[i])) { end = i; break; }
  return lines.slice(start + 1, end);
}
