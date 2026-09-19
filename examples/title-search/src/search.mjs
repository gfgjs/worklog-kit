// 标题子串筛选：纯函数，零第三方依赖，Node >= 20。
// T1 现状：查询串按原样匹配，不裁剪前后空白；undefined/null 会被 String() 变成字面量。

/**
 * 按标题子串筛选，保持 items 原有顺序。
 * @param {{title: string}[]} items
 * @param {string} query
 * @returns {{title: string}[]}
 */
export function filterByTitle(items, query) {
  if (!Array.isArray(items)) throw new TypeError('items 必须是数组');
  const needle = String(query).toLowerCase();
  return items.filter((item) => String(item?.title ?? '').toLowerCase().includes(needle));
}

/** 把筛选结果格式化成命令行输出。 */
export function formatMatches(matches) {
  if (!matches.length) return '无匹配';
  return matches.map((item) => `- ${item.title}`).join('\n');
}
