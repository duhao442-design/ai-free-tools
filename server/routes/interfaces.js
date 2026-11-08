/** 接口管理：接口配置 CRUD + 端点格式预设 + 报文预览 / 调试 */
import express from 'express';
import { now } from '../db/index.js';
import { listPresets, getSpec, finalizeRequest, maskHeaders, maskQuery } from '../core/endpointFormats.js';
import { buildRequest, callInterface } from '../core/interfaceRunner.js';
import { resolveComponentProps } from '../core/pageContext.js';
import { ok, fail, wrap, paged, parsePaging, boolParam, like, json } from './helpers.js';

function rowToDto(row) {
  if (!row) return null;
  return {
    ...row,
    params: json.parse(row.params, []),
    is_active: Boolean(row.is_active),
  };
}

/** 参数树校验：同层同方向重名、空名（输入/输出允许同名，它们是两个分组） */
function validateParams(params) {
  const errors = [];
  const walk = (list, pathStr) => {
    const seen = new Set();
    for (const p of list || []) {
      if (!p.param_name || !String(p.param_name).trim()) {
        errors.push(`存在未命名的参数（${pathStr || '顶层'}）`);
        continue;
      }
      const type = p.param_type || 'input';
      const key = `${type}::${p.param_name}`;
      if (seen.has(key)) {
        errors.push(`参数名重复: ${pathStr ? `${pathStr}.` : ''}${p.param_name}（${type}）`);
      }
      seen.add(key);
      if (Array.isArray(p.children) && p.children.length) {
        walk(p.children, pathStr ? `${pathStr}.${p.param_name}` : p.param_name);
      }
    }
  };
  walk(params, '');
  return errors;
}

function storageOf(db) {
  const row = db.get('SELECT value FROM app_setting WHERE key = ?', ['storage']);
  return row ? json.parse(row.value, null) : null;
}

/** 预览/调试用：优先用请求体里的 params，否则取已保存接口的 params */
function resolveParamsForRequest(db, body) {
  if (body.params !== undefined) return json.parse(body.params, []);
  if (!body.id) return [];
  const row = db.get('SELECT params FROM interface_config WHERE id = ?', [Number(body.id)]);
  return json.parse(row?.params, []);
}

export default function interfacesRouter() {
  const router = express.Router();

  router.get('/api/interface-configs', wrap((req, res) => {
    const db = req.app.locals.db;
    const { page, pageSize, offset } = parsePaging(req);
    const where = [];
    const args = [];
    if (req.query.name) {
      where.push('name LIKE ? ESCAPE "\\"');
      args.push(like(req.query.name));
    }
    const active = boolParam(req.query.is_active);
    if (active !== undefined) {
      where.push('is_active = ?');
      args.push(active ? 1 : 0);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS c FROM interface_config ${clause}`, args).c;
    const rows = db.all(
      `SELECT * FROM interface_config ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, offset],
    );
    paged(res, { rows: rows.map(rowToDto), total, page, pageSize });
  }));

  router.get('/api/interface-configs/all', wrap((req, res) => {
    const db = req.app.locals.db;
    const rows = db.all('SELECT * FROM interface_config WHERE is_active = 1 ORDER BY id ASC');
    ok(res, rows.map(rowToDto));
  }));

  router.get('/api/interface-configs/format-presets', wrap((req, res) => {
    ok(res, listPresets());
  }));

  router.get('/api/interface-configs/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const row = db.get('SELECT * FROM interface_config WHERE id = ?', [Number(req.params.id)]);
    if (!row) return fail(res, '接口不存在', -1, 404);
    ok(res, rowToDto(row));
  }));

  router.post('/api/interface-configs', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    if (!body.name) return fail(res, '接口名称必填');
    const params = json.parse(body.params, []);
    const errors = validateParams(params);
    if (errors.length) return fail(res, errors.join('；'));
    const ts = now();
    const { lastId } = db.run(
      `INSERT INTO interface_config (name, description, format_type, params, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || '',
        body.format_type || null,
        JSON.stringify(params),
        body.is_active === false ? 0 : 1,
        ts,
        ts,
      ],
    );
    ok(res, rowToDto(db.get('SELECT * FROM interface_config WHERE id = ?', [lastId])));
  }));

  router.put('/api/interface-configs/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM interface_config WHERE id = ?', [id]);
    if (!exists) return fail(res, '接口不存在', -1, 404);
    const body = req.body || {};
    if (body.params !== undefined) {
      const errors = validateParams(json.parse(body.params, []));
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
    if (body.format_type !== undefined) {
      sets.push('format_type = ?');
      args.push(body.format_type || null);
    }
    if (body.params !== undefined) {
      sets.push('params = ?');
      args.push(JSON.stringify(json.parse(body.params, [])));
    }
    if (body.is_active !== undefined) {
      sets.push('is_active = ?');
      args.push(body.is_active ? 1 : 0);
    }
    if (!sets.length) return ok(res, rowToDto(exists));
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE interface_config SET ${sets.join(', ')} WHERE id = ?`, args);
    ok(res, rowToDto(db.get('SELECT * FROM interface_config WHERE id = ?', [id])));
  }));

  router.delete('/api/interface-configs/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    db.run('DELETE FROM interface_config WHERE id = ?', [Number(req.params.id)]);
    ok(res, { deleted: true });
  }));

  /**
   * 报文预览：按接口参数 + 上下文构造请求报文（不发送）
   * body: { params, model_id?, context?, sample? }
   */
  router.post('/api/interface-configs/preview', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const params = resolveParamsForRequest(db, body);

    const model = body.model_id
      ? db.get('SELECT * FROM model_config WHERE id = ?', [Number(body.model_id)])
      : null;
    const spec = getSpec(body.format_type || model?.format_type || null);

    const context = body.context || {
      gb: {
        prompt: '示例提示词',
        model_name: model?.model_name || 'gpt-4o',
        content: '示例作品内容',
        ...(body.sample || {}),
      },
      stepList: [],
    };

    const { payload, errors } = await buildRequest(params, body.overrides || null, context, {
      storageConfig: storageOf(db),
    });

    let request = null;
    if (spec && model) {
      const finalized = finalizeRequest(spec.key, model, payload);
      request = {
        ...finalized,
        headers: maskHeaders(finalized.headers),
        query: maskQuery(finalized.query),
      };
    }
    ok(res, { payload, errors, request, format: spec ? { key: spec.key, label: spec.label, kind: spec.kind } : null });
  }));

  /** 调试：真实调用一次（可指定模型与上下文） */
  router.post('/api/interface-configs/debug', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const model = body.model_id
      ? db.get('SELECT * FROM model_config WHERE id = ?', [Number(body.model_id)])
      : null;
    if (!model) return fail(res, '请选择用于调试的模型');

    const params = resolveParamsForRequest(db, body);

    const context = body.context || {
      gb: { prompt: body.prompt || '示例提示词', model_name: model.model_name, ...(body.sample || {}) },
      stepList: [],
    };
    const formatType = body.format_type || model.format_type || null;
    const { payload, errors } = await buildRequest(params, body.overrides || null, context, {
      storageConfig: storageOf(db),
    });
    const result = await callInterface(model, payload, {
      inputImage: body.input_image || null,
      formatType,
      storageConfig: storageOf(db),
    });
    ok(res, {
      errors,
      payload,
      success: result.success,
      message: result.message,
      response: result.response,
      raw_text: (result.raw_text || '').slice(0, 4000),
      images: result.images || [],
      elapsed: result.elapsed,
    });
  }));

  return router;
}
