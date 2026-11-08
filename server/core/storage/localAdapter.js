/**
 * 本地存储适配器：文件写入 userData/files/YYYY-MM-DD/<hash>.<ext>，
 * 通过内置 HTTP 服务的 /files 静态路由对外提供本地链接。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const name = 'local';

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function safeExt(ext, filename) {
  const fromName = filename ? path.extname(filename) : '';
  const raw = (ext || fromName || '.bin').toLowerCase();
  const clean = raw.replace(/[^.a-z0-9]/g, '');
  return clean.startsWith('.') && clean.length > 1 ? clean : '.bin';
}

export function createAdapter(config, runtime) {
  const dataDir = runtime.dataDir;
  const baseDir = path.resolve(config?.dir || path.join(dataDir, 'files'));

  return {
    name: 'local',
    description: '本地磁盘（默认）',

    async put({ buffer, filename, ext, contentType, subDir }) {
      const day = today();
      const dir = path.join(baseDir, subDir || day);
      fs.mkdirSync(dir, { recursive: true });
      const finalExt = safeExt(ext, filename);
      const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
      const base = path.basename(filename || '', finalExt) || 'file';
      const safeBase = base.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 40);
      const key = path.posix.join(subDir || day, `${safeBase}-${hash}${finalExt}`);
      const abs = path.join(baseDir, key);
      fs.writeFileSync(abs, buffer);
      const relativeUrl = `/files/${key.split(path.sep).join('/')}`;
      return {
        storage: 'local',
        key,
        path: abs,
        // 存相对链接：服务端口每次启动可能不同，相对链接由前端/后端按当前地址拼接
        url: relativeUrl,
        absUrl: `${runtime.baseUrl}${relativeUrl}`,
        size: buffer.length,
        contentType: contentType || null,
      };
    },

    async get(key) {
      const abs = path.isAbsolute(key) ? key : path.join(baseDir, key);
      return fs.readFileSync(abs);
    },

    async remove(key) {
      const abs = path.isAbsolute(key) ? key : path.join(baseDir, key);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    },

    baseDir,
  };
}

export function fileUrl(runtime, key) {
  return `${runtime.baseUrl}/files/${String(key).split(path.sep).join('/')}`;
}
