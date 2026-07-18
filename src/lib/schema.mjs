// 极简 JSON Schema(draft-07 子集)校验器。
//
// 为什么自己写:零运行期依赖是产品约束(package.json 无 dependencies),不引 ajv。
// 为什么不改成手写平行规则:R5-M2 的病灶正是「schema 只是编辑器文档,运行期不读它」
// ——若再手写一套平行检查,schema 与代码会各自演进,分叉只是时间问题。故本校验器
// **由 schema/worklogrc.schema.json 驱动**,让那个文件成为运行期真源。
//
// 未实现的关键字**抛错而非忽略**:静默跳过一个读不懂的约束,等于把 schema 里写下的
// 规则悄悄降级成注释——那恰是本模块要消灭的失败形态,不能在实现里复现一遍。
// 扩展 schema 时若用了新关键字,这里会当场炸,而不是给出一个偏松的假绿。
const SUPPORTED = new Set([
  '$schema', '$id', 'title', 'description', 'default', // 元信息,不参与校验
  'type', 'required', 'additionalProperties', 'properties', 'items', 'enum', 'const', 'oneOf',
]);

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const matchType = (v, t) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : typeOf(v) === t);

/**
 * 按 schema 校验 value,返回人类可读的错误数组(空 = 通过)。
 * @param {object} schema draft-07 子集
 * @param {*} value 待校验值
 * @param {string} path 错误消息里的定位前缀
 * @returns {string[]}
 */
export function validateJsonSchema(schema, value, path = '$') {
  for (const k of Object.keys(schema)) {
    if (!SUPPORTED.has(k)) throw new Error(`lib/schema.mjs 未实现 JSON Schema 关键字 '${k}'(位于 ${path});请实现它,不要让它被忽略`);
  }
  const errors = [];
  if (schema.const !== undefined) {
    if (value !== schema.const) errors.push(`${path} 须为 ${JSON.stringify(schema.const)}(收到:${JSON.stringify(value)})`);
    return errors;
  }
  if (schema.enum) {
    if (!schema.enum.includes(value)) errors.push(`${path} 非法(${JSON.stringify(value)});合法值:${schema.enum.join(' | ')}`);
    return errors;
  }
  if (schema.oneOf) {
    if (!schema.oneOf.some((s) => validateJsonSchema(s, value, path).length === 0)) {
      errors.push(`${path} 不符合任一允许形态(收到:${JSON.stringify(value)})`);
    }
    return errors;
  }
  if (schema.type && !matchType(value, schema.type)) {
    // 类型都不对就不再深入:继续查只会产出一串由类型错派生的噪声,淹掉真正的第一因
    errors.push(`${path} 类型须为 ${schema.type}(收到:${typeOf(value)})`);
    return errors;
  }
  if (schema.type === 'object') {
    for (const k of schema.required || []) {
      if (value[k] === undefined) errors.push(`${path} 缺必需键 ${k}`);
    }
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in props)) errors.push(`${path} 含未知键 ${k}`);
    }
    for (const [k, sub] of Object.entries(props)) {
      if (value[k] !== undefined) errors.push(...validateJsonSchema(sub, value[k], `${path}.${k}`));
    }
  }
  if (schema.type === 'array' && schema.items) {
    value.forEach((v, i) => errors.push(...validateJsonSchema(schema.items, v, `${path}[${i}]`)));
  }
  return errors;
}
