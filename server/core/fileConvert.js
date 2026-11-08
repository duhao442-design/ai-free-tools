/**
 * 文件类型互转：file（本地文件） / url（远程链接） / base64（data URI 或裸 base64） / none（非文件）
 *
 * 两条使用路径：
 *  1. 输入参数：先「探测」解析出来的值实际是哪种形态，再动态转成接口声明的 file_type；
 *  2. 输出参数：只要声明了文件类型（或探测到是文件），一律转存到项目级存储，返回本地链接。
 */
import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';
import { putFile, runtime } from './storage/index.js';

export const FILE_TYPES = [
  { value: 'none', label: '非文件' },
  { value: 'file', label: 'file（本地文件）' },
  { value: 'url', label: 'url（远程链接）' },
  { value: 'base64', label: 'base64（data URI）' },
];

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv'];

export function isFileValue(value) {
  return detectKind(value) !== 'none';
}

/** 探测值实际属于哪种文件形态 */
export function detectKind(value) {
  if (value === null || value === undefined || value === '') return 'none';

  if (Buffer.isBuffer(value)) return 'file';

  if (typeof value === 'object') {
    // 存储层返回的结构：{ storage, key, url, path }
    if (value.path && typeof value.path === 'string') return 'file';
    if (value.base64 && typeof value.base64 === 'string') return 'base64';
    if (value.url && typeof value.url === 'string') return 'url';
    return 'none';
  }

  if (typeof value !== 'string') return 'none';
  const text = value.trim();
  if (!text) return 'none';

  if (/^data:[\w.+-]+\/[\w.+-]+;base64,/i.test(text)) return 'base64';
  if (/^https?:\/\//i.test(text)) return 'url';
  if (/^file:\/\//i.test(text)) return 'file';
  // 本地存储的相对链接（/files/日期/文件名）
  if (text.startsWith('/files/')) return 'file';
  // Windows 盘符 / UNC / POSIX 绝对路径，且文件真实存在
  if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith('\\\\') || text.startsWith('/')) {
    try {
      if (fs.existsSync(text) && fs.statSync(text).isFile()) return 'file';
    } catch (e) {
      /* ignore */
    }
  }
  return 'none';
}

export function guessMime(hint) {
  if (!hint) return 'application/octet-stream';
  if (/^data:([\w.+-]+\/[\w.+-]+);base64,/i.test(hint)) return RegExp.$1;
  const ext = path.extname(String(hint).split('?')[0]).toLowerCase();
  return mime.lookup(ext) || 'application/octet-stream';
}

export function extFromKind(value, kind) {
  if (kind === 'file' && typeof value === 'string') {
    const ext = path.extname(value).toLowerCase();
    if (ext) return ext;
  }
  if (kind === 'url' && typeof value === 'string') {
    const ext = path.extname(value.split('?')[0]).toLowerCase();
    if (ext) return ext;
  }
  if (kind === 'base64' && typeof value === 'string') {
    const m = /^data:image\/(\w+);base64,/i.exec(value);
    if (m) return `.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  }
  return '.bin';
}

function dataUriToBuffer(text) {
  const comma = text.indexOf(',');
  const meta = text.slice(5, comma);
  const mimeType = meta.split(';')[0] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(meta);
  const payload = text.slice(comma + 1);
  return { buffer: Buffer.from(payload, isBase64 ? 'base64' : 'utf8'), mime: mimeType };
}

/** 把任意文件形态读成 Buffer */
export async function toBuffer(value, kind = detectKind(value)) {
  if (kind === 'none') return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object' && value) {
    if (value.path) return fs.readFileSync(value.path);
    if (value.base64) return dataUriToBuffer(String(value.base64).startsWith('data:') ? value.base64 : `data:application/octet-stream;base64,${value.base64}`).buffer;
    if (value.url) return toBuffer(value.url, 'url');
    return null;
  }
  if (kind === 'base64') {
    const text = String(value);
    const buf = dataUriToBuffer(text.startsWith('data:') ? text : `data:application/octet-stream;base64,${text}`);
    return buf.buffer;
  }
  if (kind === 'file') {
    const raw = String(value);
    if (raw.startsWith('/files/')) {
      // 本地存储相对链接 -> 数据目录下的真实文件
      return fs.readFileSync(path.join(runtime.dataDir, 'files', raw.slice('/files/'.length)));
    }
    const p = raw.replace(/^file:\/\//i, '');
    return fs.readFileSync(decodeURIComponent(p));
  }
  if (kind === 'url') {
    const resp = await fetch(String(value));
    if (!resp.ok) throw new Error(`下载文件失败: HTTP ${resp.status} ${value}`);
    return Buffer.from(await resp.arrayBuffer());
  }
  return null;
}

function bufferToDataUri(buffer, mimeType) {
  return `data:${mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
}

/**
 * 转换为目标形态。
 * @param {*} value 任意文件形态
 * @param {'file'|'url'|'base64'|'none'} target
 * @param {{storageConfig:object, filename?:string}} opts
 */
export async function convertFile(value, target, opts = {}) {
  if (target === 'none') return value;
  const sourceKind = detectKind(value);
  if (sourceKind === 'none') {
    // 不是文件：按字符串原样交给接口，不强行转换（避免把普通文本变成二进制）
    return value;
  }
  if (sourceKind === target) {
    // 已是目标形态：file 时补绝对路径，base64/url 原样
    if (target === 'file' && typeof value === 'string') return value.replace(/^file:\/\//i, '');
    return value;
  }

  const buffer = await toBuffer(value, sourceKind);
  if (!buffer) return value;
  const filename = opts.filename || `file${extFromKind(value, sourceKind)}`;
  const ext = path.extname(filename) || extFromKind(value, sourceKind);
  const contentType = guessMime(filename);

  if (target === 'base64') return bufferToDataUri(buffer, contentType);

  if (target === 'url') {
    const saved = await putFile(opts.storageConfig, { buffer, filename, ext, contentType });
    return saved.url;
  }

  if (target === 'file') {
    const saved = await putFile(opts.storageConfig, { buffer, filename, ext, contentType });
    return saved.path || saved.url;
  }

  return value;
}

/**
 * 输入参数：按接口声明的文件类型动态转换。
 * 值为空/非文件时原样返回；不吞异常，由调用方决定是否中断。
 */
export async function prepareInputValue(value, fileType, opts = {}) {
  const target = String(fileType || 'none').toLowerCase();
  if (target === 'none' || value === null || value === undefined || value === '') return value;
  return convertFile(value, target, opts);
}

/**
 * 输出参数：统一转存到项目级存储，并以「本地链接」形式返回。
 * 非文件类型且未探测到文件时原样返回。
 */
export async function persistOutputValue(value, fileType, opts = {}) {
  const declared = String(fileType || 'none').toLowerCase();
  const detected = detectKind(value);
  if (declared === 'none' && detected === 'none') return value;
  if (detected === 'none') return value;

  const buffer = await toBuffer(value, detected);
  if (!buffer) return value;
  const filename = opts.filename || `output${extFromKind(value, detected)}`;
  const ext = path.extname(filename) || extFromKind(value, detected);
  const saved = await putFile(opts.storageConfig, {
    buffer,
    filename,
    ext,
    contentType: guessMime(filename),
    subDir: opts.subDir,
  });
  // 输出统一存本地链接：即便后端是 minio/qiniu，这里也返回可长期访问的 url 与本地元信息
  return saved.url;
}

/** 输出参数落盘并返回完整元信息（需要 path/key/storage 时用） */
export async function persistOutputFile(value, fileType, opts = {}) {
  const declared = String(fileType || 'none').toLowerCase();
  const detected = detectKind(value);
  if (declared === 'none' && detected === 'none') return null;
  if (detected === 'none') return null;
  const buffer = await toBuffer(value, detected);
  if (!buffer) return null;
  const filename = opts.filename || `output${extFromKind(value, detected)}`;
  const ext = path.extname(filename) || extFromKind(value, detected);
  return putFile(opts.storageConfig, {
    buffer,
    filename,
    ext,
    contentType: guessMime(filename),
    subDir: opts.subDir,
  });
}

export function isImageFile(value) {
  const kind = detectKind(value);
  if (kind === 'none') return false;
  const ext = extFromKind(value, kind).toLowerCase();
  return IMAGE_EXT.includes(ext) || String(value).startsWith('data:image/');
}

export function mediaKindOf(value) {
  const kind = detectKind(value);
  if (kind === 'none') return 'none';
  const ext = extFromKind(value, kind).toLowerCase();
  if (IMAGE_EXT.includes(ext) || String(value).startsWith('data:image/')) return 'image';
  if (AUDIO_EXT.includes(ext) || String(value).startsWith('data:audio/')) return 'audio';
  if (VIDEO_EXT.includes(ext) || String(value).startsWith('data:video/')) return 'video';
  return 'file';
}
