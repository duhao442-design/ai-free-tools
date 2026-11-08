/** 项目级设置：存储配置、通用偏好 */
import express from 'express';
import { now } from '../db/index.js';
import { normalizeStorageConfig, STORAGE_TYPES, testStorage } from '../core/storage/index.js';
import { ok, fail, wrap, json } from './helpers.js';

const DEFAULTS = {
  storage: normalizeStorageConfig(null),
  app: { language: 'zh-CN', theme: 'light' },
};

export default function settingsRouter() {
  const router = express.Router();

  router.get('/api/settings', wrap((req, res) => {
    const db = req.app.locals.db;
    const rows = db.all('SELECT key, value FROM app_setting');
    const out = JSON.parse(JSON.stringify(DEFAULTS));
    for (const row of rows) out[row.key] = json.parse(row.value, row.value);
    out.storage = normalizeStorageConfig(out.storage);
    ok(res, out);
  }));

  router.put('/api/settings', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const ts = now();
    for (const [key, value] of Object.entries(body)) {
      const exists = db.get('SELECT key FROM app_setting WHERE key = ?', [key]);
      const payload = JSON.stringify(value);
      if (exists) db.run('UPDATE app_setting SET value = ?, updated_at = ? WHERE key = ?', [payload, ts, key]);
      else db.run('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)', [key, payload, ts]);
    }
    ok(res, { saved: true });
  }));

  router.get('/api/settings/storage', wrap((req, res) => {
    const db = req.app.locals.db;
    const row = db.get('SELECT value FROM app_setting WHERE key = ?', ['storage']);
    const cfg = normalizeStorageConfig(row ? json.parse(row.value, null) : null);
    ok(res, { config: cfg, types: STORAGE_TYPES });
  }));

  router.put('/api/settings/storage', wrap((req, res) => {
    const db = req.app.locals.db;
    const cfg = normalizeStorageConfig(req.body);
    const ts = now();
    const exists = db.get('SELECT key FROM app_setting WHERE key = ?', ['storage']);
    if (exists) db.run('UPDATE app_setting SET value = ?, updated_at = ? WHERE key = ?', [JSON.stringify(cfg), ts, 'storage']);
    else db.run('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)', ['storage', JSON.stringify(cfg), ts]);
    ok(res, cfg);
  }));

  router.post('/api/settings/storage/test', wrap(async (req, res) => {
    try {
      const cfg = normalizeStorageConfig(req.body);
      const result = await testStorage(cfg);
      ok(res, result);
    } catch (e) {
      fail(res, `存储测试失败: ${e.message}`, -1, 200);
    }
  }));

  return router;
}
