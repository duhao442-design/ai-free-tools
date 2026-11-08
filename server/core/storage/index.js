/**
 * 存储适配器注册表 —— 「项目级」配置，可在设置页切换 local / minio / qiniu。
 *
 * 设计约定：
 *  - 所有适配器实现 put({buffer,filename,ext,contentType}) -> {storage,key,url,path,size}；
 *  - get(key) -> Buffer；remove(key) -> Promise<void>；
 *  - 业务代码只通过本模块的 putFile / readFile 访问存储，新增适配器只需在这里注册。
 */
import { createAdapter as createLocal } from './localAdapter.js';
import { createAdapter as createMinio } from './minioAdapter.js';
import { createAdapter as createQiniu } from './qiniuAdapter.js';

const FACTORIES = {
  local: createLocal,
  minio: createMinio,
  qiniu: createQiniu,
};

/** 运行时上下文：{ dataDir, baseUrl }，由服务启动时注入 */
export const runtime = {
  dataDir: process.cwd(),
  baseUrl: 'http://127.0.0.1:0',
};

export function setRuntime(patch) {
  Object.assign(runtime, patch);
}

export const STORAGE_TYPES = [
  { value: 'local', label: '本地磁盘', description: '文件写入应用数据目录，通过本地链接访问（默认）' },
  { value: 'minio', label: 'MinIO / S3', description: '上传到对象存储，返回对象访问链接' },
  { value: 'qiniu', label: '七牛云', description: '上传到七牛云 Kodo，返回绑定域名链接' },
];

export const DEFAULT_STORAGE = {
  type: 'local',
  local: { dir: '', baseUrl: '' },
  minio: { endpoint: 'http://127.0.0.1:9000', region: 'us-east-1', bucket: 'aift', accessKey: '', secretKey: '', publicBase: '' },
  qiniu: { accessKey: '', secretKey: '', bucket: '', publicBase: '', uploadHost: 'https://up.qiniup.com' },
};

export function normalizeStorageConfig(config) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_STORAGE));
  if (config && typeof config === 'object') {
    merged.type = config.type || merged.type;
    for (const key of ['local', 'minio', 'qiniu']) {
      if (config[key] && typeof config[key] === 'object') Object.assign(merged[key], config[key]);
    }
  }
  if (!FACTORIES[merged.type]) merged.type = 'local';
  return merged;
}

/** 按项目级配置取适配器实例 */
export function getAdapter(config) {
  const cfg = normalizeStorageConfig(config);
  const factory = FACTORIES[cfg.type] || FACTORIES.local;
  return factory(cfg, runtime);
}

/** 写入文件（统一入口） */
export async function putFile(config, file) {
  const adapter = getAdapter(config);
  return adapter.put(file);
}

export async function readFile(config, key) {
  const adapter = getAdapter(config);
  return adapter.get(key);
}

/** 测试存储连通性（设置页「测试连接」用） */
export async function testStorage(config) {
  const cfg = normalizeStorageConfig(config);
  const buf = Buffer.from(`ai-free-tools storage test ${new Date().toISOString()}`, 'utf8');
  const saved = await putFile(cfg, { buffer: buf, filename: 'storage-test.txt', ext: '.txt', contentType: 'text/plain' });
  return { ok: true, type: cfg.type, saved };
}
