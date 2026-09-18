// 章节定位:把 Markdown 文本转成标题树,支持取章节正文与直接子章节。
import { scanHeadings, splitLines } from './md.mjs';

function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === '') a += 1;
  while (b > a && lines[b - 1].trim() === '') b -= 1;
  return lines.slice(a, b);
}

/** 建立标题树。start/end 为章节覆盖的 1 起行号区间(含标题行)。 */
export function buildOutline(text) {
  const lines = splitLines(text);
  const raw = scanHeadings(text);
  const items = raw.map((h, i) => {
    let end = lines.length;
    for (let j = i + 1; j < raw.length; j += 1) {
      if (raw[j].level <= h.level) {
        end = raw[j].line - 1;
        break;
      }
    }
    return { ...h, start: h.line, end };
  });
  return { lines, items };
}

/** 取指定层级的同名章节(全部命中,用于重复歧义判定)。 */
export function findSections(outline, level, title) {
  return outline.items.filter((h) => h.level === level && h.title === title);
}

/** 章节正文(不含标题行),首尾空行去除。 */
export function sectionBody(outline, item) {
  return trimBlank(outline.lines.slice(item.start, item.end)).join('\n');
}

/** 章节原文(含标题行)。 */
export function sectionText(outline, item) {
  return trimBlank(outline.lines.slice(item.start - 1, item.end)).join('\n');
}

/** 在父章节范围内查找指定层级的直接子章节。 */
export function findChild(outline, parent, level, title) {
  return outline.items.filter(
    (h) => h.level === level && h.title === title && h.start > parent.start && h.start <= parent.end,
  );
}
