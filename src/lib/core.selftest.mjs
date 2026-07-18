// 共享 lib 纯函数 selftest:frontmatter 解析 / taskref 编辑 / fsutil 路径。
// 这些函数被多道门与多条命令复用(R3-6 单一实现),行为漂移是跨门污染——
// 在纯函数层钉住边界,门层 fixture 只须证接线。
import { parseTables, parseFrontmatter, section, splitRow } from './frontmatter.mjs';
import { flipStatusSnapshot, insertFrontmatterLines } from './taskref.mjs';
import { relPath } from './fsutil.mjs';
import { todayLocal } from './dates.mjs';
import { sep } from 'node:path';
import { configSchema, SUPPORTED_SCHEMA_VERSIONS } from './config.mjs';

export function selftest() {
  let failed = 0;
  const assert = (cond, name) => { console.log(`${cond ? '✓' : '✗'} selftest-libcore: ${name}`); if (!cond) failed++; };

  // ── parseTables:分隔行只认 header 后第一行(CommonMark;tier B B1)──────────
  {
    const tb = parseTables('| a | b |\n|---|---|\n| - | - |\n| x | y |')[0];
    assert(tb.rows.length === 2 && tb.rows[0][0] === '-', '占位数据行 `| - | - |` 不再被当分隔行吞掉');
    const mid = parseTables('| a | b |\n|---|---|\n| x | y |\n|---|---|\n| z | w |')[0];
    assert(mid.rows.length === 3 && mid.rows[1][0] === '---', '表中途的全 `-` 行是数据不是分隔(CommonMark 只认第二行)');
    const noSep = parseTables('| a | b |\n| x | y |')[0];
    assert(noSep.rows.length === 1 && noSep.rows[0][0] === 'x', '无分隔行的表数据行不受影响');
    const aligned = parseTables('| a | b |\n|:--|--:|\n| x | y |')[0];
    assert(aligned.rows.length === 1, '带对齐冒号的分隔行照常剥除');
  }

  // ── splitRow:转义感知切分,`\|` 是字面竖线非列界(F-023)────────────────────────
  {
    // ① 决策表回归锁:第六轮炸的形状——七列表某格含 `\|`,靠位置解构的门整排不错位。
    // 旧 split('|') 会断出幻影列(8 格),verified 被挤位读成 `b`,门假红。
    const co = parseTables('| 候选 ID | disp | target | loc | 去重 | N/A | verified |\n'
      + '|---|---|---|---|---|---|---|\n| F-1 | no-promotion | — | — | — | 理由含 a\\|b | yes |')[0];
    assert(co.rows[0].length === 7 && co.rows[0][5] === '理由含 a|b' && co.rows[0][6] === 'yes',
      'F-023 ①:七列表格内 `\\|` 不断列,verified 仍读 yes(旧 split 断幻影列→假红)');
    // ② code span 内字面竖线:`\|` 切完反转义为 `|`,列不错位
    const cs = splitRow('| `a\\|b` | y |');
    assert(cs.length === 2 && cs[0] === '`a|b`', 'F-023 ②:code span 内 `\\|` 不当列界,反转义为 `|`');
    // ③ 正则字面量:只反转义 `\|` 一种,`\s`/`\d` 反斜杠逐字留(全反转义会碰坏正则字面量)
    const rx = splitRow('| `\\s\\|\\d` | y |');
    assert(rx.length === 2 && rx[0] === '`\\s|\\d`', 'F-023 ③:仅 `\\|` 反转义,`\\s`/`\\d` 逐字留');
    // ④ 尾随空列保形:只剥首/尾结构竖线的空串,真尾随空列(双尾竖线)保留
    const te = splitRow('| a | b | |');
    assert(te.length === 3 && te[2] === '', 'F-023 ④:真尾随空列保形(`| a | b | |` → 三格,末格空)');
    // ⑤ 偶数反斜杠:`\\` 前的 `|` 是真列界(奇偶计数),且 `\\` 逐字留(不做全反转义)
    const eb = splitRow('| a\\\\ | b |');
    assert(eb.length === 2 && eb[0] === 'a\\\\', 'F-023 ⑤:偶数反斜杠前 `|` 是真列界,`\\\\` 逐字留');
    // ⑥ 无反斜杠的普通行行为逐字不变(与旧实现同结果)
    assert(JSON.stringify(splitRow('| a | b | c |')) === JSON.stringify(['a', 'b', 'c']), 'F-023 ⑥:无转义普通行切分不变');
  }

  // ── section:围栏内的 `## x` 既不作起始命中、也不终结上一节(B8)───────────────
  {
    const text = '```md\n## 目标\n```\n\n## 目标\n- 真内容\n```\n## 假界\n```\n- 围栏后仍属本节\n\n## 下一节\n- x\n';
    const got = section(text, /^##\s*目标(?=\s|$)/);
    assert(got !== null && got.includes('- 真内容') && got.includes('- 围栏后仍属本节') && !got.includes('- x'),
      'section 跳过围栏示例标题:起点取真节,假界不截断,真界照常终结');
  }

  // ── flipStatusSnapshot:栏线容尾随空白,与 parseFrontmatter 同宽(B2)─────────
  {
    const trailing = '---  \nstatus: active\n---  \n\n# 正文\n';
    assert(parseFrontmatter(trailing).hasFm === true, '前提:parseFrontmatter 认尾随空白的收栏(trim 判界)');
    const flipped = flipStatusSnapshot(trailing);
    assert(flipped !== null && flipped.includes('status: snapshot') && flipped.includes('# 正文'), '尾随空白的栏线不再让翻转降级为 null');
    const crlf = flipStatusSnapshot('---\r\nstatus: active\r\n---\r\n\r\n# 正文\r\n');
    assert(crlf !== null && crlf.includes('status: snapshot') && crlf.includes('\r\n'), 'CRLF 文件翻转且行尾原样');
    assert(flipStatusSnapshot('# 无 frontmatter\n') === null, '无 frontmatter 仍如实返 null(提示人工核,不静默)');
  }

  // ── insertFrontmatterLines:无法定位 frontmatter 的畸形输入返 null(B3 契约面)──
  assert(insertFrontmatterLines('---', ['mode: team']) === null, '整篇仅 `---` 返 null(调用方须接住,team 已接)');

  // ── relPath:root 以分隔符结尾(盘根仓)不多切一字(B6)────────────────────────
  {
    const root = `X:${sep}`;
    assert(relPath(root, `${root}a${sep}b.md`) === 'a/b.md', '盘根仓(root 以分隔符结尾)相对路径首字符不被吃');
    assert(relPath(`${sep}repo`, `${sep}repo${sep}a.md`) === 'a.md', '常规 root(无尾分隔符)行为不变');
  }

  // ── todayLocal:日期戳按本地日历(B12)────────────────────────────────────────
  {
    // 本地 00:30——UTC 侧凡时区偏东都仍是「昨天」;toISOString 派生会回退一天
    const d = new Date(2026, 0, 2, 0, 30);
    assert(todayLocal(d) === '2026-01-02', 'todayLocal 按本地日历,0–8 点窗口不回退昨天');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(todayLocal()), 'todayLocal 形态 YYYY-MM-DD(补零)');
  }

  // ── schema const 钉版(B7):每本 vN schema 的 schemaVersion 恒 const N ────────
  for (const v of SUPPORTED_SCHEMA_VERSIONS) {
    assert(configSchema(v).properties.schemaVersion.const === v, `schema v${v} 钉 schemaVersion const=${v}(编辑器面拒绝版本错配)`);
  }

  console.log(failed ? `\n✗ lib-core selftest 失败 ${failed} 项` : '\n✓ lib-core selftest 全部通过');
  return failed ? 1 : 0;
}
