// list 与 read 共用的参数解析：--key、--key=value、-- 之后原样作为位置参数。
export const parseArgs = (args, valueKeys, boolKeys) => {
  const opts = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      rest.push(arg);
      continue;
    }
    if (!arg.startsWith('--')) return null;
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg : arg.slice(0, eq);
    if (valueKeys.includes(key)) {
      const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
      if (value === undefined) return null;
      (opts[key] ??= []).push(value);
      continue;
    }
    if (boolKeys.includes(key) && eq === -1) {
      opts[key] = true;
      continue;
    }
    return null;
  }
  return { opts, rest };
};
