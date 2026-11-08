/**
 * 七牛云存储适配器（表单直传 + 上传凭证）
 *
 * 配置：
 * {
 *   "type": "qiniu",
 *   "qiniu": {
 *     "accessKey": "...", "secretKey": "...",
 *     "bucket": "aift",
 *     "publicBase": "https://cdn.example.com",  // 绑定域名（不带协议也可）
 *     "uploadHost": "https://up.qiniup.com"      // 可选，默认华东
 *   }
 * }
 */
import crypto from 'node:crypto';
import path from 'node:path';

export const name = 'qiniu';

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

export function createAdapter(config) {
  const cfg = config?.qiniu || {};
  const accessKey = cfg.accessKey || '';
  const secretKey = cfg.secretKey || '';
  const bucket = cfg.bucket || '';
  const uploadHost = String(cfg.uploadHost || 'https://up.qiniup.com').replace(/\/+$/, '');
  let publicBase = String(cfg.publicBase || '').trim().replace(/\/+$/, '');
  if (publicBase && !/^https?:\/\//i.test(publicBase)) publicBase = `https://${publicBase}`;

  function uploadToken(key) {
    const policy = {
      scope: bucket ? `${bucket}:${key}` : key,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    };
    const encodedPolicy = base64url(JSON.stringify(policy));
    const sign = base64url(crypto.createHmac('sha1', secretKey).update(encodedPolicy).digest());
    return `${accessKey}:${sign}:${encodedPolicy}`;
  }

  return {
    name: 'qiniu',
    description: '七牛云对象存储',

    async put({ buffer, filename, ext, contentType }) {
      if (!accessKey || !secretKey || !bucket) throw new Error('七牛云未配置 accessKey / secretKey / bucket');
      if (!publicBase) throw new Error('七牛云未配置 publicBase（绑定域名）');
      const finalExt = (ext || path.extname(filename || '') || '.bin').toLowerCase();
      const key = `${new Date().toISOString().slice(0, 10)}/${crypto
        .createHash('sha1')
        .update(buffer)
        .digest('hex')
        .slice(0, 16)}${finalExt}`;
      const form = new FormData();
      form.append('token', uploadToken(key));
      form.append('key', key);
      form.append('file', new Blob([buffer], { type: contentType || 'application/octet-stream' }), filename || key);
      const resp = await fetch(uploadHost, { method: 'POST', body: form });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`七牛云上传失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
      }
      return {
        storage: 'qiniu',
        key,
        path: null,
        url: `${publicBase}/${key}`,
        size: buffer.length,
        contentType: contentType || null,
      };
    },

    async get(key) {
      if (!publicBase) throw new Error('七牛云未配置 publicBase');
      const resp = await fetch(`${publicBase}/${key}`);
      if (!resp.ok) throw new Error(`七牛云读取失败: HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    },

    async remove() {
      /* 删除需管理凭证，按需扩展 */
    },

    resolveUrl(key) {
      return `${publicBase}/${key}`;
    },
  };
}
