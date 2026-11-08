/**
 * 页面上下文构建
 *
 * 页面加载时由后端统一产出「全局上下文」给前端，结构对齐旧项目的解析规则：
 *   {
 *     gb: { ...作品字段、资产、params、当前迭代项 item、prompt、model_name、page ... },
 *     stepList: [ {step_id, step_order, name, req, rsp} , ... ],
 *     resp: { ... }   // 仅接口输出提取时存在
 *   }
 *
 * context_config（页面级配置）：
 * {
 *   "providers": [
 *     {"id":"work","type":"builtin","kind":"work"},
 *     {"id":"assets","type":"builtin","kind":"assets"},
 *     {"id":"steps","type":"builtin","kind":"stepList"},
 *     {"id":"params","type":"builtin","kind":"params"},
 *     {"id":"api","type":"http","request":{"method":"GET","url":"...","headers":{},"body":{}},
 *      "extract":{"data":"${resp.data}"}}
 *   ],
 *   "variableMapping": {"content":"作品内容"}
 * }
 */
import { resolveValue, renderDeep, getByPath, MISSING } from './resolver.js';
import { parseJson } from '../db/index.js';

const WORK_FIELD_MAP = {
  作品名称: 'name',
  作品内容: 'content',
  原文链接: 'source_url',
  关键词: 'keywords',
  作品类型: 'type',
  备注: 'remark',
  name: 'name',
  content: 'content',
  source_url: 'source_url',
  keywords: 'keywords',
  type: 'type',
  remark: 'remark',
};

export const DEFAULT_CONTEXT_CONFIG = {
  providers: [
    { id: 'work', type: 'builtin', kind: 'work', enabled: true },
    { id: 'assets', type: 'builtin', kind: 'assets', enabled: true },
    { id: 'params', type: 'builtin', kind: 'params', enabled: true },
    { id: 'steps', type: 'builtin', kind: 'stepList', enabled: true },
  ],
  variableMapping: {},
};

export function normalizeContextConfig(config) {
  const cfg = { ...DEFAULT_CONTEXT_CONFIG, ...(config || {}) };
  if (!Array.isArray(cfg.providers) || !cfg.providers.length) cfg.providers = DEFAULT_CONTEXT_CONFIG.providers;
  if (!cfg.variableMapping || typeof cfg.variableMapping !== 'object') cfg.variableMapping = {};
  return cfg;
}

function parseStepResultRow(row) {
  return {
    step_id: row.page_id || row.id,
    work_step_id: row.id,
    step_order: row.step_order,
    name: row.name,
    req: parseJson(row.req_data, {}),
    rsp: parseJson(row.rsp_data, {}),
  };
}

/**
 * 构建页面上下文。
 * @param {object} params
 * @param {object} params.db         数据库实例
 * @param {object} params.work       作品行
 * @param {object} params.workflow   工作流行
 * @param {object} params.page       页面行（可为 null，纯后端执行时）
 * @param {number} params.stepOrder  当前步骤序（stepList 只收集 < stepOrder 的成功步骤）
 * @param {object} params.extra      { prompt, modelName, item, workflowParams }
 * @param {object} params.contextConfig 页面 context_config（缺省取 page.context_config）
 */
export async function buildPageContext({
  db, work, workflow, page, stepOrder = 1, extra = {},
}) {
  const ctxCfg = normalizeContextConfig(
    page ? parseJson(page.context_config, DEFAULT_CONTEXT_CONFIG) : DEFAULT_CONTEXT_CONFIG,
  );

  const gb = {
    work_id: work?.id ?? null,
    name: work?.name ?? '',
    type: work?.type ?? '',
    content: work?.content ?? '',
    source_url: work?.source_url ?? '',
    keywords: work?.keywords ?? '',
    remark: work?.remark ?? '',
    status: work?.status ?? '',
    prompt: extra.prompt ?? '',
    model_name: extra.modelName ?? '',
    item: extra.item ?? null,
    page: page ? { id: page.id, name: page.name } : null,
    workflow: workflow ? { id: workflow.id, name: workflow.name, type: workflow.type } : null,
    now: new Date().toISOString(),
  };

  // 作品 params 展开到 gb
  const workParams = parseJson(work?.params, {});
  if (workParams && typeof workParams === 'object' && !Array.isArray(workParams)) {
    for (const [k, v] of Object.entries(workParams)) gb[k] = v;
  }
  // 工作流级 params（入口参数默认值）
  if (extra.workflowParams && typeof extra.workflowParams === 'object') {
    for (const [k, v] of Object.entries(extra.workflowParams)) {
      if (gb[k] === undefined) gb[k] = v;
    }
  }

  let stepList = [];

  for (const provider of ctxCfg.providers) {
    if (provider.enabled === false) continue;
    const id = provider.id || provider.kind || provider.type;

    if (provider.type === 'builtin') {
      switch (provider.kind) {
        case 'work': {
          gb.work = { ...work };
          break;
        }
        case 'assets': {
          const rows = db.all('SELECT key, value FROM asset ORDER BY id ASC');
          const assets = {};
          for (const row of rows) {
            assets[row.key] = row.value;
            if (gb[row.key] === undefined) gb[row.key] = row.value;
          }
          gb.assets = assets;
          break;
        }
        case 'params': {
          gb.params = workParams && typeof workParams === 'object' ? { ...workParams } : {};
          break;
        }
        case 'stepList': {
          const rows = db
            .all(
              `SELECT * FROM work_step WHERE work_id = ? AND step_order < ? AND status = 'success' ORDER BY step_order ASC`,
              [work?.id ?? -1, stepOrder],
            );
          stepList = rows.map(parseStepResultRow);
          break;
        }
        case 'artifacts': {
          const rows = db
            .all('SELECT * FROM work_artifact WHERE work_id = ? ORDER BY id ASC', [work?.id ?? -1]);
          gb.artifacts = rows.map((r) => ({ ...r, meta: parseJson(r.meta, {}) }));
          break;
        }
        default:
          break;
      }
      continue;
    }

    if (provider.type === 'http') {
      const req = provider.request || {};
      const localCtx = { gb: { ...gb }, stepList };
      const urlTemplate = req.url || '';
      const url = String(resolveValue(localCtx, urlTemplate, null) || '');
      const method = String(req.method || 'GET').toUpperCase();
      const headers = renderDeep(localCtx, req.headers || {});
      const query = renderDeep(localCtx, req.query || {});
      let body = null;

      try {
        const u = new URL(url);
        for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
        if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
          body = renderDeep(localCtx, req.body);
        }
        const resp = await fetch(u.toString(), {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body !== null ? JSON.stringify(body) : undefined,
        });
        const text = await resp.text();
        let respJson = null;
        try {
          respJson = JSON.parse(text);
        } catch (e) {
          respJson = { __text: text };
        }
        const extractCtx = { ...localCtx, resp: respJson };
        const extracted = {};
        for (const [key, expr] of Object.entries(provider.extract || {})) {
          extracted[key] = resolveValue(extractCtx, expr, null);
        }
        gb[id] = Object.keys(extracted).length ? extracted : respJson;
      } catch (e) {
        gb[id] = { __error: e.message };
        gb.__contextErrors = gb.__contextErrors || [];
        gb.__contextErrors.push({ provider: id, error: e.message });
      }
      continue;
    }
  }

  // variable_mapping 别名（如 {"content":"作品内容"}）
  const mapping = ctxCfg.variableMapping || {};
  for (const [alias, fieldCn] of Object.entries(mapping)) {
    const attr = WORK_FIELD_MAP[fieldCn] || fieldCn;
    if (work && work[attr] !== undefined) gb[alias] = work[attr];
  }

  // 兼容旧项目的根级平铺变量
  Object.assign(gb, buildLegacyVars({ work, stepList, stepOrder, gb }));

  return { gb, stepList, contextConfig: ctxCfg };
}

/** 旧版根级变量（prev_output / step_N_output / step_N_image ...），保证旧提示词可直接迁移 */
function buildLegacyVars({ work, stepList, stepOrder, gb }) {
  const vars = {};
  const last = stepList[stepList.length - 1];
  if (last) {
    const rsp = last.rsp || {};
    vars.prev_output = rsp.content ?? rsp.text ?? rsp.output_text ?? '';
    const imgs = collectImages(rsp);
    vars.prev_image = imgs[0] || '';
  }
  vars.work_id = work?.id ?? null;
  vars.work_name = work?.name ?? '';
  vars.step_index = stepOrder;
  vars.step_name = gb?.page?.name || '';

  for (const item of stepList) {
    const n = item.step_order;
    const rsp = item.rsp || {};
    const text = rsp.content ?? rsp.text ?? rsp.output_text ?? '';
    const images = collectImages(rsp);
    vars[`step_${n}_output`] = text;
    vars[`step_${n}_image`] = images[0] || '';
    vars[`step_${n}_images`] = images.join('\n');
    vars[`step_${n}_images_json`] = JSON.stringify(images);
    vars[`step_${n}_all`] = [typeof text === 'string' ? text : JSON.stringify(text), ...images].join('\n');
  }
  return vars;
}

function collectImages(rsp) {
  const out = [];
  const push = (v) => {
    if (typeof v === 'string' && v) out.push(v);
  };
  if (Array.isArray(rsp.images)) rsp.images.forEach(push);
  if (Array.isArray(rsp.items)) {
    for (const it of rsp.items) {
      if (it && typeof it === 'object') {
        push(it.image);
        push(it.image_url);
      }
    }
  }
  if (typeof rsp.image === 'string') push(rsp.image);
  return [...new Set(out)];
}

/** 预览：返回页面上下文与每个组件解析后的 props（页面设计器/调试用） */
export function resolveComponentProps(ctx, props, propsSchema) {
  const out = {};
  const schemaMap = new Map((propsSchema || []).map((p) => [p.name, p]));
  for (const [key, value] of Object.entries(props || {})) {
    const meta = schemaMap.get(key);
    const asExpr = !meta || meta.expr !== false;
    if (asExpr && typeof value === 'string') out[key] = resolveValue(ctx, value, meta?.type || null);
    else if (asExpr && (Array.isArray(value) || (value && typeof value === 'object'))) out[key] = renderDeep(ctx, value);
    else out[key] = value;
  }
  return out;
}

export { getByPath, MISSING };
