/** 接口参数树的前端编辑辅助 */

let seq = 0;
const nextKey = () => `p_${Date.now().toString(36)}_${(seq += 1)}`;

export const CONTAINER_TYPES = ['object', 'array'];

export function isContainerType(type) {
  return CONTAINER_TYPES.includes(String(type || '').toLowerCase());
}

export function newParam(direction = 'input') {
  return {
    __key: nextKey(),
    param_type: direction,
    param_name: '',
    value_type: 'string',
    file_type: 'none',
    description: '',
    validate_rule: null,
    _kind: 'variable',
    _expr: '',
    children: [],
  };
}

/** 后端参数结构 -> 前端编辑结构 */
export function normalizeParams(params) {
  const walk = (list, direction) =>
    (list || []).map((p) => {
      const cfg = p.param_value;
      let kind = 'variable';
      let expr = '';
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        if ('kind' in cfg || 'expr' in cfg) {
          kind = cfg.kind || 'variable';
          expr = cfg.expr === undefined || cfg.expr === null ? '' : cfg.expr;
        } else {
          // 旧式整值对象
          kind = 'constant';
          expr = JSON.stringify(cfg);
        }
      } else if (typeof cfg === 'string') {
        expr = cfg;
        kind = /\$\{/.test(cfg) ? 'variable' : 'constant';
      } else if (cfg !== null && cfg !== undefined) {
        kind = 'constant';
        expr = String(cfg);
      }
      return {
        __key: nextKey(),
        param_type: p.param_type || direction || 'input',
        param_name: p.param_name || '',
        value_type: p.value_type || 'string',
        file_type: p.file_type || 'none',
        description: p.description || '',
        validate_rule: p.validate_rule || null,
        _kind: kind,
        _expr: expr,
        children: walk(p.children, p.param_type || direction || 'input'),
      };
    });
  return walk(params, 'input');
}

/** 前端编辑结构 -> 后端参数结构 */
export function serializeParams(list) {
  const walk = (arr) =>
    (arr || [])
      .filter((p) => String(p.param_name || '').trim())
      .map((p) => {
        const container = isContainerType(p.value_type) && p.children && p.children.length;
        const children = walk(p.children);
        let param_value = null;
        if (!container) {
          const expr = p._expr;
          param_value = expr === '' || expr === null || expr === undefined
            ? null
            : { kind: p._kind || 'variable', expr: p._expr };
        }
        return {
          param_type: p.param_type || 'input',
          param_name: String(p.param_name).trim(),
          value_type: p.value_type || 'string',
          file_type: p.file_type || 'none',
          description: p.description || '',
          validate_rule: p.validate_rule || null,
          param_value,
          children: container ? children : [],
        };
      });
  return walk(list);
}

export function findParam(list, key) {
  const walk = (arr) => {
    for (const item of arr) {
      if (item.__key === key) return item;
      const hit = item.children && item.children.length ? walk(item.children) : null;
      if (hit) return hit;
    }
    return null;
  };
  return walk(list || []);
}

export function removeParam(list, key) {
  const idx = (list || []).findIndex((p) => p.__key === key);
  if (idx !== -1) {
    list.splice(idx, 1);
    return true;
  }
  for (const item of list || []) {
    if (item.children && item.children.length && removeParam(item.children, key)) return true;
  }
  return false;
}

/** 统计输入/输出参数数量（含子项） */
export function countParams(list) {
  const walk = (arr, acc) => {
    for (const p of arr || []) {
      const key = p.param_type === 'output' ? 'output' : 'input';
      acc[key] += 1;
      if (p.children && p.children.length) walk(p.children, acc);
    }
  };
  const acc = { input: 0, output: 0 };
  walk(list, acc);
  return acc;
}

/** 校验：空名 / 同层同方向重名（输入与输出允许同名，它们是两个分组） */
export function validateParams(list) {
  const errors = [];
  const walk = (arr, path) => {
    const seen = new Set();
    for (const p of arr || []) {
      const name = String(p.param_name || '').trim();
      if (!name) {
        errors.push(`存在未命名的参数（${path || '顶层'}）`);
        continue;
      }
      const key = `${p.param_type || 'input'}::${name}`;
      if (seen.has(key)) errors.push(`同层参数名重复：${path ? `${path}.` : ''}${name}`);
      seen.add(key);
      if (p.children && p.children.length) walk(p.children, path ? `${path}.${name}` : name);
    }
  };
  walk(list, '');
  return errors;
}

/** 套用端点格式预设（保留方向分组） */
export function paramsFromPreset(presetParams, direction) {
  return normalizeParams(
    (presetParams || []).filter((p) => (p.param_type || 'input') === direction),
    direction,
  );
}
