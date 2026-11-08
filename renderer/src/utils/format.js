import dayjs from 'dayjs';

export function formatDate(value) {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(value);
}

export function truncate(text, len = 80) {
  if (text === null || text === undefined) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

export function formatJson(value, space = 2) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, space);
    } catch (e) {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, space);
  } catch (e) {
    return String(value);
  }
}

/** 单元格取值：支持 a.b.c 路径与 raw_data 兜底 */
export function cellValue(row, key) {
  if (!row || key === undefined) return '';
  const read = (obj, path) => {
    if (!obj || typeof obj !== 'object') return undefined;
    return String(path)
      .split('.')
      .reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);
  };
  let v = read(row, key);
  if (v === undefined) v = read(row.raw_data, key);
  if (v === undefined) v = read(row.raw, key);
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function parseJsonSafe(text, fallback = null) {
  if (text === null || text === undefined || text === '') return fallback;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

export function isImageUrl(value) {
  if (typeof value !== 'string') return false;
  return (
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(value) ||
    /\/files\/images\//i.test(value)
  );
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}
