/**
 * 模板解析引擎
 *
 * 取值上下文统一为：
 *   {
 *     gb: { ... },          // 页面/步骤的全局上下文（作品字段、资产、prompt、item 等）
 *     stepList: [ ... ],    // 已完成步骤的 {step_id, step_order, name, req, rsp}
 *     resp: { ... }         // （仅接口输出提取时）原始响应
 *   }
 *
 * 取值串 valueStr：
 *   - 普通常量：原样返回；
 *   - 单个占位符 ${path}：返回原始类型值（dict/list/number/boolean 不做字符串化）；
 *   - 文本中嵌入占位符：按字符串替换，对象/数组以 JSON 文本嵌入。
 *
 * 路径语法：`${gb.content}`、`${stepList[0].rsp.items[2].name}`、`${resp.data[0].url}`
 * 兼容根别名：item/scene -> gb.item，character -> gb.character，resp -> context.resp
 */

export const PLACEHOLDER_RE = /\$\{\s*([A-Za-z_][\w.[\]]*)\s*\}/g;

/** 缺失标记（区别于合法的 null） */
export const MISSING = Symbol('MISSING');

/** 占位符根 -> 上下文根 */
const ROOT_ALIASES = {
  item: ['gb', 'item'],
  scene: ['gb', 'item'],
  character: ['gb', 'character'],
  work: ['gb'],
  page: ['gb'],
};

function isObj(v) {
  return v !== null && typeof v === 'object';
}

/**
 * 把取值串解析成路径段：`stepList[0].rsp.list[2].name`
 * -> [{kind:'key',token:'stepList'},{kind:'index',token:0},...]
 */
export function parsePath(expr) {
  const src = String(expr || '').trim();
  const m = /^[A-Za-z_]\w*/.exec(src);
  if (!m) throw new Error(`非法取值路径: ${expr}`);
  const segments = [{ kind: 'key', token: m[0] }];
  let i = m[0].length;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '.') {
      const mm = /^[A-Za-z_]\w*/.exec(src.slice(i + 1));
      if (!mm) throw new Error(`非法取值路径（. 后缺少键名）: ${expr}`);
      segments.push({ kind: 'key', token: mm[0] });
      i += 1 + mm[0].length;
    } else if (ch === '[') {
      const end = src.indexOf(']', i);
      if (end === -1) throw new Error(`非法取值路径（缺少 ]）: ${expr}`);
      const idxText = src.slice(i + 1, end).trim();
      if (!/^\d+$/.test(idxText)) throw new Error(`非法取值路径（[] 内仅支持数字下标）: ${expr}`);
      segments.push({ kind: 'index', token: Number(idxText) });
      i = end + 1;
    } else {
      throw new Error(`非法取值路径（意外字符 '${ch}'）: ${expr}`);
    }
  }
  return segments;
}

/** 按路径从上下文取值；任一节点缺失返回 MISSING */
export function getByPath(context, path) {
  if (!path) return MISSING;
  let segments;
  try {
    segments = parsePath(path);
  } catch (e) {
    return MISSING;
  }
  const ctx = isObj(context) ? context : {};
  let cur;
  let rest;
  const rootKey = segments[0].token;
  if (ROOT_ALIASES[rootKey]) {
    const [gbKey, subKey] = ROOT_ALIASES[rootKey];
    cur = isObj(ctx[gbKey]) ? ctx[gbKey][subKey] : MISSING;
    rest = segments.slice(1);
  } else if (rootKey in ctx) {
    cur = ctx[rootKey];
    rest = segments.slice(1);
  } else if (isObj(ctx.gb) && Object.prototype.hasOwnProperty.call(ctx.gb, rootKey)) {
    // 根级平铺简写：${art_style} / ${prev_output} 等价于 ${gb.art_style} / ${gb.prev_output}
    cur = ctx.gb[rootKey];
    rest = segments.slice(1);
  } else {
    return MISSING;
  }
  for (const seg of rest) {
    if (cur === null || cur === undefined) return MISSING;
    if (seg.kind === 'key') {
      if (isObj(cur) && Object.prototype.hasOwnProperty.call(cur, seg.token)) cur = cur[seg.token];
      else return MISSING;
    } else {
      if (Array.isArray(cur) && seg.token >= 0 && seg.token < cur.length) cur = cur[seg.token];
      else return MISSING;
    }
  }
  return cur;
}

/** 嵌入文本时的字符串化：对象/数组转 JSON，其余 String() */
export function stringifyValue(value) {
  if (Array.isArray(value) || (isObj(value) && !(value instanceof Date))) {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

/** 渲染文本：替换其中所有 ${...}，未命中的保留原样 */
export function renderText(context, text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(PLACEHOLDER_RE, (whole, path) => {
    const value = getByPath(context, path);
    if (value === MISSING) return whole;
    return stringifyValue(value);
  });
}

/** 按声明值类型转型 */
export function castValue(value, valueType) {
  const vt = String(valueType || 'string').toLowerCase();
  if (!vt || vt === 'string' || vt === 'str' || vt === 'text' || vt === 'any') {
    return typeof value === 'string' ? value : stringifyValue(value);
  }
  if (vt === 'number' || vt === 'int' || vt === 'integer' || vt === 'float') {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return vt === 'float' ? value : Math.trunc(value);
    const text = String(value).trim();
    if (text === '') return null;
    const num = Number(text);
    if (Number.isNaN(num)) return null;
    return vt === 'float' || !Number.isInteger(num) ? num : num;
  }
  if (vt === 'bool' || vt === 'boolean') {
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'y', '是'].includes(String(value).trim().toLowerCase());
  }
  if (vt === 'object' || vt === 'dict' || vt === 'json' || vt === 'array' || vt === 'list') {
    if (Array.isArray(value) || isObj(value)) return value;
    try {
      return JSON.parse(String(value));
    } catch (e) {
      return null;
    }
  }
  return value;
}

/** 结构化深渲染：dict/list 内部的字符串占位符递归替换 */
export function renderDeep(context, value) {
  if (typeof value === 'string') return renderText(context, value);
  if (Array.isArray(value)) return value.map((v) => renderDeep(context, v));
  if (isObj(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(context, v);
    return out;
  }
  return value;
}

/** 解析单个取值串（主入口） */
export function resolveValue(context, valueStr, valueType) {
  if (valueStr === null || valueStr === undefined) return null;
  if (typeof valueStr !== 'string') return valueStr;

  const stripped = valueStr.trim();
  const full = new RegExp(`^\\s*${PLACEHOLDER_RE.source}\\s*$`).exec(valueStr);
  if (full) {
    const native = getByPath(context, full[1]);
    if (native === MISSING) {
      // 单占位符未命中：无类型声明时保留原串（暴露配置问题），有声明时按常量转型
      return valueType ? castValue(stripped, valueType) : stripped;
    }
    return valueType ? castValue(native, valueType) : native;
  }

  // JSON 文本且目标为数组/对象：先解析结构再递归渲染内部占位符
  if (['array', 'list', 'object', 'dict', 'json'].includes(String(valueType).toLowerCase())) {
    const first = stripped.slice(0, 1);
    if (first === '[' || first === '{') {
      try {
        return renderDeep(context, JSON.parse(stripped));
      } catch (e) {
        /* 退回文本渲染 */
      }
    }
  }

  const rendered = renderText(context, stripped);
  return valueType ? castValue(rendered, valueType) : rendered;
}

/** 提取文本中的全部占位符路径（预览/排查用） */
export function extractPlaceholders(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  let m;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** 判定字符串是否「只有一个占位符」 */
export function isSinglePlaceholder(text) {
  if (typeof text !== 'string') return false;
  return new RegExp(`^\\s*${PLACEHOLDER_RE.source}\\s*$`).test(text);
}
