// 日期戳单一实现(tier B B12,用户裁统一本地日)。
//
// **日期戳走本地日**:收口日/created/generatedAt/manifest stampedAt 是日历语义,跟人走。
// closeout 既有惯例即本地日;init/upgrade/baseline 曾用 UTC 日——UTC+8 用户 0–8 点操作
// 会把「今天」记成昨天,同一批命令产出两个日期,归档目录名与 status 分片各执一词。
//
// **瞬时戳保持 UTC**,不在此列:备份文件后缀(upgrade/install-skills)与 team 事件
// 文件名是跨机器可排序的时刻标识,本地时区会让两台机器对同一时刻各排各的序。
export function todayLocal(d = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/**
 * 语义日期校验(N3,第七轮复核 §3):`YYYY-MM-DD` 形态 + Date.UTC 往返比对——
 * `2026-99-99` 这类「语法合法、日历荒谬」的串靠进位暴露(99 月进到次年)。
 * 与 check-docs 事件时间戳校验(isValidEventTs)同术;这里是**日期粒度**的单一实现,
 * 消除「事件时间戳有语义校验、created 只有形态正则」的同仓双标。
 */
export function isValidDateStr(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
