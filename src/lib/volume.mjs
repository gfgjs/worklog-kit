// 正文体积反馈:UTF-8 字节统计与一行摘要。只报长度,不估算 token,不截断正文。

/** 正文体积按 UTF-8 字节统计。 */
export const utf8Bytes = (text) => Buffer.byteLength(text, 'utf8');

/**
 * 一行体积摘要:所选章节按标题与字节列出,并附一层必读总量。
 * 字节数只描述正文长度,不是 token,也不含来源标记与分隔行等输出包装。
 * 同名标题用来源文件辨识,避免只报标题时无法对应。
 */
export function volumeLine(sources, readings) {
  const count = new Map();
  for (const src of sources) count.set(src.title, (count.get(src.title) ?? 0) + 1);
  const parts = sources.map((src) => {
    const label = count.get(src.title) > 1 ? `${src.title}(${src.relPath})` : src.title;
    return `${label} ${utf8Bytes(src.body)}B`;
  });
  if (readings.length > 0) {
    parts.push(`一层必读 ${readings.length} 段 ${readings.reduce((sum, item) => sum + utf8Bytes(item.body), 0)}B`);
  }
  return `正文体积(UTF-8 字节;非 token;不含来源标记与分隔行)：${parts.join('、')}`;
}
