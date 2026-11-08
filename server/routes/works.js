/** 作品管理：作品 CRUD + 按工作流一步步流转 + 页面上下文 / 执行 / 预览 */
import express from 'express';
import { now } from '../db/index.js';
import {
  normalizeWorkflowSteps, ensureWorkSteps, buildStepContext, previewStep, runStep,
  resetFrom, workProgress, getPage,
} from '../core/workflowEngine.js';
import { buildPageContext, resolveComponentProps, normalizeContextConfig, DEFAULT_CONTEXT_CONFIG } from '../core/pageContext.js';
import { BUILTIN_BY_KEY } from '../core/componentRegistry.js';
import { ok, fail, wrap, paged, parsePaging, like, json } from './helpers.js';

function storageOf(db) {
  const row = db.get('SELECT value FROM app_setting WHERE key = ?', ['storage']);
  return row ? json.parse(row.value, null) : null;
}

function workDto(row) {
  if (!row) return null;
  return {
    ...row,
    params: json.parse(row.params, {}),
  };
}

function stepDto(step, index, workStep) {
  return {
    ...step,
    index,
    order: index + 1,
    status: workStep?.status || 'pending',
    message: workStep?.message || '',
    output: workStep?.output || '',
    images: json.parse(workStep?.images, []),
    req_data: json.parse(workStep?.req_data, null),
    rsp_data: json.parse(workStep?.rsp_data, null),
    inputs: json.parse(workStep?.inputs, {}),
    raw_rsp: (workStep?.raw_rsp || '').slice(0, 20000),
    started_at: workStep?.started_at || null,
    finished_at: workStep?.finished_at || null,
  };
}

function loadWorkContext(db, workId) {
  const work = db.get('SELECT * FROM work WHERE id = ?', [Number(workId)]);
  if (!work) return {};
  const workflow = work.workflow_id
    ? db.get('SELECT * FROM workflow WHERE id = ?', [work.workflow_id])
    : null;
  return { work, workflow };
}

export default function worksRouter() {
  const router = express.Router();

  /* ---------------- 作品 CRUD ---------------- */

  router.get('/api/works', wrap((req, res) => {
    const db = req.app.locals.db;
    const { page, pageSize, offset } = parsePaging(req);
    const where = [];
    const args = [];
    if (req.query.name) {
      where.push('name LIKE ? ESCAPE "\\"');
      args.push(like(req.query.name));
    }
    for (const f of ['type', 'status']) {
      if (req.query[f]) {
        where.push(`${f} = ?`);
        args.push(req.query[f]);
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS c FROM work ${clause}`, args).c;
    const rows = db.all(`SELECT * FROM work ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
    const workflows = Object.fromEntries(db.all('SELECT id, name FROM workflow').map((w) => [w.id, w.name]));
    paged(res, {
      rows: rows.map((r) => ({ ...workDto(r), workflow_name: workflows[r.workflow_id] || '' })),
      total,
      page,
      pageSize,
    });
  }));

  router.get('/api/works/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const { work } = loadWorkContext(db, req.params.id);
    if (!work) return fail(res, '作品不存在', -1, 404);
    ok(res, workDto(work));
  }));

  router.post('/api/works', wrap((req, res) => {
    const db = req.app.locals.db;
    const body = req.body || {};
    if (!body.name) return fail(res, '作品名称必填');
    const ts = now();
    const { lastId } = db.run(
      `INSERT INTO work (name, type, workflow_id, status, params, content, source_url, keywords, remark, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.type || 'comic',
        body.workflow_id || null,
        JSON.stringify(json.parse(body.params, {})),
        body.content || '',
        body.source_url || '',
        body.keywords || '',
        body.remark || '',
        ts,
        ts,
      ],
    );
    const work = db.get('SELECT * FROM work WHERE id = ?', [lastId]);
    if (work.workflow_id) {
      const workflow = db.get('SELECT * FROM workflow WHERE id = ?', [work.workflow_id]);
      if (workflow) ensureWorkSteps(db, work, workflow);
    }
    ok(res, workDto(db.get('SELECT * FROM work WHERE id = ?', [lastId])));
  }));

  router.put('/api/works/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const exists = db.get('SELECT * FROM work WHERE id = ?', [id]);
    if (!exists) return fail(res, '作品不存在', -1, 404);
    const body = req.body || {};
    const sets = [];
    const args = [];
    for (const f of ['name', 'type', 'status', 'content', 'source_url', 'keywords', 'remark']) {
      if (body[f] === undefined) continue;
      sets.push(`${f} = ?`);
      args.push(body[f]);
    }
    if (body.workflow_id !== undefined) {
      sets.push('workflow_id = ?');
      args.push(body.workflow_id || null);
    }
    if (body.params !== undefined) {
      sets.push('params = ?');
      args.push(JSON.stringify(json.parse(body.params, {})));
    }
    if (!sets.length) return ok(res, workDto(exists));
    sets.push('updated_at = ?');
    args.push(now(), id);
    db.run(`UPDATE work SET ${sets.join(', ')} WHERE id = ?`, args);
    const work = db.get('SELECT * FROM work WHERE id = ?', [id]);
    if (work.workflow_id) {
      const workflow = db.get('SELECT * FROM workflow WHERE id = ?', [work.workflow_id]);
      if (workflow) ensureWorkSteps(db, work, workflow);
    }
    ok(res, workDto(work));
  }));

  router.delete('/api/works/:id', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    db.run('DELETE FROM work_step WHERE work_id = ?', [id]);
    db.run('DELETE FROM work_artifact WHERE work_id = ?', [id]);
    db.run('DELETE FROM work WHERE id = ?', [id]);
    ok(res, { deleted: true });
  }));

  /* ---------------- 详情 / 步骤 ---------------- */

  router.get('/api/works/:id/detail', wrap((req, res) => {
    const db = req.app.locals.db;
    const { work, workflow } = loadWorkContext(db, req.params.id);
    if (!work) return fail(res, '作品不存在', -1, 404);
    if (!workflow) {
      return ok(res, { work: workDto(work), workflow: null, steps: [], current: 0, running: false, pages: {} });
    }
    ensureWorkSteps(db, work, workflow);
    const steps = normalizeWorkflowSteps(workflow);
    const workSteps = db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [work.id]);
    const byOrder = new Map(workSteps.map((r) => [r.step_order, r]));
    const pages = {};
    for (const s of steps) {
      if (s.page_id && !pages[s.page_id]) {
        const p = getPage(db, s.page_id);
        if (p) {
          pages[s.page_id] = {
            id: p.id,
            name: p.name,
            layout: json.parse(p.layout, []),
            context_config: normalizeContextConfig(json.parse(p.context_config, DEFAULT_CONTEXT_CONFIG)),
          };
        }
      }
    }
    const merged = steps.map((s, i) => stepDto(s, i, byOrder.get(i + 1)));
    const progress = workProgress(workSteps);
    ok(res, {
      work: workDto(work),
      workflow: { id: workflow.id, name: workflow.name, type: workflow.type },
      steps: merged,
      pages,
      current: progress.current,
      running: progress.running,
    });
  }));

  router.get('/api/works/:id/status', wrap((req, res) => {
    const db = req.app.locals.db;
    const { work } = loadWorkContext(db, req.params.id);
    if (!work) return fail(res, '作品不存在', -1, 404);
    const rows = db.all(
      'SELECT step_order, status, message FROM work_step WHERE work_id = ? ORDER BY step_order ASC',
      [work.id],
    );
    const running = rows.some((r) => r.status === 'running');
    ok(res, { work_status: work.status, running, steps: rows });
  }));

  /** 页面运行时：返回页面定义 + 上下文 + 解析后的组件 props */
  router.get('/api/works/:id/page', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const { work, workflow } = loadWorkContext(db, req.params.id);
    if (!work) return fail(res, '作品不存在', -1, 404);
    if (!workflow) return fail(res, '作品未绑定工作流');
    const steps = normalizeWorkflowSteps(workflow);
    const index = Math.min(Math.max(0, Number(req.query.step || 0)), Math.max(0, steps.length - 1));
    const step = steps[index];
    const page = step ? getPage(db, step.page_id) : null;
    if (!page) return fail(res, '该步骤未绑定页面');

    const workSteps = db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [work.id]);
    const workStep = workSteps.find((r) => r.step_order === index + 1);
    const { ctx } = await buildStepContext(db, { work, workflow, stepIndex: index, inputs: {} });

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

    const progress = workProgress(workSteps);
    ok(res, {
      work: workDto(work),
      workflow: { id: workflow.id, name: workflow.name, type: workflow.type },
      step: stepDto(step, index, workStep),
      steps: steps.map((s, i) => ({ index: i, order: i + 1, name: s.name, status: workSteps.find((r) => r.step_order === i + 1)?.status || 'pending' })),
      page: {
        id: page.id,
        name: page.name,
        layout,
        context_config: normalizeContextConfig(json.parse(page.context_config, DEFAULT_CONTEXT_CONFIG)),
      },
      resolved,
      context: ctx,
      current: progress.current,
      running: progress.running,
    });
  }));

  /* ---------------- 执行 ---------------- */

  router.post('/api/works/:id/steps/:order/preview', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const { work, workflow } = loadWorkContext(db, req.params.id);
    if (!work || !workflow) return fail(res, '作品或工作流不存在', -1, 404);
    const index = Number(req.params.order) - 1;
    const result = await previewStep(db, {
      work, workflow, stepIndex: index,
      inputs: req.body?.inputs || {},
      storageConfig: storageOf(db),
    });
    if (result.error) return fail(res, result.error);
    ok(res, result);
  }));

  router.post('/api/works/:id/steps/:order/run', wrap(async (req, res) => {
    const db = req.app.locals.db;
    const { work, workflow } = loadWorkContext(db, req.params.id);
    if (!work || !workflow) return fail(res, '作品或工作流不存在', -1, 404);
    const index = Number(req.params.order) - 1;
    const steps = normalizeWorkflowSteps(workflow);
    if (index < 0 || index >= steps.length) return fail(res, '步骤不存在');

    // 前置校验：前面所有步骤必须 success
    const workSteps = db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [work.id]);
    const blocked = workSteps.find((r) => r.step_order < index + 1 && r.status !== 'success');
    if (blocked) return fail(res, `第 ${blocked.step_order} 步尚未执行成功，请先执行前置步骤`);

    const result = await runStep(db, {
      work, workflow, stepIndex: index,
      inputs: req.body?.inputs || {},
      storageConfig: storageOf(db),
    });
    ok(res, result);
  }));

  router.post('/api/works/:id/steps/:order/reset', wrap((req, res) => {
    const db = req.app.locals.db;
    const order = Number(req.params.order);
    if (!order || order < 1) return fail(res, '步骤序号不合法');
    const rows = resetFrom(db, Number(req.params.id), order);
    ok(res, rows);
  }));

  /** 保存步骤提示词：scope=workflow（默认，改工作流）或 work（仅本作品） */
  router.put('/api/works/:id/steps/:order/prompt', wrap((req, res) => {
    const db = req.app.locals.db;
    const { work, workflow } = loadWorkContext(db, req.params.id);
    if (!work || !workflow) return fail(res, '作品或工作流不存在', -1, 404);
    const order = Number(req.params.order);
    const prompt = String(req.body?.prompt ?? '');
    const scope = req.body?.scope || 'workflow';

    if (scope === 'work') {
      const row = db.get('SELECT * FROM work_step WHERE work_id = ? AND step_order = ?', [work.id, order]);
      if (!row) return fail(res, '步骤记录不存在', -1, 404);
      const inputs = json.parse(row.inputs, {});
      inputs.prompt = prompt;
      db.run('UPDATE work_step SET inputs = ?, updated_at = ? WHERE id = ?', [JSON.stringify(inputs), now(), row.id]);
      return ok(res, { prompt, scope });
    }

    const steps = normalizeWorkflowSteps(workflow);
    const idx = order - 1;
    if (!steps[idx]) return fail(res, '步骤不存在', -1, 404);
    steps[idx].prompt = prompt;
    db.run('UPDATE workflow SET steps = ?, updated_at = ? WHERE id = ?', [JSON.stringify(steps), now(), workflow.id]);
    ok(res, { prompt, scope });
  }));

  /** 作品参数（供提示词解析的上送参数） */
  router.put('/api/works/:id/params', wrap((req, res) => {
    const db = req.app.locals.db;
    const id = Number(req.params.id);
    const params = json.parse(req.body?.params, {});
    db.run('UPDATE work SET params = ?, updated_at = ? WHERE id = ?', [JSON.stringify(params), now(), id]);
    ok(res, params);
  }));

  return router;
}
