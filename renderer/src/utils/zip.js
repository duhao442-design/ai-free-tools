/**
 * 极简 ZIP 打包（仅 store 模式，不压缩）。
 * PNG 本身已压缩，store 足够；不引第三方依赖，纯 JS 可在浏览器与 Node 跑。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time: time & 0xffff, date: day & 0xffff };
}

function utf8(str) {
  return new TextEncoder().encode(str);
}

/**
 * @param {{name: string, data: Uint8Array|ArrayBuffer|number[]}[]} files
 * @returns {Uint8Array} zip 字节
 */
export function zipStore(files) {
  const entries = files.map((f) => {
    const nameBytes = utf8(f.name);
    let data = f.data;
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    if (Array.isArray(data)) data = Uint8Array.from(data);
    return { nameBytes, data: data || new Uint8Array(0), crc: crc32(data || new Uint8Array(0)) };
  });

  const { time, date } = dosDateTime();
  const locals = [];
  let offset = 0;
  for (const e of entries) {
    const header = new Uint8Array(30 + e.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 flag
    view.setUint16(8, 0, true); // store
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, e.crc, true);
    view.setUint32(18, e.data.length, true);
    view.setUint32(22, e.data.length, true);
    view.setUint16(26, e.nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(e.nameBytes, 30);
    locals.push({ header, data: e.data, offset });
    offset += header.length + e.data.length;
  }

  const central = [];
  let centralSize = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const localOffset = locals[i].offset;
    const header = new Uint8Array(46 + e.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, time, true);
    view.setUint16(14, date, true);
    view.setUint32(16, e.crc, true);
    view.setUint32(20, e.data.length, true);
    view.setUint32(24, e.data.length, true);
    view.setUint16(28, e.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, localOffset, true);
    header.set(e.nameBytes, 46);
    central.push(header);
    centralSize += header.length;
  }

  const centralOffset = offset;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const l of locals) {
    out.set(l.header, p);
    p += l.header.length;
    out.set(l.data, p);
    p += l.data.length;
  }
  for (const c of central) {
    out.set(c, p);
    p += c.length;
  }
  out.set(eocd, p);
  return out;
}

/** 用占位符拼文件名：{index} / {index:3} / {page} / {label} */
export function formatFileName(pattern, vars = {}) {
  const index = Number(vars.index || 1);
  const page = vars.page === undefined || vars.page === null ? '' : String(vars.page);
  const label = String(vars.label || '');
  return String(pattern || '{index:3}')
    .replace(/\{index(?::(\d+))?\}/g, (_, pad) => (pad ? String(index).padStart(Number(pad), '0') : String(index)))
    .replace(/\{page\}/g, page)
    .replace(/\{label\}/g, label)
    .replace(/[\\/:*?"<>|]/g, '_');
}
