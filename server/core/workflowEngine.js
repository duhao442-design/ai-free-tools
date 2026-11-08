/**
 * 工作流执行引擎
 *
 * 一个「工作流」= 有序的页面列表（steps）。每个 step 绑定一个页面（展示）+ 一个模型/接口（执行）。
 * 作品按工作流一步步流转：每步执行成功后写入 work_step，后续步骤通过 stepList 读取产物。
 *
 * 页面之间不共享前端传参：每一步的上下文都由后端按 work + 已有 work_step 重建。
 */
import { parseJson, now } from '../db/index.js';
import { buildPageContext } from './pageContext.js';
import { renderText, resolveValue } from './resolver.js';
import { buildRequest, callInterface, extractOutputs, pickPrimaryText } from './interfaceRunner.js';

export const STEP_INPUT_TYPES = ['none', 'list', 'image', 'composite'];
export const STEP_OUTPUT_TYPES = ['none', 'list', 'image', 'composite'];

export function normalizeWorkflowSteps(workflow) {
  const steps = parseJson(workflow?.steps, []);
  if (!Array.isArray(steps)) return [];
  return steps.map((s, i) => {
    const settings = { ...(s.settings || {}) };
    if (!Array.isArray(settings.columns)) settings.columns = [];
    return {
      id: s.id || `step-${i + 1}`,
      name: s.name || `步骤 ${i + 1}`,
      page_id: s.page_id ?? null,
      model_id: s.model_id ?? null,
      interface_id: s.interface_id ?? null,
      prompt: s.prompt || '',
      input_type: STEP_INPUT_TYPES.includes(s.input_type) ? s.input_type : 'none',
      output_type: STEP_OUTPUT_TYPES.includes(s.output_type) ? s.output_type : 'none',
      input_value: s.input_value || '',
      output_value: s.output_value || '',
      model_input_value: s.model_input_value ?? null,
      model_output_value: s.model_output_value ?? null,
      skill_ids: s.skill_ids || [],
      settings,
      enabled: s.enabled !== false,
    };
  });
}

/** 同步 work_step 记录（新增步骤补行，减少步骤删行） */
export function ensureWorkSteps(db, work, workflow) {
  const steps = normalizeWorkflowSteps(workflow);
  const existing = db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [work.id]);
  const byOrder = new Map(existing.map((r) => [r.step_order, r]));
  const ts = now();

  for (let i = 0; i < steps.length; i += 1) {
    const order = i + 1;
    const step = steps[i];
    if (!byOrder.has(order)) {
      db.run(
        `INSERT INTO work_step (work_id, step_order, page_id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        [work.id, order, step.page_id, step.name, ts, ts],
      );
    } else {
      const row = byOrder.get(order);
      if (row.page_id !== step.page_id || row.name !== step.name) {
        db.run('UPDATE work_step SET page_id = ?, name = ?, updated_at = ? WHERE id = ?', [
          step.page_id, step.name, ts, row.id,
        ]);
      }
    }
  }
  for (const row of existing) {
    if (row.step_order > steps.length) db.run('DELETE FROM work_step WHERE id = ?', [row.id]);
  }
  return db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [work.id]);
}

export function getModel(db, modelId) {
  if (!modelId) return null;
  return db.get('SELECT * FROM model_config WHERE id = ?', [modelId]) || null;
}

export function getInterface(db, interfaceId) {
  if (!interfaceId) return null;
  return db.get('SELECT * FROM interface_config WHERE id = ?', [interfaceId]) || null;
}

export function getPage(db, pageId) {
  if (!pageId) return null;
  return db.get('SELECT * FROM page WHERE id = ?', [pageId]) || null;
}

/**
 * 合并「页面执行配置」与「工作流步骤」：
 * 页面里配了 execution 就以页面为准（模型/接口/提示词/输入输出/试跑参数都属于页面），
 * 步骤字段只作为老数据（页面还没有 execution）的兜底。
 */
export function mergeExecution(step, page) {
  if (!step) return step;
  const exec = page && page.execution && typeof page.execution === 'object' ? page.execution : null;
  if (!exec) return step;
  const merged = { ...step };
  for (const key of [
    'model_id', 'interface_id', 'input_type', 'output_type', 'input_value',
    'prompt', 'model_input_value', 'model_output_value',
  ]) {
    if (key in exec) merged[key] = exec[key];
  }
  if (exec.settings && typeof exec.settings === 'object') {
    merged.settings = { ...(step.settings || {}), ...exec.settings };
  }
  return merged;
}

/**
 * 构建某一步的执行上下文（也用于页面加载时下发的全局上下文）
 */
export async function buildStepContext(db, { work, workflow, stepIndex, inputs = {} }) {
  const steps = normalizeWorkflowSteps(workflow);
  const index = clampIndex(stepIndex, steps.length);
  const rawStep = steps[index];
  const pageRow = rawStep ? getPage(db, rawStep.page_id) : null;
  const page = pageRow ? { ...pageRow, execution: parseJson(pageRow.execution, null) } : null;
  const step = mergeExecution(rawStep, page);
  const model = step ? getModel(db, step.model_id) : null;

  const baseCtx = await buildPageContext({
    db,
    work,
    workflow,
    page,
    stepOrder: index + 1,
    extra: {
      prompt: inputs.prompt !== undefined ? inputs.prompt : step?.prompt || '',
      modelName: model?.model_name || '',
      workflowParams: parseJson(workflow?.variable_mapping, {}),
    },
  });
  // 当前步骤的模型信息（供 ${gb.model_id} / ${gb.model_name} 使用）
  baseCtx.gb.model_id = step?.model_id ?? null;
  baseCtx.gb.model_name = model?.model_name || '';
  baseCtx.gb.interface_id = step?.interface_id ?? null;
  baseCtx.gb.step_index = index + 1;
  baseCtx.gb.step_name = step?.name || '';
  baseCtx.gb.step = step || null;
  return { ctx: baseCtx, step, page, model, steps, index };
}

function clampIndex(index, len) {
  const n = Number(index);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.max(0, Math.trunc(n)), Math.max(0, len - 1));
}

/** 扫描文本里所有「括号配对」的 JSON 数组片段（跳过字符串内的括号） */
function findJsonArraySlices(text) {
  const slices = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === ']') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          slices.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return slices;
}

export function extractJsonList(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  const tryParse = (raw) => {
    try {
      return normalizeJsonList(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct && direct.length) return direct;

  // 代码块（可能多个，取能解析出对象的最后一个）
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim());
  for (let i = fenced.length - 1; i >= 0; i -= 1) {
    const parsed = tryParse(fenced[i]);
    if (parsed && parsed.length) return parsed;
  }

  // 从后往前找可解析的数组：正式答案通常在最后，避免命中思维链里的片段
  const slices = findJsonArraySlices(trimmed);
  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const parsed = tryParse(slices[i]);
    if (parsed && parsed.length) return parsed;
  }

  // 兜底：首 [ 到末 ] 再试一次（容忍前后有少量说明文字）
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const parsed = tryParse(trimmed.slice(start, end + 1));
    if (parsed && parsed.length) return parsed;
  }
  return [];
}

function normalizeJsonList(parsed) {
  if (Array.isArray(parsed)) return parsed.filter((it) => it && typeof it === 'object');
  if (parsed && typeof parsed === 'object') {
    for (const key of ['items', 'list', 'data', 'scenes', 'characters']) {
      if (Array.isArray(parsed[key])) return parsed[key].filter((it) => it && typeof it === 'object');
    }
  }
  return [];
}

/* ---------------- 逐行参考图（图生图） ---------------- */

/** 把 role / roles / 涉及角色 规范成名字数组 */
export function normalizeRoleNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : v && (v.name || v.role || v.title || '')))
      .filter(Boolean);
  }
  if (typeof value === 'object') return [value.name || value.role || value.title].filter(Boolean);
  return String(value)
    .split(/[,，、;；|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickRefImage(item) {
  if (!item || typeof item !== 'object') return null;
  return item.image_url || item.image || item.imageUrl || item.url || null;
}

/**
 * 计算某一行输入对应的「参考图 + 命中的角色记录」（用于图生图 / 角色一致性）。
 *
 * settings.image_ref_image：
 *   - 字符串表达式：逐行解析出图片（如 ${item.cover}）
 * settings.image_ref：
 *   - { from: '${stepList[1].rsp.items}', matchField: 'role', nameField: 'name' }
 *     用当前行的角色名（可多个）去匹配来源列表，返回所有命中的角色与其图片。
 */
export function resolveRowReferences(step, rowCtx, row) {
  const settings = step?.settings || {};
  const images = [];
  const characters = [];

  const simple = settings.image_ref_image;
  if (typeof simple === 'string' && simple.trim()) {
    const value = resolveValue(rowCtx, simple, null);
    if (value) images.push(value);
  }

  const refCfg = settings.image_ref;
  if (refCfg && typeof refCfg === 'object' && refCfg.from) {
    const refs = resolveValue(rowCtx, refCfg.from, null);
    const list = Array.isArray(refs) ? refs : [];
    const matchField = refCfg.matchField || 'role';
    const nameField = refCfg.nameField || 'name';
    const names = normalizeRoleNames(row ? row[matchField] ?? row.roles ?? row['涉及角色'] : null);
    const seen = new Set();
    for (const name of names) {
      const hit = list.find((it) => {
        const n = String((it && (it[nameField] || it.name || it.title)) || '');
        if (!n) return false;
        return n === name || n.includes(name) || name.includes(n);
      });
      if (!hit) continue;
      const key = String((hit && (hit[nameField] || hit.name)) || name);
      if (seen.has(key)) continue;
      seen.add(key);
      characters.push(hit);
      const img = pickRefImage(hit);
      if (img && !images.includes(img)) images.push(img);
    }
  }

  return { images, characters };
}

/** 兼容旧调用：只要第一张参考图 */
export function resolveRowReference(step, rowCtx, row) {
  const { images } = resolveRowReferences(step, rowCtx, row);
  return images[0] || null;
}

/** 把命中的角色信息补进输入行，供提示词 ${item.character_names} / ${item.character_descs} 使用 */
function enrichRowWithCharacters(row, refInfo, step) {
  if (!row || typeof row !== 'object') return row;
  const nameField = (step && step.settings && step.settings.image_ref && step.settings.image_ref.nameField) || 'name';
  const characters = refInfo.characters || [];

  // 分镜台词：dialogue 可能是对象或数组，拍平成提示词可直接用的文本
  const rawDialogue = row.dialogue;
  const dialogues = Array.isArray(rawDialogue) ? rawDialogue : rawDialogue ? [rawDialogue] : [];
  const dialogueTexts = dialogues.map((d) => (d && d.text ? String(d.text) : '')).filter(Boolean);
  const bubblePositions = dialogues
    .map((d) => d && (d.bubblePosition || d.bubble_position || d.position))
    .filter(Boolean);
  const dialogueTypes = dialogues.map((d) => d && d.type).filter(Boolean);

  return {
    ...row,
    characters,
    character_names: characters.map((c) => c[nameField] || c.name || '').filter(Boolean).join('、'),
    character_descs: characters
      .map((c) => c.desc || c.description || c.description_long || '')
      .filter(Boolean)
      .join('\n'),
    reference_images: refInfo.images || [],
    dialogue_text: dialogueTexts.join('\n'),
    dialogue_count: dialogues.length,
    dialogue_types: dialogueTypes.join('、'),
    bubble_positions: bubblePositions.join('、'),
  };
}

/** 试跑限制：settings.rowOffset 跳过前 N 行，settings.maxRows > 0 时只取 N 行 */
function limitRows(rows, settings) {
  const offset = Math.max(0, Number(settings?.rowOffset || 0));
  const max = Number(settings?.maxRows || 0);
  const sliced = offset > 0 ? rows.slice(offset) : rows;
  return max > 0 ? sliced.slice(0, max) : sliced;
}

/**
 * 行标识：用于「保留已有图」时把本次要处理的行和上次生成的结果对上。
 * settings.row_key 可指定字段（数组或逗号字符串），默认 name，其次 page+panel。
 */
export function rowKeyValues(step, row) {
  const cfg = step?.settings?.row_key;
  let fields = [];
  if (Array.isArray(cfg) && cfg.length) fields = cfg.filter(Boolean);
  else if (typeof cfg === 'string' && cfg.trim()) fields = cfg.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (!fields.length) {
    if (row && row.name !== undefined && row.name !== '') fields = ['name'];
    else if (row && row.page !== undefined && row.panel !== undefined) fields = ['page', 'panel'];
    else return '';
  }
  return fields.map((f) => String(row?.[f] ?? '')).join('|');
}

/** 合并图片行：本次处理的行按 key 覆盖旧行；本次没处理的行保留（避免跑 3、4 就把 1、2 弄丢） */
export function mergeImageItems(step, prevItems = [], processedItems = []) {
  const order = [];
  const map = new Map();
  const put = (it) => {
    if (!it || typeof it !== 'object') return;
    const key = rowKeyValues(step, it) || `__row_${order.length}`;
    if (!map.has(key)) order.push(key);
    map.set(key, it);
  };
  prevItems.forEach(put);
  processedItems.forEach(put);
  return order.map((k) => map.get(k)).filter(Boolean);
}

/** 从该步骤上一次的结果里收集「行标识 → 已有图片」 */
export function buildExistingImageMap(step, stepRow) {
  const map = new Map();
  const prev = parseJson(stepRow?.rsp_data, {});
  const items = Array.isArray(prev?.items) ? prev.items : [];
  for (const it of items) {
    const img = it && (it.image_url || it.image);
    if (!img) continue;
    const key = rowKeyValues(step, it);
    if (key) map.set(key, img);
  }
  return map;
}

/**
 * 预解析某一步（不调用接口）：返回每个输入行的解析后提示词与请求报文。
 * 作品详情页「解析预览」使用。
 */
export async function previewStep(db, { work, workflow, stepIndex, inputs = {}, storageConfig }) {
  const { ctx, step, model, page } = await buildStepContext(db, { work, workflow, stepIndex, inputs });
  if (!step) return { error: '步骤不存在' };

  const iface = getInterface(db, step.interface_id);
  const ifaceParams = iface?.params ? parseJson(iface.params, []) : null;

  let rows = [null];
  let explicitRows = false;
  if (Array.isArray(inputs?.rows) && inputs.rows.length) {
    rows = inputs.rows;
    explicitRows = true;
  } else if (step.input_type === 'list' && step.input_value) {
    const resolved = resolveValue(ctx, step.input_value, 'array');
    rows = Array.isArray(resolved) ? resolved : [];
  }
  if (!explicitRows) rows = limitRows(rows, step.settings);

  const items = [];
  const promptTemplate = inputs && inputs.prompt !== undefined ? String(inputs.prompt) : step.prompt || '';
  for (const row of rows) {
    const baseItem = row && typeof row === 'object' ? row : { value: row };
    const refInfo = resolveRowReferences(step, { ...ctx, gb: { ...ctx.gb, item: baseItem } }, baseItem);
    const enriched = enrichRowWithCharacters(baseItem, refInfo, step);
    const rowCtx = { ...ctx, gb: { ...ctx.gb, item: enriched, characters: refInfo.characters } };
    const promptText = renderText(rowCtx, promptTemplate);
    rowCtx.gb.prompt = promptText;
    let request = null;
    let errors = [];
    if (ifaceParams) {
      const built = await buildRequest(ifaceParams, parseJson(step.model_input_value, null), rowCtx, { storageConfig });
      request = built.payload;
      errors = built.errors;
    } else if (step.output_type === 'image' || model?.model_type === 'image') {
      request = { prompt: promptText };
    } else {
      request = { messages: [{ role: 'user', content: promptText }] };
    }
    items.push({
      row: enriched,
      prompt: promptText,
      request,
      errors,
      image_ref: refInfo.images[0] || null,
      image_refs: refInfo.images,
      characters: refInfo.characters.map((c) => c.name || c.title || ''),
    });
  }

  return {
    page: page ? { id: page.id, name: page.name } : null,
    step: { ...step },
    model: model ? { id: model.id, name: model.name, model_name: model.model_name, format_type: model.format_type } : null,
    interface: iface ? { id: iface.id, name: iface.name, format_type: iface.format_type } : null,
    context: ctx,
    items,
    columns: parseJson(page?.layout, []) && step.input_type === 'list'
      ? parseJson(step.settings?.columns, [])
      : [],
  };
}

/**
 * 执行某一步。
 * @returns {{status, message, result}}
 */
export async function runStep(db, { work, workflow, stepIndex, inputs = {}, storageConfig }) {
  const { ctx, step, model } = await buildStepContext(db, { work, workflow, stepIndex, inputs });
  if (!step) return { status: 'failed', message: '步骤不存在' };
  if (!model) return { status: 'failed', message: '步骤未绑定可用模型' };

  const iface = getInterface(db, step.interface_id);
  const ifaceParams = iface?.params ? parseJson(iface.params, []) : null;
  const stepRow = db.get('SELECT * FROM work_step WHERE work_id = ? AND step_order = ?', [work.id, stepIndex + 1]);

  if (!stepRow) return { status: 'failed', message: '步骤记录不存在' };
  if (stepRow.status === 'running') {
    return {
      status: 'failed',
      message: '本步骤正在执行中（可能是上一次还没结束），请等待完成后再操作，避免重复扣费。',
    };
  }

  // 上一次的结果（用于「保留已有图」和「合并本次未处理的行」）
  const prevRsp = parseJson(stepRow.rsp_data, {});
  const prevItems = Array.isArray(prevRsp.items) ? prevRsp.items : [];

  // 重跑某一步时，后续步骤的结果已失效，级联清空（与旧项目行为一致）
  const laterDone = db.get(
    `SELECT COUNT(*) AS c FROM work_step WHERE work_id = ? AND step_order > ? AND status <> 'pending'`,
    [work.id, stepIndex + 1],
  ).c;
  if (laterDone > 0) resetFrom(db, work.id, stepIndex + 2);

  const startedAt = now();
  db.run(
    `UPDATE work_step SET status = 'running', message = '', started_at = ?, finished_at = NULL, updated_at = ? WHERE id = ?`,
    [startedAt, startedAt, stepRow.id],
  );

  // 输入行：优先用页面里「选择列表行」组件勾选的行（只处理勾选的行）
  let rows = [null];
  let inputArray = null;
  let explicitRows = false;
  if (Array.isArray(inputs?.rows) && inputs.rows.length) {
    rows = inputs.rows.map((r) => (r && typeof r === 'object' ? r : { value: r }));
    inputArray = rows;
    explicitRows = true;
  } else if (step.input_type === 'list' && step.input_value) {
    const resolved = resolveValue(ctx, step.input_value, 'array');
    inputArray = Array.isArray(resolved) ? resolved : [];
    rows = inputArray.length ? inputArray : [null];
  }
  // 显式勾选的行不再套用「试跑行数/起始行」限制，避免选了 3 个只出 1 张
  if (!explicitRows) rows = limitRows(rows, step.settings);
  let inputImage = null;
  if (step.input_type === 'image') {
    inputImage = step.input_value ? resolveValue(ctx, step.input_value, null) : ctx.gb.prev_image || null;
  }

  // 图片步骤：已生成过的行可以选择「覆盖」重新生成，或「保留」直接复用（不调接口）
  const existingMode = String(
    inputs?.existing_image_mode
    || (step.settings && step.settings.existing_image_mode)
    || 'overwrite',
  ).toLowerCase() === 'keep' ? 'keep' : 'overwrite';
  const existingMap = existingMode === 'keep' ? buildExistingImageMap(step, stepRow) : new Map();
  let reusedCount = 0;

  const reqLog = [];
  const rspLog = [];
  const rawTexts = [];
  const textOutputs = [];
  const rowImages = new Array(rows.length).fill(null);
  const enrichedRows = new Array(rows.length).fill(null);

  /** 图片步骤逐行落库：中断也能保住已生成的图 */
  const persistImageProgress = (upto) => {
    if (step.output_type !== 'image') return;
    const imgs = rowImages.flat().filter(Boolean);
    const items = rows.map((r, j) => {
      const base = enrichedRows[j] || r;
      const img = (rowImages[j] || [])[0] || '';
      return base && typeof base === 'object' ? { ...base, image_url: img } : { image_url: img };
    }).slice(0, upto);
    db.run('UPDATE work_step SET images = ?, rsp_data = ?, message = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(imgs),
      JSON.stringify({ images: imgs, items }),
      `执行中…（已完成 ${upto}/${rows.length}）`,
      now(),
      stepRow.id,
    ]);
  };
  let allSuccess = true;
  let lastMessage = '';
  // 页面里编辑中的提示词优先（前端不保存也能直接执行），否则用步骤模版
  const promptTemplate = inputs && inputs.prompt !== undefined ? String(inputs.prompt) : step.prompt || '';

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const baseItem = row && typeof row === 'object' ? row : { value: row };
    // 先把命中的角色/参考图算出来，再把角色信息补进 item，提示词里就能用 ${item.character_names}
    const refInfo = resolveRowReferences(step, { ...ctx, gb: { ...ctx.gb, item: baseItem } }, baseItem);
    const enriched = enrichRowWithCharacters(baseItem, refInfo, step);
    enrichedRows[i] = enriched;

    // 「保留已有图」：这一行上次已经生成过 → 直接复用，不调接口
    if (existingMode === 'keep') {
      const key = rowKeyValues(step, baseItem);
      const reusedImage = key ? existingMap.get(key) : null;
      if (reusedImage) {
        rowImages[i] = [reusedImage];
        rspLog.push({ image_url: reusedImage, reused: true });
        textOutputs.push(reusedImage);
        reusedCount += 1;
        persistImageProgress(i + 1);
        continue;
      }
    }

    const rowCtx = { ...ctx, gb: { ...ctx.gb, item: enriched, characters: refInfo.characters, prompt: '' } };
    const promptText = renderText(rowCtx, promptTemplate);
    rowCtx.gb.prompt = promptText;

    let payload;
    let errors = [];
    if (ifaceParams) {
      const built = await buildRequest(ifaceParams, parseJson(step.model_input_value, null), rowCtx, { storageConfig });
      payload = built.payload;
      errors = built.errors;
    } else if (step.output_type === 'image' || model.model_type === 'image') {
      payload = { prompt: promptText };
    } else {
      payload = { messages: [{ role: 'user', content: promptText }] };
    }
    reqLog.push(payload);
    if (errors.length) lastMessage = errors.join('; ');

    // 逐行参考图：命中的角色图作为图生图输入（多角色时一起传）；无图则文生图
    const result = await callInterface(model, payload, {
      inputImage: refInfo.images[0] || (step.input_type === 'image' ? inputImage : null),
      inputImages: refInfo.images,
      formatType: iface?.format_type || model.format_type,
      storageConfig,
    });

    rawTexts.push(result.raw_text || result.response || '');
    if (!result.success) {
      allSuccess = false;
      lastMessage = result.message;
      rspLog.push({ _error: result.message });
      continue;
    }

    let outputs;
    if (ifaceParams) {
      outputs = await extractOutputs(
        ifaceParams,
        result.raw_json,
        parseJson(step.model_output_value, null),
        rowCtx,
        { storageConfig, errors: [] },
      );
    } else {
      outputs = { content: result.response || '' };
      if (result.images && result.images.length) outputs.images = result.images;
    }
    rspLog.push(outputs);
    textOutputs.push(pickPrimaryText(outputs));
    rowImages[i] = result.images && result.images.length
      ? result.images
      : collectImagesFromOutputs(outputs);

    persistImageProgress(i + 1);
  }

  // ---------- 收口 ----------
  let rspData;
  let outputText = '';
  let images = [];

  if (step.output_type === 'list') {
    outputText = textOutputs.join('\n');
    const items = extractJsonList(outputText);
    rspData = { items, rows: rspLog };
    if (!items.length && allSuccess) {
      lastMessage = '执行成功，但没从返回文本里解析到 JSON 列表：请检查提示词是否要求「只输出 JSON 数组」。';
    }
  } else if (step.output_type === 'image') {
    const processed = rows.map((row, i) => {
      const img = (rowImages[i] || [])[0] || '';
      const base = enrichedRows[i] || row;
      if (base && typeof base === 'object') return { ...base, image_url: img };
      return { image_url: img };
    });
    // 与上一次结果合并：本次没勾选的行保留旧图，勾选的行覆盖
    const merged = mergeImageItems(step, prevItems, processed);
    rspData = { images: merged.map((it) => it.image_url).filter(Boolean), items: merged };
    images = rspData.images;
    outputText = images[0] || '';
  } else {
    outputText = textOutputs.join('\n\n');
    rspData = inputArray ? { rows: rspLog } : rspLog[0] || {};
    images = rowImages.flat().filter(Boolean);
  }

  const finishedAt = now();
  const reqData = inputArray ? { rows: reqLog } : reqLog[0] || {};

  // 勾选行只存名字，避免把整段描述写进 inputs
  const storedInputs = { ...(inputs || {}) };
  if (Array.isArray(storedInputs.rows)) {
    storedInputs.rows = storedInputs.rows
      .map((r) => (r && typeof r === 'object' ? r.name || r.title || r.id || '' : String(r)))
      .filter(Boolean);
  }
  if (reusedCount > 0 && allSuccess) {
    lastMessage = `执行成功：复用已有图片 ${reusedCount} 张，重新生成 ${Math.max(0, rows.length - reusedCount)} 张`;
  }

  db.run(
    `UPDATE work_step SET status = ?, req_data = ?, rsp_data = ?, raw_rsp = ?, output = ?, images = ?,
       message = ?, context = ?, inputs = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
    [
      allSuccess ? 'success' : 'failed',
      JSON.stringify(reqData),
      JSON.stringify(rspData),
      rawTexts.join('\n\n===== 行分隔 =====\n\n'),
      outputText,
      JSON.stringify(images),
      lastMessage || (allSuccess ? '执行成功' : '执行失败'),
      JSON.stringify(ctx),
      JSON.stringify(storedInputs),
      finishedAt,
      finishedAt,
      stepRow.id,
    ],
  );

  // 产物登记（先清掉本步旧产物，避免多次执行重复累加）
  db.run('DELETE FROM work_artifact WHERE work_id = ? AND step_order = ?', [work.id, stepIndex + 1]);
  for (const img of images) {
    db.run(
      `INSERT INTO work_artifact (work_id, step_order, name, type, url, meta, created_at)
       VALUES (?, ?, ?, 'image', ?, ?, ?)`,
      [work.id, stepIndex + 1, step.name, img, JSON.stringify({ step_id: step.id }), finishedAt],
    );
  }

  // 作品状态
  const steps = normalizeWorkflowSteps(workflow);
  const all = db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [work.id]);
  const allDone = steps.length > 0 && all.slice(0, steps.length).every((r) => r.status === 'success');
  const status = allSuccess ? (allDone ? 'done' : 'running') : 'failed';
  db.run('UPDATE work SET status = ?, updated_at = ? WHERE id = ?', [status, finishedAt, work.id]);

  return {
    status: allSuccess ? 'success' : 'failed',
    message: lastMessage || (allSuccess ? '执行成功' : '执行失败'),
    reqData,
    rspData,
    output: outputText,
    images,
    workStatus: status,
  };
}

function collectImagesFromOutputs(outputs) {
  const out = [];
  const push = (v) => {
    if (typeof v === 'string' && v) out.push(v);
  };
  if (Array.isArray(outputs.images)) outputs.images.forEach(push);
  if (typeof outputs.image === 'string') push(outputs.image);
  if (Array.isArray(outputs.items)) {
    for (const it of outputs.items) {
      if (it && typeof it === 'object') {
        push(it.image);
        push(it.image_url);
      }
    }
  }
  for (const [k, v] of Object.entries(outputs)) {
    if (k === '_primary') continue;
    if (typeof v === 'string' && /^https?:\/\/|^data:image\//.test(v)) push(v);
  }
  return [...new Set(out)];
}

/** 级联重置：从某一步开始清空后续所有步骤结果 */
export function resetFrom(db, workId, fromOrder) {
  const ts = now();
  db.run(
    `UPDATE work_step SET status = 'pending', req_data = NULL, rsp_data = NULL, raw_rsp = NULL,
       output = NULL, images = NULL, message = '', started_at = NULL, finished_at = NULL, updated_at = ?
     WHERE work_id = ? AND step_order >= ?`,
    [ts, workId, fromOrder],
  );
  db.run('DELETE FROM work_artifact WHERE work_id = ? AND step_order >= ?', [workId, fromOrder]);
  db.run(`UPDATE work SET status = 'running', updated_at = ? WHERE id = ?`, [ts, workId]);
  return db.all('SELECT * FROM work_step WHERE work_id = ? ORDER BY step_order ASC', [workId]);
}

/** 进度汇总：当前应执行的步骤（第一个非 success 的步骤） */
export function workProgress(workSteps) {
  const rows = [...workSteps].sort((a, b) => a.step_order - b.step_order);
  const running = rows.find((r) => r.status === 'running');
  if (running) return { current: running.step_order - 1, running: true };
  const pending = rows.find((r) => r.status !== 'success');
  if (pending) return { current: pending.step_order - 1, running: false };
  return { current: Math.max(0, rows.length - 1), running: false };
}
