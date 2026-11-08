/** 页面管理：页面 = 组件拖拽布局 + 上下文配置（页面加载时由后端产出全局上下文） */
import express from 'express';
import { now } from '../db/index.js';
import { buildPageContext, resolveComponentProps, normalizeContextConfig, DEFAULT_CONTEXT_CONFIG } from '../core/pageContext.js';
import { BUILTIN_BY_KEY } from '../core/componentRegistry.js';
import { ok, fail, wrap, paged, parsePaging, like, json } from './helpers.js';

/** 页面执行配置默认值（模型/接口/输入输出/提示词/试跑参数都挂在页面上） */
export const DEFAULT_EXECUTION = {
  model_id: null,
  interface_id: null,
  input_type: 'none',
  output_type: 'none',
  input_value: '',
  prompt: '',
  model_input_value: null,
  model_output_value: null,
  settings: {
    columns: [],
    maxRows: 0,
    rowOffset: 0,
    existing_image_mode: 'overwrite',
    row_key: '',
    image_ref: { from: '', matchField: 'role', nameField: 'name' },
  },
};

export function normalizeExecution(value) {
  const src = value && typeof value === 'object' ? value : {};
  const settings = { ...DEFAULT_EXECUTION.settings, ...(src.settings || {}) };
  if (!Array.isArray(settings.columns)) settings.columns = [];
  if (!settings.image_ref || typeof settings.image_ref !== 'object') {
    settings.image_ref = { from: '', matchField: 'role', nameField: 'name' };
  }
  return {
    model_id: src.model_id ?? null,
    interface_id: src.interface_id ?? null,
    input_type: src.input_type || 'none',
    output_type: src.output_type || 'none',
    input_value: src.input_value || '',
    prompt: src.prompt || '',
    model_input_value: src.model_input_value ?? null,
    model_output_value: src.model_output_value ?? null,
    settings,
  };
}

/** 给页面 DTO 附上「模型/接口/输入输出」摘要，便于列表与工作流步骤展示 */
function attachSummary(dto, models, interfaces) {
  if (!dto) return dto;
  const exec = dto.execution || {};
  const model = models[exec.model_id];
  const iface = interfaces[exec.interface_id];
  return {
    ...dto,
    execution_summary: {
      model: model ? `${model.name}（${model.model_name}）` : '',
      interface: iface ? iface.name : '',
      format_type: iface ? iface.format_type : '',
      input_type: exec.input_type,
      output_type: exec.output_type,
    },
  };
}

function rowToDto(row, db) {
  if (!row) return null;
  const layout = json.parse(row.layout, []);
  const execution = normalizeExecution(json.parse(row.execution, null));
  const users = db
    ? Object.fromEntries(
        db.all('SELECT key, props_schema FROM component').map((c) => [
          c.key,
          json.parse(c.props_schema, []),
        ]),
      )
    : {};
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    layout,
    context_config: normalizeContextConfig(json.parse(row.context_config, DEFAULT_CONTEXT_CONFIG)),
    execution,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    component_count: layout.length,
    _users: users,
  };
}

export default function pagesRouter() {
  const router = express.Router();

  router.get('/api/pages', wrap((req, res) => {
    const db = req.app.locals.db;
    const { page, pageSize, offset } = parsePaging(req);
    const where = [];
    const args = [];
    if (req.query.name) {
      where.push('name LIKE ? ESCAPE "\\"');
      args.push(like(req.query.name));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS c FROM page ${clause}`, args).c;
    const rows = db.all(`SELECT * FROM page ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
    const models = Object.fromEntries(
      db.all('SELECT id, name, model_name, model_type FROM model_config').map((m) => [m.id, m]),
    );
    const interfaces = Object.fromEntries(
      db.all('SELECT id, name, format_type FROM interface_config').map((it) => [it.id, it]),
    );
    paged(res, {
      rows: rows.map((r) => attachSummary(rowToDto(r, db), models, interfaces)),
      total,
      page,
      pageSize,
    });
  }));

  router.get('/api/pages/all', wrap((req, res) => {
    const db = req.app.locals.db;
    const models = Object.fromEntries(
      db.all('SELECT id, name, model_name, model_type FROM model_config').map((m) => [m.id, m]),
    );
    const interfaces = Object.fromEntries(
      db.all('SELECT id, name, format_type FROM interface_config').map((it) => [it.id, it]),
    );
    const rows = db.all('SELECT * FROM page WHERE is_active = 1 ORDER BY id ASC');
    ok(res, rows.map((row) => {
      const dto = rowToDto(row, db);
      return {
        id: dto.id,
        name: dto.name,
        description: dto.description,
        execution: dto.execution,
        execution_summary: attachSummary(dto, models, interfaces).execution_summary,
      };
    }));
  }));

  router.get('/api/pages/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const row = db.get('SELECT * FROM page WHERE id = ?', [Number(req.params.id)]);
    if (!row) return fail(res, '页面不存在', -1, 404);
    ok(res, rowToDto(row, db));
  }));

  router.post('/api/pages', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    if (!body.name) return fail(res, '页面名称必填');
    const ts = now();
    const { lastId } = db.run(
      `INSERT INTO page (name, description, layout, context_config, execution, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || '',
        JSON.stringify(json.parse(body.layout, [])),
        JSON.stringify(normalizeContextConfig(json.parse(body.context_config, DEFAULT_CONTEXT_CONFIG))),
        // 只有显式传 execution 才写入：老页面保持 NULL，执行配置仍回落到工作流步骤（兼容老数据）
        body.execution === undefined || body.execution === null
          ? null
          : JSON.stringify(normalizeExecution(body.execution)),
        body.is_active === false ? 0 : 1,
        ts,
        ts,
      ],
    );
    ok(res, rowToDto(db.get('SELECT * FROM page WHERE id = ?', [lastId]), db));
  }));

  router.put('/api/pages/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM page WHERE id = ?', [id]);
    if (!exists) return fail(res, '页面不存在', -1, 404);
    const body = req.body || {};
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
    if (body.layout !== undefined) {
      sets.push('layout = ?');
      args.push(JSON.stringify(json.parse(body.layout, [])));
    }
    if (body.context_config !== undefined) {
      sets.push('context_config = ?');
      args.push(JSON.stringify(normalizeContextConfig(json.parse(body.context_config, DEFAULT_CONTEXT_CONFIG))));
    }
    if (body.execution !== undefined) {
      sets.push('execution = ?');
      args.push(
        body.execution === null ? null : JSON.stringify(normalizeExecution(body.execution)),
      );
    }
    if (body.is_active !== undefined) {
      sets.push('is_active = ?');
      args.push(body.is_active ? 1 : 0);
    }
    if (!sets.length) return ok(res, rowToDto(exists, db));
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE page SET ${sets.join(', ')} WHERE id = ?`, args);
    ok(res, rowToDto(db.get('SELECT * FROM page WHERE id = ?', [id]), db));
  }));

  router.delete('/api/pages/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    db.run('DELETE FROM page WHERE id = ?', [Number(req.params.id)]);
    ok(res, { deleted: true });
  }));

  /** 预览页面上下文（页面设计器 / 作品详情共用） */
  router.post('/api/pages/preview-context', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const page = body.page_id ? db.get('SELECT * FROM page WHERE id = ?', [Number(body.page_id)]) : null;
    if (body.page_id && !page) return fail(res, '页面不存在', -1, 404);

    let work = null;
    let workflow = null;
    if (body.work_id) {
      work = db.get('SELECT * FROM work WHERE id = ?', [Number(body.work_id)]);
      if (work?.workflow_id) workflow = db.get('SELECT * FROM workflow WHERE id = ?', [work.workflow_id]);
    }

    const ctx = await buildPageContext({
      db,
      work,
      workflow,
      page,
      stepOrder: Number(body.step || 1),
      extra: { prompt: body.prompt || '', modelName: body.model_name || '' },
    });
    ok(res, { context: ctx, page: page ? { id: page.id, name: page.name, layout: json.parse(page.layout, []) } : null });
  }));

  /** 解析页面：返回上下文 + 每个组件实例解析后的 props（所见即所得调试） */
  router.post('/api/pages/resolve', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const page = db.get('SELECT * FROM page WHERE id = ?', [Number(body.page_id)]);
    if (!page) return fail(res, '页面不存在', -1, 404);

    let work = null;
    let workflow = null;
    if (body.work_id) {
      work = db.get('SELECT * FROM work WHERE id = ?', [Number(body.work_id)]);
      if (work?.workflow_id) workflow = db.get('SELECT * FROM workflow WHERE id = ?', [work.workflow_id]);
    }
    const ctx = await buildPageContext({
      db,
      work,
      workflow,
      page,
      stepOrder: Number(body.step || 1),
      extra: { prompt: body.prompt || '', modelName: body.model_name || '' },
    });

    const layout = json.parse(page.layout, []);
    const userRows = Object.fromEntries(
      db.all('SELECT key, props_schema, render_spec FROM component').map((c) => [c.key, c]),
    );
    const userSchemas = Object.fromEntries(
      Object.entries(userRows).map(([k, v]) => [k, json.parse(v.props_schema, [])]),
    );
    const resolved = layout.map((block) => {
      const meta = BUILTIN_BY_KEY[block.component];
      const schema = meta ? meta.props : userSchemas[block.component] || [];
      return {
        id: block.id,
        component: block.component,
        spec: meta ? null : json.parse(userRows[block.component]?.render_spec, null),
        props: resolveComponentProps(ctx, block.props || {}, schema),
      };
    });
    ok(res, { context: ctx, layout, resolved });
  }));

  return router;
}
