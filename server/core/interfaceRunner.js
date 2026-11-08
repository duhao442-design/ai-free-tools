/**
 * 接口调用服务：报文构造、调用与输出提取。
 *
 * 职责：
 *  1. buildRequest   ：读取接口配置的输入参数树，用模板解析引擎结合上下文构造请求报文；
 *                      带 file_type 的参数会先探测实际值形态，再动态转换成接口声明的类型。
 *  2. callInterface  ：按 format_type 推导 URL/鉴权/请求体并发起调用（文本走格式适配器，
 *                      图片走 generations/edits multipart）。
 *  3. extractOutputs ：按输出参数树从原始响应中提取结构化结果；带 file_type 的输出
 *                      一律转存到项目级存储并返回本地链接。
 */
import path from 'node:path';
import {
  FORMAT_SPECS, getSpec, finalizeRequest, extractTextContent, TEXT_FORMATS,
} from './endpointFormats.js';
import {
  resolveValue, renderDeep, castValue, getByPath, MISSING,
} from './resolver.js';
import {
  prepareInputValue, persistOutputValue, persistOutputFile, detectKind, toBuffer, guessMime, extFromKind,
} from './fileConvert.js';

const CONTAINER_TYPES = new Set(['object', 'dict', 'json', 'array', 'list']);
const TEXT_TIMEOUT = 180000;
const IMAGE_TIMEOUT = 300000;

/* ---------------- 参数树工具 ---------------- */

export function splitParams(params) {
  const groups = { input: [], output: [] };
  for (const p of params || []) {
    const key = p.param_type || 'input';
    (groups[key] || (groups[key] = [])).push(p);
  }
  return groups;
}

function isContainer(param) {
  const vt = String(param.value_type || 'string').toLowerCase();
  return CONTAINER_TYPES.has(vt) && Array.isArray(param.children) && param.children.length > 0;
}

function normalizeValueConfig(vc) {
  if (vc === null || vc === undefined) return null;
  if (typeof vc === 'object' && !Array.isArray(vc)) {
    if ('kind' in vc || 'children' in vc) return vc;
    return { kind: 'variable', expr: JSON.stringify(vc) };
  }
  return { kind: 'variable', expr: String(vc) };
}

function isRequired(param) {
  return String(param.validate_rule || '').trim() === 'required';
}

function fileTypeOf(param) {
  return String(param.file_type || 'none').toLowerCase();
}

/* ---------------- 请求构造 ---------------- */

async function resolveInputNode(param, vc, context, pathArr, opts) {
  const valueType = String(param.value_type || 'string').toLowerCase();
  const children = param.children || [];
  const container = CONTAINER_TYPES.has(valueType) && children.length > 0;
  const cfg = normalizeValueConfig(vc);
  const errors = [];

  if (container) {
    // 1) 整值覆盖：节点声明了取值表达式（如整个 messages 来自 ${stepList[0].rsp.items}）
    if (cfg && String(cfg.expr || '').trim()) {
      const expr = cfg.expr;
      if (cfg.kind === 'constant') {
        try {
          return { value: castValue(expr, valueType), errors };
        } catch (e) {
          /* fallthrough */
        }
      }
      const resolved = resolveValue(context, expr, null);
      if (Array.isArray(resolved) || (resolved && typeof resolved === 'object')) {
        return { value: resolved, errors };
      }
      if (typeof resolved === 'string' && ['[', '{'].includes(resolved.slice(0, 1))) {
        try {
          return { value: renderDeep(context, JSON.parse(resolved)), errors };
        } catch (e) {
          /* fallthrough */
        }
      }
    }
    // 2) 按子变量构造
    const childCfg = (cfg && cfg.children && typeof cfg.children === 'object') ? cfg.children : {};
    const obj = {};
    for (const child of children) {
      const cname = child.param_name;
      const cvc = Object.prototype.hasOwnProperty.call(childCfg, cname) ? childCfg[cname] : child.param_value;
      const { value: cval, errors: cerr } = await resolveInputNode(child, cvc, context, [...pathArr, cname], opts);
      errors.push(...cerr);
      if (cval !== null && cval !== undefined) obj[cname] = cval;
    }
    if (!Object.keys(obj).length) {
      if (isRequired(param)) errors.push(`参数 ${pathArr.join('.')} 为必填项`);
      return { value: null, errors };
    }
    return { value: CONTAINER_TYPES.has(valueType) && valueType.startsWith('array') ? [obj] : obj, errors };
  }

  // 叶子节点
  if (!cfg || cfg.expr === null || cfg.expr === undefined) {
    if (isRequired(param)) errors.push(`参数 ${pathArr.join('.')} 为必填项`);
    return { value: null, errors };
  }
  let value;
  if (cfg.kind === 'constant') value = castValue(cfg.expr, valueType);
  else value = resolveValue(context, cfg.expr, valueType);

  // 文件类型：探测实际形态后动态转换（输入方向）
  const ft = fileTypeOf(param);
  if (ft !== 'none' && value !== null && value !== undefined && value !== '') {
    try {
      value = await prepareInputValue(value, ft, {
        storageConfig: opts.storageConfig,
        filename: param.param_name,
      });
    } catch (e) {
      errors.push(`参数 ${pathArr.join('.')} 文件转换失败: ${e.message}`);
      value = null;
    }
  }

  if (isRequired(param) && (value === null || value === undefined || value === '')) {
    errors.push(`参数 ${pathArr.join('.')} 为必填项`);
  }
  return { value, errors };
}

export async function buildRequest(interfaceParams, overrides, context, opts = {}) {
  const inputs = splitParams(interfaceParams).input;
  const ov = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  const payload = {};
  const errors = [];

  for (const p of inputs) {
    const name = p.param_name;
    const vc = Object.prototype.hasOwnProperty.call(ov, name) ? ov[name] : p.param_value;
    const { value, errors: errs } = await resolveInputNode(p, vc, context, [name], opts);
    errors.push(...errs);
    if (value !== null && value !== undefined) payload[name] = value;
  }
  return { payload, errors };
}

/* ---------------- 调用 ---------------- */

// 请求超时：避免上游卡住导致步骤永远 running（应用被杀后看起来"执行完啥都没有"）
const TEXT_TIMEOUT_MS = Number(process.env.AIFT_TEXT_TIMEOUT_MS || 180000);
const IMAGE_TIMEOUT_MS = Number(process.env.AIFT_IMAGE_TIMEOUT_MS || 300000);
const timeoutSignal = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout
  ? AbortSignal.timeout(ms)
  : undefined);
const isTimeoutError = (e) => e && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout/i.test(String(e.message || '')));

function detectKindByPayload(payload) {
  if (payload && 'messages' in payload) return 'chat';
  if (payload && 'prompt' in payload) return 'image';
  return 'raw';
}

async function callText(model, payload, formatType, opts) {
  const req = finalizeRequest(formatType, model, payload);
  const url = new URL(req.url);
  for (const [k, v] of Object.entries(req.query || {})) url.searchParams.set(k, v);

  const started = Date.now();
  try {
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: timeoutSignal(TEXT_TIMEOUT_MS),
    });
    const text = await resp.text();
    let rawJson = null;
    try {
      rawJson = JSON.parse(text);
    } catch (e) {
      rawJson = null;
    }
    if (!resp.ok) {
      return {
        success: false,
        message: `HTTP ${resp.status}: ${text.slice(0, 300)}`,
        raw_json: rawJson,
        raw_text: text.slice(0, 4000),
        request: { url: url.toString(), headers: req.headers, body: req.body },
        elapsed: Date.now() - started,
      };
    }
    const content = extractTextContent(formatType, rawJson);
    return {
      success: true,
      message: '调用成功',
      raw_json: rawJson,
      raw_text: text,
      response: content === null ? text : content,
      request: { url: url.toString(), headers: req.headers, body: req.body },
      elapsed: Date.now() - started,
    };
  } catch (e) {
    return {
      success: false,
      message: isTimeoutError(e) ? `请求超时（>${Math.round(TEXT_TIMEOUT_MS / 1000)}s）: ${e.message}` : `调用异常: ${e.message}`,
      raw_json: null,
      raw_text: null,
      request: { url: url.toString(), headers: req.headers, body: req.body },
      elapsed: Date.now() - started,
    };
  }
}

/** 图片端点切换：文生图走 /images/generations，图生图走 /images/edits */
function resolveImageEndpoint(baseUrl, isEdit) {
  const raw = String(baseUrl || '').replace(/\/+$/, '');
  const toGenerations = (u) => u.replace(/\/images\/edits$/, '/images/generations');
  const toEdits = (u) => u.replace(/\/images\/generations$/, '/images/edits');
  let url;
  if (/\/images\/(generations|edits)$/.test(raw)) url = raw;
  else if (raw.includes('/v1')) url = `${raw}/images/generations`;
  else url = `${raw}/v1/images/generations`;
  return isEdit ? toEdits(url) : toGenerations(url);
}

async function callImage(model, payload, inputImage, opts = {}) {
  const apiKey = model.api_key;
  const prompt = payload.prompt || '';
  const size = payload.size || '1024x1024';
  const n = Number(payload.n || 1);

  // 参考图来源：显式多图 > 单图 > 参数里的 images / image；去重后最多 4 张
  const payloadImages = Array.isArray(payload.images) ? payload.images : payload.images ? [payload.images] : [];
  const rawRefs = [
    ...(Array.isArray(opts.inputImages) ? opts.inputImages : []),
    inputImage,
    ...payloadImages,
    payload.image,
  ].filter((v) => v && String(v).trim());
  const refs = [...new Set(rawRefs.map(String))].slice(0, 4);
  const hasRef = refs.length > 0;
  const url = resolveImageEndpoint(model.base_url, hasRef);
  const started = Date.now();

  if (!hasRef && /\/images\/edits$/.test(url)) {
    return {
      success: false,
      message: '该步骤使用图生图端点（/images/edits），但没有拿到参考图：请检查步骤输入类型是否为 image，或接口参数里是否传入了 image。',
      raw_json: null,
      raw_text: null,
      elapsed: Date.now() - started,
      request: { url, body: payload },
    };
  }

  try {
    let resp;
    let text = '';
    if (hasRef) {
      const parts = [];
      for (const ref of refs) {
        const refKind = detectKind(ref);
        const buffer = await toBuffer(ref, refKind);
        if (!buffer) continue;
        const ext = extFromKind(ref, refKind);
        parts.push({ buffer, ext, mime: guessMime(`x${ext}`) });
      }
      if (!parts.length) throw new Error('参考图读取失败');

      const postMultipart = async (fieldName, useParts) => {
        const form = new FormData();
        form.append('model', model.model_name);
        form.append('prompt', prompt);
        form.append('n', String(n));
        form.append('size', size);
        useParts.forEach((p, i) => {
          form.append(fieldName, new Blob([p.buffer], { type: p.mime }), `input${i}${p.ext}`);
        });
        return fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: timeoutSignal(IMAGE_TIMEOUT_MS),
        });
      };

      // 依次尝试：多图用 image[]，单图用 image；网关要求 images 时再重试
      const attempts = [];
      if (parts.length > 1) attempts.push(['image[]', parts]);
      attempts.push(['image', parts.length > 1 ? [parts[0]] : parts]);
      if (parts.length > 1) attempts.push(['images', parts]);

      for (let i = 0; i < attempts.length; i += 1) {
        const [field, useParts] = attempts[i];
        resp = await postMultipart(field, useParts);
        text = await resp.text();
        if (resp.ok) break;
        const more = i < attempts.length - 1;
        if (!more || !/image|multipart|parameter/i.test(text)) break;
      }
    } else {
      resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, model: model.model_name }),
        signal: timeoutSignal(IMAGE_TIMEOUT_MS),
      });
      text = await resp.text();
    }
    let rawJson = null;
    try {
      rawJson = JSON.parse(text);
    } catch (e) {
      rawJson = null;
    }
    if (!resp.ok) {
      return {
        success: false,
        message: `HTTP ${resp.status}（${url}）: ${text.slice(0, 300)}`,
        raw_json: rawJson,
        raw_text: text.slice(0, 4000),
        elapsed: Date.now() - started,
        request: { url, body: payload },
      };
    }
    const dataList = Array.isArray(rawJson?.data) ? rawJson.data : [];
    const candidates = [];
    for (const item of dataList) {
      if (item?.url) candidates.push(item.url);
      else if (item?.b64_json) candidates.push(`data:image/png;base64,${item.b64_json}`);
    }
    // 图片结果统一转存到项目级存储
    const images = [];
    for (const src of candidates) {
      try {
        const saved = await persistOutputValue(src, 'file', { storageConfig: opts.storageConfig, filename: 'image.png', subDir: 'images' });
        images.push(saved);
      } catch (e) {
        images.push(src);
      }
    }
    return {
      success: true,
      message: `生成 ${images.length} 张图片`,
      raw_json: rawJson,
      raw_text: text,
      images,
      response: images[0] || '',
      elapsed: Date.now() - started,
      request: { url, body: payload },
    };
  } catch (e) {
    return {
      success: false,
      message: isTimeoutError(e)
        ? `图片请求超时（>${Math.round(IMAGE_TIMEOUT_MS / 1000)}s）: ${e.message}`
        : `调用异常: ${e.message}`,
      raw_json: null,
      raw_text: null,
      elapsed: Date.now() - started,
      request: { url, body: payload },
    };
  }
}

/**
 * 调用接口。
 * @param {object} model  {base_url, model_name, api_key, format_type}
 * @param {object} payload 请求报文
 * @param {{inputImage?:string, formatType?:string, storageConfig?:object, timeout?:number}} opts
 */
export async function callInterface(model, payload, opts = {}) {
  const formatType = opts.formatType || model.format_type || null;
  const spec = getSpec(formatType);
  if (spec && spec.kind === 'text') return callText(model, payload, formatType, opts);
  const kind = detectKindByPayload(payload);
  if (kind === 'image') return callImage(model, payload, opts.inputImage, opts);
  // 未识别报文形态：按 openai_chat 兜底（messages 缺失时把 payload 整体当 prompt）
  return {
    success: false,
    message: '无法识别接口报文形态（需包含 messages 或 prompt 参数）',
    raw_json: null,
    raw_text: null,
  };
}

/* ---------------- 响应提取 ---------------- */

function exprTokens(expr) {
  if (expr === null || expr === undefined) return null;
  const text = String(expr).trim();
  if (!(text.startsWith('${resp.') && text.endsWith('}'))) return null;
  const inner = text.slice('${resp.'.length, -1).trim();
  if (!inner) return null;
  const tokens = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(inner))) {
    if (m[1]) tokens.push(m[1].trim());
    else if (m[2] !== undefined) tokens.push(Number(m[2]));
  }
  return tokens.length ? tokens : null;
}

function setAtPath(root, tokens, value) {
  if (!tokens || !tokens.length) return;
  let cur = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const t = tokens[i];
    const listNext = typeof tokens[i + 1] === 'number';
    if (typeof t === 'number') {
      if (!Array.isArray(cur)) {
        cur = [];
      }
      while (cur.length <= t) cur.push(null);
      if (!cur[t] || typeof cur[t] !== 'object') cur[t] = listNext ? [] : {};
      cur = cur[t];
    } else {
      if (typeof cur !== 'object' || cur === null) cur = {};
      if (!cur[t] || typeof cur[t] !== 'object') cur[t] = listNext ? [] : {};
      cur = cur[t];
    }
  }
  const last = tokens[tokens.length - 1];
  if (typeof last === 'number') {
    if (!Array.isArray(cur)) cur = [];
    while (cur.length <= last) cur.push(null);
    cur[last] = value;
  } else {
    cur[last] = value;
  }
}

function normalizeResponsesRaw(rawJson) {
  if (!rawJson || typeof rawJson !== 'object' || rawJson.output_text !== undefined) return rawJson;
  if (!('output' in rawJson)) return rawJson;
  const text = extractTextContent('openai_responses', rawJson);
  if (!text) return rawJson;
  return { ...rawJson, output_text: text };
}

async function resolveOutputNode(param, vc, ctx, opts, pathArr) {
  const valueType = String(param.value_type || 'string').toLowerCase();
  const children = param.children || [];
  const container = CONTAINER_TYPES.has(valueType) && children.length > 0;
  const cfg = normalizeValueConfig(vc);

  if (container) {
    if (cfg && String(cfg.expr || '').trim()) {
      const resolved = resolveValue(ctx, cfg.expr, null);
      if (Array.isArray(resolved) || (resolved && typeof resolved === 'object')) return resolved;
      if (typeof resolved === 'string' && ['[', '{'].includes(resolved.slice(0, 1))) {
        try {
          return renderDeep(ctx, JSON.parse(resolved));
        } catch (e) {
          /* fallthrough */
        }
      }
    }
    const childCfg = (cfg && cfg.children && typeof cfg.children === 'object') ? cfg.children : {};
    const obj = {};
    for (const child of children) {
      const cname = child.param_name;
      const cvc = Object.prototype.hasOwnProperty.call(childCfg, cname) ? childCfg[cname] : child.param_value;
      const cval = await resolveOutputNode(child, cvc, ctx, opts, [...pathArr, cname]);
      if (cval !== null && cval !== undefined) obj[cname] = cval;
    }
    if (!Object.keys(obj).length) return null;
    return valueType.startsWith('array') ? [obj] : obj;
  }

  if (!cfg || cfg.expr === null || cfg.expr === undefined) return null;
  let value = resolveValue(ctx, cfg.expr, valueType);

  // 输出方向：带文件类型的参数一律转存本地存储，返回本地链接
  const ft = fileTypeOf(param);
  if (ft !== 'none' && value !== null && value !== undefined && value !== '') {
    try {
      value = await persistOutputValue(value, ft, {
        storageConfig: opts.storageConfig,
        filename: `${param.param_name || 'output'}${extFromKind(value, detectKind(value))}`,
        subDir: opts.subDir,
      });
    } catch (e) {
      // 转存失败时保留原值，并在错误列表记录
      opts.errors = opts.errors || [];
      opts.errors.push(`输出参数 ${pathArr.join('.')} 转存失败: ${e.message}`);
    }
  }
  return value;
}

/**
 * 按输出参数树从原始响应提取结果。
 * 返回：路径嵌套结构 + 顶层按参数名补引用 + _primary 主输出标记。
 */
export async function extractOutputs(interfaceParams, rawJson, modelOutputValue, context, opts = {}) {
  const outputs = splitParams(interfaceParams).output;
  const nameSet = new Set(outputs.map((p) => p.param_name));
  let overrides = {};
  let primary = null;
  if (modelOutputValue && typeof modelOutputValue === 'object' && !Array.isArray(modelOutputValue)) {
    overrides = modelOutputValue;
  } else if (typeof modelOutputValue === 'string' && modelOutputValue.trim()) {
    const text = modelOutputValue.trim();
    if (nameSet.has(text)) primary = text;
    else if (text.includes('${')) {
      overrides = { result: text };
      primary = 'result';
    }
  }

  const ctx = { ...context, resp: normalizeResponsesRaw(rawJson) };
  const holder = {};
  const compat = {};

  async function extractNode(param, vc) {
    const valueType = String(param.value_type || 'string').toLowerCase();
    const children = param.children || [];
    const container = CONTAINER_TYPES.has(valueType) && children.length > 0;
    const name = param.param_name;
    const cfg = normalizeValueConfig(vc);

    if (container) {
      if (cfg && String(cfg.expr || '').trim()) {
        const value = await resolveOutputNode(param, cfg, ctx, opts, [name]);
        if (value !== null && value !== undefined) {
          const tokens = exprTokens(cfg.expr) || [name];
          setAtPath(holder, tokens, value);
        }
        return;
      }
      const childCfg = (cfg && cfg.children && typeof cfg.children === 'object') ? cfg.children : {};
      for (const child of children) {
        const cname = child.param_name;
        const cvc = Object.prototype.hasOwnProperty.call(childCfg, cname) ? childCfg[cname] : child.param_value;
        await extractNode(child, cvc);
      }
      const sub = await resolveOutputNode(param, cfg, ctx, opts, [name]);
      if (sub !== null && sub !== undefined && !(name in compat)) compat[name] = sub;
      return;
    }

    const value = await resolveOutputNode(param, cfg, ctx, opts, [name]);
    if (value === null || value === undefined) return;
    const tokens = cfg && cfg.expr !== null && cfg.expr !== undefined ? exprTokens(cfg.expr) : [name];
    setAtPath(holder, tokens || [name], value);
    if (!(name in compat)) compat[name] = value;
  }

  for (const p of outputs) {
    const name = p.param_name;
    const vc = Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : p.param_value;
    await extractNode(p, vc);
  }

  // 不在接口参数树内的自定义取值（如 ${resp.xxx} -> result）
  for (const [key, cfgRaw] of Object.entries(overrides)) {
    if (nameSet.has(key)) continue;
    const cfg = normalizeValueConfig(cfgRaw);
    if (!cfg || cfg.expr === null || cfg.expr === undefined) continue;
    const value = await resolveValue(ctx, cfg.expr, null);
    if (value === null || value === undefined) continue;
    const tokens = exprTokens(cfg.expr) || [key];
    setAtPath(holder, tokens, value);
    if (!(key in compat)) compat[key] = value;
  }

  for (const [k, v] of Object.entries(compat)) {
    if (!(k in holder)) holder[k] = v;
  }
  if (primary) holder._primary = primary;
  return holder;
}

/** 从提取结果中挑主文本（按优先级） */
export function pickPrimaryText(outputs) {
  if (!outputs || typeof outputs !== 'object') return '';
  const primary = outputs._primary;
  if (primary && outputs[primary] !== undefined) {
    const v = outputs[primary];
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
  for (const key of ['output_text', 'text', 'content', 'image']) {
    if (typeof outputs[key] === 'string' && outputs[key]) return outputs[key];
  }
  const firstString = Object.entries(outputs).find(([k, v]) => k !== '_primary' && typeof v === 'string' && v);
  return firstString ? firstString[1] : '';
}

export { FORMAT_SPECS, TEXT_FORMATS };
