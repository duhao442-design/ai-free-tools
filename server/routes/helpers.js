/** 路由公共工具：统一响应格式（对齐旧项目 {code,message,data}） */

export const ok = (res, data) => res.json({ code: 0, message: 'success', data });

export const paged = (res, { rows, total, page = 1, pageSize = 20 }) =>
  res.json({ code: 0, message: 'success', data: rows, total, page, page_size: pageSize });

export const fail = (res, message, code = -1, status = 400) =>
  res.status(status).json({ code, message, data: null });

/** 包装异步 handler，统一错误处理 */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parsePaging(req, defSize = 20) {
  const page = Math.max(1, Number(req.query.page_num || req.query.page || 1) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.page_size || defSize) || defSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function boolParam(v) {
  if (v === undefined || v === null || v === '') return undefined;
  return v === true || v === 'true' || v === '1' || v === 1;
}

export function like(value) {
  return `%${String(value).replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

export const json = {
  parse(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  },
  stringify(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  },
};
