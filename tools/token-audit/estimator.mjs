// 估算器单源(复审 P1-02:「estimator 与 doctor 共用或生成同源」)。
// est-token 双轨口径(CJK=1/字、其余=1/4 字符)只在 src/doctor.mjs 定义一次,
// 本文件仅转发——审计与护栏若各自持有实现,口径漂移时两边账对不上且无人察觉。
export { estTokens } from '../../src/doctor.mjs';

// 稳定短哈希(djb2):skill 正文分版本桶用,不需加密强度,只需同文同码、异文异码。
export function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}
