/** 组件管理：内置组件（代码级）+ 自定义组件（配置级 render_spec） */
import express from 'express';
import { now } from '../db/index.js';
import { BUILTIN_COMPONENTS, BUILTIN_BY_KEY, COMPONENT_GROUPS, defaultProps } from '../core/componentRegistry.js';
import { ok, fail, wrap, json } from './helpers.js';

function userRowToDto(row) {
  if (!row) return null;
  return {
    ...row,
    source: row.source || 'user',
    props_schema: json.parse(row.props_schema, []),
    render_spec: json.parse(row.render_spec, null),
    is_active: Boolean(row.is_active),
  };
}

export default function componentsRouter() {
  const router = express.Router();

  const builtinAsDto = () =>
    BUILTIN_COMPONENTS.map((c) => ({
      key: c.key,
      name: c.name,
      group_name: c.group,
      icon: c.icon,
      description: c.description,
      source: 'builtin',
      builtin_key: c.key,
      runtime: c.runtime,
      props_schema: c.props,
      render_spec: null,
      is_active: true,
    }));

  router.get('/api/components/registry', wrap((req, res) => {
    ok(res, {
      groups: COMPONENT_GROUPS,
      components: builtinAsDto(),
    });
  }));

  router.get('/api/components', wrap((req, res) => {
    const db = req.app.locals.db;
    const users = db.all('SELECT * FROM component ORDER BY id ASC').map(userRowToDto);
    const list = [...builtinAsDto(), ...users];
    const keyword = String(req.query.keyword || '').trim().toLowerCase();
    const group = String(req.query.group || '').trim();
    let filtered = list;
    if (keyword) {
      filtered = filtered.filter(
        (c) => c.name.toLowerCase().includes(keyword) || c.key.toLowerCase().includes(keyword),
      );
    }
    if (group) filtered = filtered.filter((c) => c.group_name === group);
    ok(res, { groups: COMPONENT_GROUPS, components: filtered });
  }));

  router.get('/api/components/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const row = db.get('SELECT * FROM component WHERE id = ?', [id]);
    if (row) return ok(res, userRowToDto(row));
    const builtin = BUILTIN_BY_KEY[req.params.id];
    if (builtin) return ok(res, builtinAsDto().find((c) => c.key === builtin.key));
    return fail(res, '组件不存在', -1, 404);
  }));

  router.post('/api/components', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    const key = String(body.key || '').trim();
    if (!key) return fail(res, '组件标识必填');
    if (!/^[a-z][a-z0-9-]*$/.test(key)) return fail(res, '组件标识只能包含小写字母、数字与中划线');
    if (BUILTIN_BY_KEY[key]) return fail(res, `组件标识与内置组件冲突: ${key}`);
    const dup = db.get('SELECT id FROM component WHERE key = ?', [key]);
    if (dup) return fail(res, `组件标识已存在: ${key}`);
    const ts = now();
    const { lastId } = db.run(
      `INSERT INTO component (key, name, group_name, icon, description, source, builtin_key, props_schema, render_spec, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'user', NULL, ?, ?, ?, ?, ?)`,
      [
        key,
        body.name || key,
        body.group_name || '自定义',
        body.icon || 'el-icon-s-operation',
        body.description || '',
        JSON.stringify(json.parse(body.props_schema, [])),
        JSON.stringify(body.render_spec || null),
        body.is_active === false ? 0 : 1,
        ts,
        ts,
      ],
    );
    ok(res, userRowToDto(db.get('SELECT * FROM component WHERE id = ?', [lastId])));
  }));

  router.put('/api/components/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM component WHERE id = ?', [id]);
    if (!exists) return fail(res, '自定义组件不存在', -1, 404);
    const body = req.body || {};
    const sets = [];
    const args = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      args.push(body.name);
    }
    if (body.group_name !== undefined) {
      sets.push('group_name = ?');
      args.push(body.group_name);
    }
    if (body.icon !== undefined) {
      sets.push('icon = ?');
      args.push(body.icon);
    }
    if (body.description !== undefined) {
      sets.push('description = ?');
      args.push(body.description);
    }
    if (body.props_schema !== undefined) {
      sets.push('props_schema = ?');
      args.push(JSON.stringify(json.parse(body.props_schema, [])));
    }
    if (body.render_spec !== undefined) {
      sets.push('render_spec = ?');
      args.push(JSON.stringify(body.render_spec));
    }
    if (body.is_active !== undefined) {
      sets.push('is_active = ?');
      args.push(body.is_active ? 1 : 0);
    }
    if (!sets.length) return ok(res, userRowToDto(exists));
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE component SET ${sets.join(', ')} WHERE id = ?`, args);
    ok(res, userRowToDto(db.get('SELECT * FROM component WHERE id = ?', [id])));
  }));

  router.delete('/api/components/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    db.run('DELETE FROM component WHERE id = ?', [Number(req.params.id)]);
    ok(res, { deleted: true });
  }));

  /** 生成组件默认 props（页面搭建器「新增实例」用） */
  router.get('/api/components/:key/default-props', wrap((req, res) => {
    const db = req.app.locals.db;
    const builtin = BUILTIN_BY_KEY[req.params.key];
    if (builtin) return ok(res, defaultProps(builtin));
    const row = db.get('SELECT * FROM component WHERE key = ?', [req.params.key]);
    if (!row) return fail(res, '组件不存在', -1, 404);
    const dto = userRowToDto(row);
    const props = {};
    for (const p of dto.props_schema || []) props[p.name] = p.default ?? '';
    ok(res, props);
  }));

  return router;
}
