/** 资产管理：预设变量 key-value，供页面上下文与提示词解析使用 */
import express from 'express';
import { now } from '../db/index.js';
import { ok, fail, wrap, paged, parsePaging, like } from './helpers.js';

export default function assetsRouter() {
  const router = express.Router();

  router.get('/api/assets', wrap((req, res) => {
    const db = req.app.locals.db;
    const { page, pageSize, offset } = parsePaging(req);
    const where = [];
    const args = [];
    if (req.query.key) {
      where.push('(key LIKE ? ESCAPE "\\" OR description LIKE ? ESCAPE "\\")');
      args.push(like(req.query.key), like(req.query.key));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS c FROM asset ${clause}`, args).c;
    const rows = db.all(`SELECT * FROM asset ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
    paged(res, { rows, total, page, pageSize });
  }));

  router.get('/api/assets/all', wrap((req, res) => {
    const db = req.app.locals.db;
    ok(res, db.all('SELECT * FROM asset ORDER BY key ASC'));
  }));

  router.post('/api/assets', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    if (!body.key) return fail(res, '变量名必填');
    const dup = db.get('SELECT id FROM asset WHERE key = ?', [String(body.key).trim()]);
    if (dup) return fail(res, `变量名已存在: ${body.key}`);
    const ts = now();
    const { lastId } = db.run(
      'INSERT INTO asset (key, value, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [String(body.key).trim(), body.value ?? '', body.description || '', ts, ts],
    );
    ok(res, db.get('SELECT * FROM asset WHERE id = ?', [lastId]));
  }));

  router.put('/api/assets/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM asset WHERE id = ?', [id]);
    if (!exists) return fail(res, '资产不存在', -1, 404);
    const body = req.body || {};
    if (body.key && body.key !== exists.key) {
      const dup = db.get('SELECT id FROM asset WHERE key = ? AND id <> ?', [String(body.key).trim(), id]);
      if (dup) return fail(res, `变量名已存在: ${body.key}`);
    }
    const sets = [];
    const args = [];
    for (const f of ['key', 'value', 'description']) {
      if (body[f] === undefined) continue;
      sets.push(`${f} = ?`);
      args.push(body[f]);
    }
    if (!sets.length) return ok(res, exists);
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE asset SET ${sets.join(', ')} WHERE id = ?`, args);
    ok(res, db.get('SELECT * FROM asset WHERE id = ?', [id]));
  }));

  router.delete('/api/assets/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    db.run('DELETE FROM asset WHERE id = ?', [Number(req.params.id)]);
    ok(res, { deleted: true });
  }));

  return router;
}
