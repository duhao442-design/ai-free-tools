/** 工作流管理：把页面按顺序组装成一条流程；页面之间不共享前端传参 */
import express from 'express';
import { now } from '../db/index.js';
import { normalizeWorkflowSteps } from '../core/workflowEngine.js';
import { ok, fail, wrap, paged, parsePaging, like, json } from './helpers.js';

function rowToDto(row, db) {
  if (!row) return null;
  const steps = normalizeWorkflowSteps(row);
  const pages = db ? Object.fromEntries(db.all('SELECT id, name FROM page').map((p) => [p.id, p.name])) : {};
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    steps,
    step_count: steps.length,
    pages,
    variable_mapping: json.parse(row.variable_mapping, {}),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateSteps(steps, db) {
  const errors = [];
  const ids = db.all('SELECT id FROM page').map((p) => p.id);
  const idSet = new Set(ids);
  steps.forEach((s, i) => {
    if (!s.name) errors.push(`第 ${i + 1} 步缺少名称`);
    if (s.page_id && !idSet.has(Number(s.page_id))) errors.push(`第 ${i + 1} 步引用的页面不存在`);
  });
  return errors;
}

export default function workflowsRouter() {
  const router = express.Router();

  router.get('/api/workflows', wrap((req, res) => {
    const db = req.app.locals.db;
    const { page, pageSize, offset } = parsePaging(req);
    const where = [];
    const args = [];
    if (req.query.name) {
      where.push('name LIKE ? ESCAPE "\\"');
      args.push(like(req.query.name));
    }
    if (req.query.type) {
      where.push('type = ?');
      args.push(req.query.type);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS c FROM workflow ${clause}`, args).c;
    const rows = db.all(`SELECT * FROM workflow ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
    paged(res, { rows: rows.map((r) => rowToDto(r, db)), total, page, pageSize });
  }));

  router.get('/api/workflows/all', wrap((req, res) => {
    const db = req.app.locals.db;
    const rows = db.all('SELECT * FROM workflow WHERE is_active = 1 ORDER BY id ASC');
    ok(res, rows.map((r) => rowToDto(r, db)));
  }));

  router.get('/api/workflows/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const row = db.get('SELECT * FROM workflow WHERE id = ?', [Number(req.params.id)]);
    if (!row) return fail(res, '工作流不存在', -1, 404);
    ok(res, rowToDto(row, db));
  }));

  router.post('/api/workflows', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    if (!body.name) return fail(res, '工作流名称必填');
    const steps = normalizeWorkflowSteps({ steps: body.steps || [] });
    const errors = validateSteps(steps, db);
    if (errors.length) return fail(res, errors.join('；'));
    const ts = now();
    const { lastId } = db.run(
      `INSERT INTO workflow (name, description, type, steps, variable_mapping, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || '',
        body.type || 'comic',
        JSON.stringify(steps),
        JSON.stringify(json.parse(body.variable_mapping, {})),
        body.is_active === false ? 0 : 1,
        ts,
        ts,
      ],
    );
    ok(res, rowToDto(db.get('SELECT * FROM workflow WHERE id = ?', [lastId]), db));
  }));

  router.put('/api/workflows/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM workflow WHERE id = ?', [id]);
    if (!exists) return fail(res, '工作流不存在', -1, 404);
    const body = req.body || {};
    if (body.steps !== undefined) {
      const steps = normalizeWorkflowSteps({ steps: body.steps });
      const errors = validateSteps(steps, db);
      if (errors.length) return fail(res, errors.join('；'));
    }
    const sets = [];
    const args = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      args.push(body.name);
    }
    if (body.description !== undefined) {
      sets.push('description = ?');
      args.push(body.description || '');
    }
    if (body.type !== undefined) {
      sets.push('type = ?');
      args.push(body.type);
    }
    if (body.steps !== undefined) {
      sets.push('steps = ?');
      args.push(JSON.stringify(normalizeWorkflowSteps({ steps: body.steps })));
    }
    if (body.variable_mapping !== undefined) {
      sets.push('variable_mapping = ?');
      args.push(JSON.stringify(json.parse(body.variable_mapping, {})));
    }
    if (body.is_active !== undefined) {
      sets.push('is_active = ?');
      args.push(body.is_active ? 1 : 0);
    }
    if (!sets.length) return ok(res, rowToDto(exists, db));
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE workflow SET ${sets.join(', ')} WHERE id = ?`, args);
    ok(res, rowToDto(db.get('SELECT * FROM workflow WHERE id = ?', [id]), db));
  }));

  router.delete('/api/workflows/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    db.run('DELETE FROM workflow WHERE id = ?', [Number(req.params.id)]);
    ok(res, { deleted: true });
  }));

  return router;
}
