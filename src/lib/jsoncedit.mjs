// jsoncedit:JSONC 文本的外科编辑(F-005)。
//
// 目标:改值不重排——注释、空白、键序、行风格原样保留。迁移的全部配置改动可归约为
// 两个原语(见 upgrade.mjs 各迁移):
//   replaceValue(src, path, value)  按路径替换既有值
//   appendItem(src, path, value)    向数组尾部追加一项
//
// 安全模型:本模块只管「改得漂亮」;「改得正确」由调用方兜底——upgrade 的 configChange
// 对编辑产物做**解析等价断言**(与语义计算出的对象全等),不过即回落 JSON.stringify。
// 故此处解析器可以只覆盖 JSONC 的常见形态,罕见形态(重复键等)由兜底路径接住,
// 绝不为漂亮牺牲正确。
//
// 解析器与 config.mjs 的 stripJsonc 同源同法(状态机逐字符;字符串内的 `//` 不当注释),
// 区别在产出:stripJsonc 产净文本给 JSON.parse,这里产**带 span 的节点树**给文本手术。

/** 跳过空白与注释,返回下一个有效字符的下标。BOM 当空白跳过(R6-08):span 不移位、
 *  文本手术的切片保 BOM 原样——比在入口剥掉更省事且往返无损。 */
function skipTrivia(src, i) {
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) throw new Error(`位置 ${i}:块注释未闭合`);
      i = e + 2;
      continue;
    }
    break;
  }
  return i;
}

/** 扫过一个字符串字面量(src[i] 须为 `"`),返回结束引号后的下标。 */
function scanString(src, i) {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '"') return j + 1;
    j++;
  }
  throw new Error(`位置 ${i}:字符串未闭合`);
}

/**
 * @typedef {{kind: 'object', start: number, end: number, entries: {key: string, node: Node}[]}
 *         | {kind: 'array', start: number, end: number, items: Node[]}
 *         | {kind: 'scalar', start: number, end: number}} Node
 */

/** @returns {Node} */
function parseValue(src, i) {
  i = skipTrivia(src, i);
  const c = src[i];
  if (c === '{') return parseObject(src, i);
  if (c === '[') return parseArray(src, i);
  if (c === '"') return { kind: 'scalar', start: i, end: scanString(src, i) };
  // 裸字面量(true/false/null/数字):扫到结构分隔符、空白或注释起点为止
  let j = i;
  while (j < src.length && !',}]'.includes(src[j]) && !/\s/.test(src[j])
    && !(src[j] === '/' && (src[j + 1] === '/' || src[j + 1] === '*'))) j++;
  if (j === i) throw new Error(`位置 ${i}:非法值起始 ${JSON.stringify(c ?? '<EOF>')}`);
  return { kind: 'scalar', start: i, end: j };
}

function parseObject(src, i) {
  const entries = [];
  let j = i + 1;
  for (;;) {
    j = skipTrivia(src, j);
    if (src[j] === '}') return { kind: 'object', start: i, end: j + 1, entries };
    if (src[j] !== '"') throw new Error(`位置 ${j}:期望键名字符串`);
    const keyEnd = scanString(src, j);
    const key = JSON.parse(src.slice(j, keyEnd));
    let k = skipTrivia(src, keyEnd);
    if (src[k] !== ':') throw new Error(`位置 ${k}:期望冒号`);
    const node = parseValue(src, k + 1);
    entries.push({ key, node });
    j = skipTrivia(src, node.end);
    if (src[j] === ',') { j++; continue; }
    if (src[j] === '}') return { kind: 'object', start: i, end: j + 1, entries };
    throw new Error(`位置 ${j}:期望逗号或 }`);
  }
}

function parseArray(src, i) {
  const items = [];
  let j = i + 1;
  for (;;) {
    j = skipTrivia(src, j);
    if (src[j] === ']') return { kind: 'array', start: i, end: j + 1, items };
    const node = parseValue(src, j);
    items.push(node);
    j = skipTrivia(src, node.end);
    if (src[j] === ',') { j++; continue; }
    if (src[j] === ']') return { kind: 'array', start: i, end: j + 1, items };
    throw new Error(`位置 ${j}:期望逗号或 ]`);
  }
}

/** 解析整份 JSONC,返回根节点(尾部允许 trivia;首部 BOM 经 skipTrivia 跳过)。 */
export function parseTree(src) {
  const root = parseValue(src, 0);
  const rest = skipTrivia(src, root.end);
  if (rest !== src.length) throw new Error(`位置 ${rest}:根值之后有多余内容`);
  return root;
}

/** 按路径(键名/数组下标交替)定位节点;不存在返回 null。 */
function resolve(src, path) {
  let node = parseTree(src);
  for (const seg of path) {
    if (node.kind === 'object') {
      const hit = node.entries.find((e) => e.key === seg);
      if (!hit) return null;
      node = hit.node;
    } else if (node.kind === 'array') {
      if (!Number.isInteger(seg) || seg < 0 || seg >= node.items.length) return null;
      node = node.items[seg];
    } else return null;
  }
  return node;
}

/**
 * 单行序列化:对象/数组内联(`{ "k": v }` 风格,与包内模板一致),标量走 JSON.stringify。
 * 插进多行 JSONC 时不破坏行结构;多行美排不做——等价断言只看解析结果。
 */
export function inlineStringify(v) {
  if (Array.isArray(v)) return `[${v.map(inlineStringify).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    const inner = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inlineStringify(x)}`).join(', ');
    return inner ? `{ ${inner} }` : '{}';
  }
  return JSON.stringify(v);
}

/** 按路径替换既有值,其余文本一个字节不动。路径不存在即抛错(由调用方兜底)。 */
export function replaceValue(src, path, value) {
  const node = resolve(src, path);
  if (!node) throw new Error(`路径不存在:${path.join('.')}`);
  return src.slice(0, node.start) + inlineStringify(value) + src.slice(node.end);
}

/**
 * 向数组尾部追加一项。多行数组按最后一项的缩进另起一行;单行数组原地 `, x`;
 * 已有尾随逗号(JSONC 容忍)则在逗号之后插入,不产生 `,,`。
 */
export function appendItem(src, path, value) {
  const node = resolve(src, path);
  if (!node) throw new Error(`路径不存在:${path.join('.')}`);
  if (node.kind !== 'array') throw new Error(`路径不是数组:${path.join('.')}`);
  const text = inlineStringify(value);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  if (node.items.length === 0) {
    return `${src.slice(0, node.start + 1)}${text}${src.slice(node.start + 1)}`;
  }
  const last = node.items[node.items.length - 1];
  const multiline = src.slice(node.start, last.end).includes('\n');
  const after = skipTrivia(src, last.end);
  const hasTrailingComma = src[after] === ',';
  if (multiline) {
    const lineStart = src.lastIndexOf('\n', last.start) + 1;
    const indent = /^[ \t]*/.exec(src.slice(lineStart, last.start))[0];
    return hasTrailingComma
      ? `${src.slice(0, after + 1)}${eol}${indent}${text},${src.slice(after + 1)}`
      : `${src.slice(0, last.end)},${eol}${indent}${text}${src.slice(last.end)}`;
  }
  return hasTrailingComma
    ? `${src.slice(0, after + 1)} ${text},${src.slice(after + 1)}`
    : `${src.slice(0, last.end)}, ${text}${src.slice(last.end)}`;
}

/**
 * 顺序应用一组编辑,每步之后重新解析(span 在编辑后即失效,不做增量维护——
 * 配置量级下重解析开销可忽略,换来的是无悬垂偏移这类整类 bug)。
 * @param {string} src
 * @param {{op?: 'replace'|'append', path: (string|number)[], value: any}[]} edits
 */
export function applyEdits(src, edits) {
  for (const e of edits) {
    src = e.op === 'append' ? appendItem(src, e.path, e.value) : replaceValue(src, e.path, e.value);
  }
  return src;
}

// ── selftest ─────────────────────────────────────────────────────────────────
export function selftest() {
  let failed = 0;
  const assert = (cond, name) => {
    if (cond) console.log(`  ✓ ${name}`);
    else { console.error(`  ✗ ${name}`); failed++; }
  };

  // 1. 替换标量:注释、空白、键序原样
  {
    const src = `{\n  // 头注\n  "a": 1, // 行尾注\n  "b": "x"\n}\n`;
    const out = replaceValue(src, ['a'], 2);
    assert(out === `{\n  // 头注\n  "a": 2, // 行尾注\n  "b": "x"\n}\n`, '替换标量保注释与行构');
  }
  // 2. 字符串值里的 `//` 与 `,}` 不当语法
  {
    const src = `{ "url": "https://x/y,}", "v": 1 }`;
    const out = replaceValue(src, ['v'], 2);
    assert(out === `{ "url": "https://x/y,}", "v": 2 }`, '字符串内 // 与 ,} 不误伤');
  }
  // 2b. R6-08:带 BOM 的原文可编辑,BOM 原样保留(此前 BOM 让解析抛错,
  //     configChange 恒走 lossy 兜底,注释保全在主平台默认编码下形同虚设)
  {
    const src = `﻿{ "a": 1 }`;
    const out = replaceValue(src, ['a'], 2);
    assert(out === `﻿{ "a": 2 }`, 'R6-08:BOM 原文可编辑且 BOM 保留');
  }
  // 3. 嵌套路径 + 数组下标替换
  {
    const src = `{\n  "types": [\n    "design", // c1\n    "review"\n  ]\n}`;
    const out = replaceValue(src, ['types', 0], { name: 'design', canBeAuthoritative: true });
    assert(out.includes(`{ "name": "design", "canBeAuthoritative": true }, // c1`), '数组元素替换保行尾注');
    assert(out.includes(`"review"`), '相邻元素不动');
  }
  // 4. 多行数组尾插(无尾随逗号):按末项缩进另起一行
  {
    const src = `{\n  "dirs": [\n    "a",\n    "b"\n  ]\n}`;
    const out = appendItem(src, ['dirs'], 'c');
    assert(out === `{\n  "dirs": [\n    "a",\n    "b",\n    "c"\n  ]\n}`, '多行数组尾插对齐缩进');
  }
  // 5. 多行数组已有尾随逗号:插在逗号后,不产生 ,,
  {
    const src = `{\n  "dirs": [\n    "a",\n  ]\n}`;
    const out = appendItem(src, ['dirs'], 'b');
    assert(out === `{\n  "dirs": [\n    "a",\n    "b",\n  ]\n}`, '尾随逗号数组尾插不产生双逗号');
    assert(JSON.stringify(JSON.parse(out.replace(/,(\s*[\]}])/g, '$1'))) === '{"dirs":["a","b"]}', '产物解析正确');
  }
  // 6. 单行数组尾插
  {
    const out = appendItem(`{ "dirs": ["a", "b"] }`, ['dirs'], 'c');
    assert(out === `{ "dirs": ["a", "b", "c"] }`, '单行数组原地尾插');
  }
  // 7. 空数组尾插
  {
    const out = appendItem(`{ "dirs": [] }`, ['dirs'], 'a');
    assert(out === `{ "dirs": ["a"] }`, '空数组尾插');
  }
  // 8. CRLF 文件:插入行用 CRLF
  {
    const src = `{\r\n  "dirs": [\r\n    "a"\r\n  ]\r\n}`;
    const out = appendItem(src, ['dirs'], 'b');
    assert(out === `{\r\n  "dirs": [\r\n    "a",\r\n    "b"\r\n  ]\r\n}`, 'CRLF 仓插行随源 EOL');
  }
  // 9. 路径不存在 / 类型不对:抛错(调用方兜底的接口契约)
  {
    let threw = 0;
    try { replaceValue(`{"a":1}`, ['b'], 2); } catch { threw++; }
    try { appendItem(`{"a":1}`, ['a'], 2); } catch { threw++; }
    assert(threw === 2, '路径不存在/非数组即抛错');
  }
  // 10. 块注释与尾注间的插入:末项后带行尾注仍产出合法 JSONC
  {
    const src = `{\n  "dirs": [\n    "a" /* 块注 */\n  ]\n}`;
    const out = appendItem(src, ['dirs'], 'b');
    assert(out === `{\n  "dirs": [\n    "a",\n    "b" /* 块注 */\n  ]\n}`, '末项带注释时插入仍合法(注释随行,语义不变)');
  }
  // 11. applyEdits 顺序应用(替换 + 尾插混合)
  {
    const src = `{\n  // keep\n  "schemaVersion": 1,\n  "dirs": ["a"]\n}`;
    const out = applyEdits(src, [
      { path: ['schemaVersion'], value: 2 },
      { op: 'append', path: ['dirs'], value: 'b' },
    ]);
    assert(out === `{\n  // keep\n  "schemaVersion": 2,\n  "dirs": ["a", "b"]\n}`, 'applyEdits 混合编辑保注释');
  }
  // 12. inlineStringify 形态与模板一致
  {
    assert(inlineStringify({ name: 'line', canBeAuthoritative: false }) === `{ "name": "line", "canBeAuthoritative": false }`, 'inlineStringify 对象内联带空格');
    assert(inlineStringify(['a', 1, null]) === `["a", 1, null]`, 'inlineStringify 数组内联');
  }

  if (failed) { console.error(`✗ jsoncedit selftest:${failed} 项失败`); return 1; }
  console.log('✓ jsoncedit selftest 全部通过');
  return 0;
}
