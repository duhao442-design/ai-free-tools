/**
 * S3 / MinIO 兼容存储适配器（Path-Style + SigV4 签名，不依赖第三方 SDK）
 *
 * 配置（项目级，存 app_setting.storage）：
 * {
 *   "type": "minio",
 *   "minio": {
 *     "endpoint": "http://127.0.0.1:9000",  // 也可写 127.0.0.1:9000
 *     "region": "us-east-1",
 *     "bucket": "aift",
 *     "accessKey": "...",
 *     "secretKey": "...",
 *     "publicBase": "https://cdn.example.com/aift"  // 对象访问域名，缺省用 endpoint/bucket
 *   }
 * }
 */
import crypto from 'node:crypto';
import path from 'node:path';

export const name = 'minio';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

function splitEndpoint(endpoint) {
  let raw = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  const u = new URL(raw);
  return { origin: `${u.protocol}//${u.host}`, host: u.host, protocol: u.protocol };
}

function encodeKey(key) {
  return String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function amzNow() {
  const d = new Date();
  const amzDate = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export function createAdapter(config, runtime) {
  const cfg = config?.minio || config?.s3 || {};
  const { origin, host } = splitEndpoint(cfg.endpoint || 'http://127.0.0.1:9000');
  const region = cfg.region || 'us-east-1';
  const bucket = cfg.bucket || 'aift';
  const accessKey = cfg.accessKey || '';
  const secretKey = cfg.secretKey || '';
  const publicBase = String(cfg.publicBase || `${origin}/${bucket}`).replace(/\/+$/, '');

  function signPut(objectKey, payloadHash, contentType) {
    const { amzDate, dateStamp } = amzNow();
    const canonicalUri = `/${bucket}/${encodeKey(objectKey)}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    return {
      url: `${origin}${canonicalUri}`,
      headers: {
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Content-Type': contentType || 'application/octet-stream',
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };
  }

  return {
    name: 'minio',
    description: 'MinIO / S3 兼容对象存储',

    async put({ buffer, filename, ext, contentType }) {
      if (!accessKey || !secretKey) throw new Error('MinIO 未配置 accessKey / secretKey');
      const finalExt = (ext || path.extname(filename || '') || '.bin').toLowerCase();
      const key = `${new Date().toISOString().slice(0, 10)}/${crypto
        .createHash('sha1')
        .update(buffer)
        .digest('hex')
        .slice(0, 16)}${finalExt}`;
      const payloadHash = sha256hex(buffer);
      const signed = signPut(key, payloadHash, contentType);
      const resp = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: buffer });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`MinIO 上传失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
      }
      return {
        storage: 'minio',
        key,
        path: null,
        url: `${publicBase}/${key}`,
        size: buffer.length,
        contentType: contentType || null,
      };
    },

    async get(key) {
      const { origin: o } = splitEndpoint(cfg.endpoint);
      const url = `${o}/${bucket}/${encodeKey(key)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`MinIO 读取失败: HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    },

    async remove(key) {
      /* 对象存储删除需签名 DELETE，按需扩展；此处保持幂等空实现 */
    },
  };
}
