// 最小 Markdown 识别:围栏、行内代码遮蔽、ATX 标题、链接、标题 slug。
// 支持范围:行内链接 [文字](目标)(含 <目标> 与成对括号路径)、图片,以及同文件内
// 引用式链接 [文字][标签] 与定义行 [标签]: 目标。不做通用解析器。

export function splitLines(text) {
  return text.split(/\r\n|\n|\r/);
}

/** 围栏跟踪:三个以上反引号或波浪线;返回该行是否属于围栏(含定界行自身)。 */
export function makeFenceTracker() {
  let open = null;
  return (line) => {
    const m = /^\s{0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
    if (m) {
      const ch = m[1][0];
      const len = m[1].length;
      if (!open) {
        open = { ch, len };
        return true;
      }
      if (ch === open.ch && len >= open.len && m[2].trim() === '') open = null;
      return true;
    }
    return open !== null;
  };
}

/** 用等长空白遮蔽行内代码,示例链接不参与识别,同时保持字符下标不变。 */
export function maskInlineCode(line) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i];
      i += 1;
      continue;
    }
    let n = 0;
    while (line[i + n] === '`') n += 1;
    const close = line.indexOf('`'.repeat(n), i + n);
    if (close === -1) {
      out += line.slice(i);
      break;
    }
    out += ' '.repeat(close + n - i);
    i = close + n;
  }
  return out;
}

/** 从开括号处找配对的右括号(支持括号路径与反斜杠转义);未闭合返回 -1。 */
function matchParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 归一链接目标:去尖括号、去标题部分、还原转义空格。 */
export function normalizeTarget(raw) {
  // 先还原转义空格,避免被后续的“空格 + 标题”切分误伤
  const value = raw.trim().replace(/\\ /g, ' ');
  const angle = /^<([^>]*)>/.exec(value);
  if (angle) return angle[1].trim();
  const titled = /^(.+?)\s+["'(]/.exec(value);
  if (titled) return titled[1].trim();
  return value;
}

/**
 * 扫描一行中的链接;行内代码中的示例链接会被忽略。
 * 目标整体用 <...> 包裹是合法写法;只有 <...> 散布在目标里的(模板骨架)标记为
 * placeholder,由调用方决定是否跳过。
 * @returns {{kind:'inline'|'ref', isImage:boolean, text:string, target?:string, label?:string, placeholder?:boolean, index:number}[]}
 */
export function scanLinks(line) {
  const masked = maskInlineCode(line);
  const out = [];
  const inlineRe = /(!?)\[([^\]]*)\]\(/g;
  let m;
  while ((m = inlineRe.exec(masked)) !== null) {
    const open = inlineRe.lastIndex - 1;
    const end = matchParen(masked, open);
    if (end === -1) continue;
    inlineRe.lastIndex = end + 1;
    const inner = masked.slice(open + 1, end);
    out.push({
      kind: 'inline',
      isImage: m[1] === '!',
      text: m[2],
      target: normalizeTarget(inner),
      placeholder: /[<>]/.test(inner) && !/^<[^<>\n]*>$/.test(inner.trim()),
      index: m.index,
    });
  }
  const refRe = /(!?)\[([^\]]*)\]\[([^\]]*)\]/g;
  while ((m = refRe.exec(masked)) !== null) {
    out.push({
      kind: 'ref',
      isImage: m[1] === '!',
      text: m[2],
      label: (m[3] === '' ? m[2] : m[3]).trim().toLowerCase(),
      index: m.index,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** 收集引用式链接定义 [标签]: 目标(围栏外)。 */
export function scanRefDefinitions(text) {
  const defs = new Map();
  const inFence = makeFenceTracker();
  for (const line of splitLines(text)) {
    if (inFence(line)) continue;
    const m = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/.exec(line);
    if (!m) continue;
    const label = m[1].trim().toLowerCase();
    if (!defs.has(label)) defs.set(label, normalizeTarget(m[2]));
  }
  return defs;
}

/** 扫描 ATX 标题(围栏内忽略);返回 { level, title, line },line 从 1 起。 */
export function scanHeadings(text) {
  const inFence = makeFenceTracker();
  const out = [];
  splitLines(text).forEach((line, i) => {
    if (inFence(line)) return;
    const m = /^(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
    if (!m) return;
    const title = (m[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
    out.push({ level: m[1].length, title, line: i + 1 });
  });
  return out;
}

/** 标题 slug(保留中文、字母数字、- 与 _,空白转 -)。 */
export function slugify(title) {
  return title
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * 标题集合的锚点索引:同名标题按惯例追加 -1、-2。
 * 返回 锚点 → 命中标题数组;编号锚点与字面量同名标题撞车时命中多项,由调用方判定唯一。
 */
export function anchorMap(headings) {
  const seen = new Map();
  const map = new Map();
  for (const h of headings) {
    const slug = slugify(h.title);
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    const anchor = n === 0 ? slug : slug + '-' + n;
    if (!map.has(anchor)) map.set(anchor, []);
    map.get(anchor).push(h);
  }
  return map;
}
