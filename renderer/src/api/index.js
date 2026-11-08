import axios from 'axios';
import { Message } from 'element-ui';

const apiBase = (typeof window !== 'undefined' && window.aift && window.aift.apiBase) || '';

export const http = axios.create({
  baseURL: `${apiBase}/api`,
  timeout: 300000,
});

http.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        Message.error(body.message || '请求失败');
        return Promise.reject(new Error(body.message || '请求失败'));
      }
      return body;
    }
    return body;
  },
  (err) => {
    const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message || ''));
    const msg = isTimeout
      ? '请求超时（浏览器侧等待过久）；后台任务可能仍在执行，请稍后刷新查看进度'
      : err?.response?.data?.message || err.message || '网络异常';
    Message.error(msg);
    return Promise.reject(err);
  },
);

/* ---------------- 模型 ---------------- */
export const modelApi = {
  list: (params) => http.get('/models', { params }).then((r) => r.data),
  listPage: (params) => http.get('/models', { params }),
  all: (params) => http.get('/models/all', { params }).then((r) => r.data),
  detail: (id) => http.get(`/models/${id}`).then((r) => r.data),
  create: (data) => http.post('/models', data).then((r) => r.data),
  update: (id, data) => http.put(`/models/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/models/${id}`),
  test: (id, data) => http.post(`/models/${id}/test`, data || {}).then((r) => r.data),
  testChat: (id, data) => http.post(`/models/${id}/test-chat`, data).then((r) => r.data),
  testImage: (id, data) => http.post(`/models/${id}/test-image`, data).then((r) => r.data),
};

/* ---------------- 接口 ---------------- */
export const interfaceApi = {
  page: (params) => http.get('/interface-configs', { params }),
  all: () => http.get('/interface-configs/all').then((r) => r.data),
  detail: (id) => http.get(`/interface-configs/${id}`).then((r) => r.data),
  create: (data) => http.post('/interface-configs', data).then((r) => r.data),
  update: (id, data) => http.put(`/interface-configs/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/interface-configs/${id}`),
  presets: () => http.get('/interface-configs/format-presets').then((r) => r.data),
  preview: (data) => http.post('/interface-configs/preview', data).then((r) => r.data),
  debug: (data) => http.post('/interface-configs/debug', data).then((r) => r.data),
};

/* ---------------- 资产 ---------------- */
export const assetApi = {
  page: (params) => http.get('/assets', { params }),
  all: () => http.get('/assets/all').then((r) => r.data),
  create: (data) => http.post('/assets', data).then((r) => r.data),
  update: (id, data) => http.put(`/assets/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/assets/${id}`),
};

/* ---------------- 组件 ---------------- */
export const componentApi = {
  list: (params) => http.get('/components', { params }).then((r) => r.data),
  registry: () => http.get('/components/registry').then((r) => r.data),
  detail: (id) => http.get(`/components/${id}`).then((r) => r.data),
  create: (data) => http.post('/components', data).then((r) => r.data),
  update: (id, data) => http.put(`/components/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/components/${id}`),
  defaultProps: (key) => http.get(`/components/${key}/default-props`).then((r) => r.data),
};

/* ---------------- 页面 ---------------- */
export const pageApi = {
  page: (params) => http.get('/pages', { params }),
  all: () => http.get('/pages/all').then((r) => r.data),
  detail: (id) => http.get(`/pages/${id}`).then((r) => r.data),
  create: (data) => http.post('/pages', data).then((r) => r.data),
  update: (id, data) => http.put(`/pages/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/pages/${id}`),
  previewContext: (data) => http.post('/pages/preview-context', data).then((r) => r.data),
  resolve: (data) => http.post('/pages/resolve', data).then((r) => r.data),
};

/* ---------------- 工作流 ---------------- */
export const workflowApi = {
  page: (params) => http.get('/workflows', { params }),
  all: () => http.get('/workflows/all').then((r) => r.data),
  detail: (id) => http.get(`/workflows/${id}`).then((r) => r.data),
  create: (data) => http.post('/workflows', data).then((r) => r.data),
  update: (id, data) => http.put(`/workflows/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/workflows/${id}`),
};

/* ---------------- 作品 ---------------- */
export const workApi = {
  page: (params) => http.get('/works', { params }),
  detail: (id) => http.get(`/works/${id}`).then((r) => r.data),
  detailFull: (id) => http.get(`/works/${id}/detail`).then((r) => r.data),
  status: (id) => http.get(`/works/${id}/status`).then((r) => r.data),
  pageData: (id, step) => http.get(`/works/${id}/page`, { params: { step } }).then((r) => r.data),
  create: (data) => http.post('/works', data).then((r) => r.data),
  update: (id, data) => http.put(`/works/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/works/${id}`),
  // 执行/重置可能跑很久（逐行调用上游），不设前端超时；进度靠后端逐行落库 + 轮询
  run: (id, order, inputs) => http.post(`/works/${id}/steps/${order}/run`, { inputs }, { timeout: 0 }).then((r) => r.data),
  reset: (id, order) => http.post(`/works/${id}/steps/${order}/reset`, null, { timeout: 0 }).then((r) => r.data),
  preview: (id, order, inputs) => http.post(`/works/${id}/steps/${order}/preview`, { inputs }).then((r) => r.data),
  savePrompt: (id, order, prompt, scope) => http.put(`/works/${id}/steps/${order}/prompt`, { prompt, scope }).then((r) => r.data),
  saveParams: (id, params) => http.put(`/works/${id}/params`, { params }).then((r) => r.data),
};

/* ---------------- 设置 / 文件 ---------------- */
export const settingApi = {
  get: () => http.get('/settings').then((r) => r.data),
  save: (data) => http.put('/settings', data).then((r) => r.data),
  storage: () => http.get('/settings/storage').then((r) => r.data),
  saveStorage: (data) => http.put('/settings/storage', data).then((r) => r.data),
  testStorage: (data) => http.post('/settings/storage/test', data).then((r) => r.data),
};

export const fileApi = {
  types: () => http.get('/files/types').then((r) => r.data),
  upload: (data) => http.post('/files/upload', data).then((r) => r.data),
  convert: (data) => http.post('/files/convert', data).then((r) => r.data),
  readUrl: (key) => `${apiBase}/api/files/read?key=${encodeURIComponent(key)}`,
};

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export { apiBase };
