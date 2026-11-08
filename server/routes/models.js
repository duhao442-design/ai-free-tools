/** 模型管理：模型配置的增删改查与连通性测试 */
import express from 'express';
import { now } from '../db/index.js';
import { callInterface } from '../core/interfaceRunner.js';
import { ok, fail, wrap, paged, parsePaging, boolParam, like } from './helpers.js';

const FIELDS = [
  'name', 'provider', 'model_type', 'format_type', 'model_name',
  'base_url', 'api_key', 'is_relay', 'is_active', 'remark',
];

function rowToDto(row) {
  if (!row) return null;
  return {
    ...row,
    is_relay: Boolean(row.is_relay),
    is_active: Boolean(row.is_active),
  };
}

export default function modelsRouter() {
  const router = express.Router();

  router.get('/api/models', wrap((req, res) => {
    const db = req.app.locals.db;
    const { page, pageSize, offset } = parsePaging(req);
    const where = [];
    const args = [];
    if (req.query.name) {
      where.push('name LIKE ? ESCAPE "\\"');
      args.push(like(req.query.name));
    }
    if (req.query.model_type) {
      where.push('model_type = ?');
      args.push(req.query.model_type);
    }
    const active = boolParam(req.query.is_active);
    if (active !== undefined) {
      where.push('is_active = ?');
      args.push(active ? 1 : 0);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS c FROM model_config ${clause}`, args).c;
    const rows = db.all(
      `SELECT * FROM model_config ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, offset],
    );
    paged(res, { rows: rows.map(rowToDto), total, page, pageSize });
  }));

  router.get('/api/models/all', wrap((req, res) => {
    const db = req.app.locals.db;
    const where = ['is_active = 1'];
    const args = [];
    if (req.query.model_type) {
      where.push('model_type = ?');
      args.push(req.query.model_type);
    }
    const rows = db.all(`SELECT * FROM model_config WHERE ${where.join(' AND ')} ORDER BY id ASC`, args);
    ok(res, rows.map(rowToDto));
  }));

  router.get('/api/models/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const row = db.get('SELECT * FROM model_config WHERE id = ?', [Number(req.params.id)]);
    if (!row) return fail(res, '模型不存在', -1, 404);
    ok(res, rowToDto(row));
  }));

  router.post('/api/models', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    if (!body.name) return fail(res, '模型名称必填');
    if (!body.model_name) return fail(res, '模型标识必填');
    const ts = now();
    const values = FIELDS.map((f) => {
      const v = body[f];
      if (f === 'is_relay' || f === 'is_active') return v === undefined ? (f === 'is_active' ? 1 : 0) : (v ? 1 : 0);
      if (v === undefined || v === null) return f === 'provider' ? 'openai' : f === 'model_type' ? 'text' : '';
      return v;
    });
    const { lastId } = db.run(
      `INSERT INTO model_config (${FIELDS.join(',')}, created_at, updated_at)
       VALUES (${FIELDS.map(() => '?').join(',')}, ?, ?)`,
      [...values, ts, ts],
    );
    ok(res, rowToDto(db.get('SELECT * FROM model_config WHERE id = ?', [lastId])));
  }));

  router.put('/api/models/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM model_config WHERE id = ?', [id]);
    if (!exists) return fail(res, '模型不存在', -1, 404);
    const body = req.body || {};
    const sets = [];
    const args = [];
    for (const f of FIELDS) {
      if (body[f] === undefined) continue;
      sets.push(`${f} = ?`);
      if (f === 'is_relay' || f === 'is_active') args.push(body[f] ? 1 : 0);
      else args.push(body[f] === null ? '' : body[f]);
    }
    if (!sets.length) return ok(res, rowToDto(exists));
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE model_config SET ${sets.join(', ')} WHERE id = ?`, args);
    ok(res, rowToDto(db.get('SELECT * FROM model_config WHERE id = ?', [id])));
  }));

  router.delete('/api/models/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    db.run('DELETE FROM model_config WHERE id = ?', [Number(req.params.id)]);
    ok(res, { deleted: true });
  }));

  async function runTest(db, model, payload, formatType) {
    const started = Date.now();
    try {
      const result = await callInterface(model, payload, {
        formatType,
        storageConfig: storageOf(db),
      });
      return {
        success: Boolean(result.success),
        message: result.message,
        response: result.response || '',
        raw_text: (result.raw_text || '').slice(0, 800),
        elapsed: Date.now() - started,
      };
    } catch (e) {
      return { success: false, message: `测试异常: ${e.message}`, response: '', elapsed: Date.now() - started };
    }
  }

  function storageOf(db) {
    const row = db.get('SELECT value FROM app_setting WHERE key = ?', ['storage']);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch (e) {
      return null;
    }
  }

  router.post('/api/models/:id/test', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const model = db.get('SELECT * FROM model_config WHERE id = ?', [Number(req.params.id)]);
    if (!model) return fail(res, '模型不存在', -1, 404);
    const isImage = model.model_type === 'image' || model.format_type === 'openai_image';
    const payload = isImage
      ? { model: model.model_name, prompt: req.body?.prompt || '一只在云端的猫，扁平插画', n: 1, size: '1024x1024' }
      : { model: model.model_name, messages: [{ role: 'user', content: req.body?.prompt || '你好，请回复“连接成功”' }] };
    const formatType = model.format_type || (isImage ? 'openai_image' : 'openai_chat');
    const result = await runTest(db, model, payload, formatType);
    ok(res, result);
  }));

  router.post('/api/models/:id/test-chat', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const model = db.get('SELECT * FROM model_config WHERE id = ?', [Number(req.params.id)]);
    if (!model) return fail(res, '模型不存在', -1, 404);
    const body = req.body || {};
    const messages = [];
    if (body.system_prompt) messages.push({ role: 'system', content: body.system_prompt });
    messages.push({ role: 'user', content: body.prompt || '你好' });
    const payload = {
      model: model.model_name,
      messages,
      temperature: body.temperature !== undefined ? Number(body.temperature) : 0.7,
      max_tokens: body.max_tokens ? Number(body.max_tokens) : 1024,
    };
    const result = await runTest(db, model, payload, model.format_type || 'openai_chat');
    ok(res, result);
  }));

  router.post('/api/models/:id/test-image', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const model = db.get('SELECT * FROM model_config WHERE id = ?', [Number(req.params.id)]);
    if (!model) return fail(res, '模型不存在', -1, 404);
    const body = req.body || {};
    const payload = {
      model: model.model_name,
      prompt: body.prompt || '一只在云端的猫，扁平插画',
      n: Number(body.n || 1),
      size: body.size || '1024x1024',
    };
    if (body.quality) payload.quality = body.quality;
    const result = await runTest(db, model, payload, 'openai_image');
    ok(res, result);
  }));

  return router;
}

