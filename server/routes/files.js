/** 文件上传 / 类型转换（前端以 base64 提交，桌面端无需 multipart 依赖） */
import express from 'express';
import path from 'node:path';
import { putFile, getAdapter } from '../core/storage/index.js';
import { convertFile, FILE_TYPES, detectKind, guessMime } from '../core/fileConvert.js';
import { ok, fail, wrap, json } from './helpers.js';

function storageOf(db) {
  const row = db.get('SELECT value FROM app_setting WHERE key = ?', ['storage']);
  return row ? json.parse(row.value, null) : null;
}

export default function filesRouter() {
  const router = express.Router();

  router.get('/api/files/types', wrap((req, res) => ok(res, FILE_TYPES)));

  /**
   * 上传：{ filename, content_base64, sub_dir }
   * content_base64 允许带 dataURI 前缀
   */
  router.post('/api/files/upload', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const filename = String(body.filename || 'upload.bin');
    const raw = String(body.content_base64 || '');
    if (!raw) return fail(res, '文件内容为空');
    const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch (e) {
      return fail(res, 'Base64 解析失败');
    }
    if (!buffer.length) return fail(res, '文件内容为空');
    const ext = path.extname(filename).toLowerCase() || '.bin';
    try {
      const saved = await putFile(storageOf(db), {
        buffer,
        filename,
        ext,
        contentType: guessMime(filename),
        subDir: body.sub_dir || 'uploads',
      });
      if (req.app.locals.db) {
        db.run(
          `INSERT INTO file_object (storage, key, url, path, mime, size, origin, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [saved.storage, saved.key, saved.url, saved.path || null, guessMime(filename), buffer.length, 'upload', new Date().toISOString()],
        );
      }
      ok(res, saved);
    } catch (e) {
      fail(res, `上传失败: ${e.message}`, -1, 200);
    }
  }));

  /** 下载/预览能力：读取存储中的对象并回传（minio/qiniu 也走这里，避免前端跨域） */
  router.get('/api/files/read', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const key = String(req.query.key || '');
    if (!key) return fail(res, '缺少 key');
    try {
      const adapter = getAdapter(storageOf(db));
      const buffer = await adapter.get(key);
      res.setHeader('Content-Type', guessMime(key));
      res.send(buffer);
    } catch (e) {
      fail(res, `读取失败: ${e.message}`, -1, 200);
    }
  }));

  /** 文件类型互转（调试/验证用） */
  router.post('/api/files/convert', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const value = body.value;
    const target = body.target || 'none';
    try {
      const out = await convertFile(value, target, {
        storageConfig: storageOf(db),
        filename: body.filename || undefined,
      });
      ok(res, { source_kind: detectKind(value), target, value: out });
    } catch (e) {
      fail(res, `转换失败: ${e.message}`, -1, 200);
    }
  }));

  return router;
}
