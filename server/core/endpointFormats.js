/**
 * 端点格式注册表。
 *
 * 「接口管理」的 format_type 决定 URL 拼接、鉴权头、请求体默认参数模板与响应主文本路径。
 * 这里只做「格式适配」；参数取值仍走 resolver，图片落盘/文件转存在 storage 中。
 */
import { getByPath, MISSING } from './resolver.js';

export const TEXT_FORMATS = new Set(['openai_chat', 'openai_completion', 'openai_responses', 'anthropic', 'gemini']);
export const IMAGE_FORMATS = new Set(['openai_image']);

const ANTHROPIC_VERSION = '2023-06-01';

/* ---------------- URL 构造 ---------------- */

function openaiChatUrl(baseUrl) {
  const url = String(baseUrl || '').replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) return url;
  if (url.includes('/v1')) return `${url}/chat/completions`;
  return `${url}/v1/chat/completions`;
}

function openaiCompletionUrl(baseUrl) {
  const url = String(baseUrl || '').replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) return `${url.slice(0, -'/chat/completions'.length)}/completions`;
  if (url.endsWith('/completions')) return url;
  if (url.includes('/v1')) return `${url}/completions`;
  return `${url}/v1/completions`;
}

function openaiResponsesUrl(baseUrl) {
  const url = String(baseUrl || '').replace(/\/+$/, '');
  if (url.endsWith('/responses')) return url;
  for (const suffix of ['/chat/completions', '/completions']) {
    if (url.endsWith(suffix)) return `${url.slice(0, -suffix.length)}/responses`;
  }
  if (url.includes('/v1')) return `${url}/responses`;
  return `${url}/v1/responses`;
}

function anthropicUrl(baseUrl) {
  const url = String(baseUrl || '').replace(/\/+$/, '');
  if (url.endsWith('/messages')) return url;
  if (url.includes('/v1')) return `${url}/messages`;
  return `${url}/v1/messages`;
}

function geminiUrl(baseUrl, modelName) {
  const url = String(baseUrl || '').replace(/\/+$/, '');
  const modelSeg = encodeURIComponent(modelName || '');
  if (url.endsWith(':generateContent') || url.includes(':generateContent?')) return url;
  if (url.includes('/models/')) {
    const tail = url.split('/models/').pop();
    if (tail && !tail.includes(':')) return `${url}:generateContent`;
  }
  if (url.endsWith('/models')) return `${url}/${modelSeg}:generateContent`;
  if (url.includes('/v1beta')) return `${url}/models/${modelSeg}:generateContent`;
  return `${url}/v1beta/models/${modelSeg}:generateContent`;
}

function imagesUrl(baseUrl) {
  const raw = String(baseUrl || '').replace(/\/+$/, '');
  if (raw.endsWith('/images/generations') || raw.endsWith('/images/edits')) return raw;
  if (raw.includes('/v1')) return `${raw}/images/generations`;
  return `${raw}/v1/images/generations`;
}

/* ---------------- 请求头 ---------------- */

const bearerHeaders = (apiKey) => ({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' });
const anthropicHeaders = (apiKey) => ({
  'x-api-key': apiKey,
  'anthropic-version': ANTHROPIC_VERSION,
  'Content-Type': 'application/json',
});
const geminiHeaders = () => ({ 'Content-Type': 'application/json' });

/* ---------------- 参数模板 ---------------- */

const vc = (kind, expr) => ({ kind, expr });
const p = (paramType, name, valueType, description, value, rule, children) => ({
  param_type: paramType,
  param_name: name,
  param_value: value || null,
  value_type: valueType,
  file_type: 'none',
  description,
  validate_rule: rule || null,
  children: children || [],
});

const messagesChildren = (contentExpr = '${gb.prompt}') => [
  p('input', 'role', 'string', '消息角色', vc('constant', 'user')),
  p('input', 'content', 'string', '消息内容', vc('variable', contentExpr), 'required'),
];

export const FORMAT_SPECS = {
  openai_chat: {
    key: 'openai_chat',
    label: 'OpenAI Chat Completions（对话补全）',
    description: 'OpenAI 兼容的 /v1/chat/completions 格式，DeepSeek、月之暗面、各类中转站均适用',
    kind: 'text',
    modelInBody: true,
    contentPath: 'resp.choices[0].message.content',
    buildUrl: openaiChatUrl,
    buildHeaders: bearerHeaders,
    buildQuery: () => ({}),
    paramsPreset: [
      p('input', 'model', 'string', '模型标识（取绑定模型的 model_name）', vc('variable', '${gb.model_name}'), 'required'),
      p('input', 'messages', 'array', '对话消息数组（可整值覆盖或按子变量构造）', null, 'required', messagesChildren()),
      p('input', 'temperature', 'number', '采样温度', vc('constant', '0.7')),
      p('output', 'content', 'string', '回复文本', vc('variable', '${resp.choices[0].message.content}'), 'required'),
    ],
  },
  openai_completion: {
    key: 'openai_completion',
    label: 'OpenAI Completions（旧版文本补全）',
    description: 'OpenAI 旧版 /v1/completions 格式，prompt 为纯文本，响应取 choices[0].text',
    kind: 'text',
    modelInBody: true,
    contentPath: 'resp.choices[0].text',
    buildUrl: openaiCompletionUrl,
    buildHeaders: bearerHeaders,
    buildQuery: () => ({}),
    paramsPreset: [
      p('input', 'model', 'string', '模型标识', vc('variable', '${gb.model_name}'), 'required'),
      p('input', 'prompt', 'string', '补全提示词（纯文本）', vc('variable', '${gb.prompt}'), 'required'),
      p('input', 'max_tokens', 'number', '最大生成 token 数', vc('constant', '1024')),
      p('input', 'temperature', 'number', '采样温度', vc('constant', '0.7')),
      p('output', 'text', 'string', '补全文本', vc('variable', '${resp.choices[0].text}'), 'required'),
    ],
  },
  openai_responses: {
    key: 'openai_responses',
    label: 'OpenAI Responses（GPT-5 / o 系列新 API）',
    description: 'OpenAI 新版 /v1/responses 格式，鉴权与 Chat 相同（Bearer）；请求体为 model + input，响应取 output_text',
    kind: 'text',
    modelInBody: true,
    contentPath: 'resp.output_text',
    buildUrl: openaiResponsesUrl,
    buildHeaders: bearerHeaders,
    buildQuery: () => ({}),
    paramsPreset: [
      p('input', 'model', 'string', '模型标识（如 gpt-5-sol）', vc('variable', '${gb.model_name}'), 'required'),
      p('input', 'input', 'array', '输入内容（消息数组或纯文本）', null, 'required', messagesChildren()),
      p('input', 'max_output_tokens', 'number', '最大输出 token 数', vc('constant', '1024')),
      p('output', 'text', 'string', '回复文本（多段文本自动拼接）', vc('variable', '${resp.output_text}'), 'required'),
    ],
  },
  anthropic: {
    key: 'anthropic',
    label: 'Anthropic Messages（Claude）',
    description: 'Anthropic /v1/messages 格式，x-api-key 鉴权，max_tokens 必填，响应取 content[0].text',
    kind: 'text',
    modelInBody: true,
    contentPath: 'resp.content[0].text',
    buildUrl: anthropicUrl,
    buildHeaders: anthropicHeaders,
    buildQuery: () => ({}),
    paramsPreset: [
      p('input', 'model', 'string', '模型标识（如 claude-3-5-sonnet-latest）', vc('variable', '${gb.model_name}'), 'required'),
      p('input', 'messages', 'array', '对话消息数组', null, 'required', messagesChildren()),
      p('input', 'max_tokens', 'number', '最大生成 token 数（Anthropic 必填）', vc('constant', '4096'), 'required'),
      p('output', 'content', 'string', '回复文本', vc('variable', '${resp.content[0].text}'), 'required'),
    ],
  },
  gemini: {
    key: 'gemini',
    label: 'Google Gemini（generateContent）',
    description: 'Gemini /v1beta/models/{model}:generateContent 格式，API Key 走 URL query，请求体为 contents 结构',
    kind: 'text',
    modelInBody: false,
    contentPath: 'resp.candidates[0].content.parts[0].text',
    buildUrl: geminiUrl,
    buildHeaders: geminiHeaders,
    buildQuery: (apiKey) => ({ key: apiKey }),
    paramsPreset: [
      p('input', 'contents', 'array', '对话内容数组（role + parts[{text}]）', null, 'required', [
        p('input', 'role', 'string', '对话角色', vc('constant', 'user')),
        p('input', 'parts', 'array', '内容块数组', null, 'required', [
          p('input', 'text', 'string', '文本内容', vc('variable', '${gb.prompt}'), 'required'),
        ]),
      ]),
      p('output', 'text', 'string', '回复文本', vc('variable', '${resp.candidates[0].content.parts[0].text}'), 'required'),
    ],
  },
  openai_image: {
    key: 'openai_image',
    label: 'OpenAI Images（文生图 / 图生图）',
    description: 'OpenAI /v1/images/generations 格式，响应取 data[0].url 或 b64_json',
    kind: 'image',
    modelInBody: true,
    contentPath: null,
    buildUrl: imagesUrl,
    buildHeaders: bearerHeaders,
    buildQuery: () => ({}),
    paramsPreset: [
      p('input', 'model', 'string', '模型标识', vc('variable', '${gb.model_name}'), 'required'),
      p('input', 'prompt', 'string', '生图提示词', vc('variable', '${gb.prompt}'), 'required'),
      p('input', 'n', 'number', '生成数量', vc('constant', '1')),
      p('input', 'size', 'string', '图片尺寸', vc('constant', '1024x1024')),
      p('input', 'image', 'string', '参考图（图生图时使用，file/url/base64 均可）', null, null, null, ),
      p('output', 'image', 'string', '图片地址', vc('variable', '${resp.data[0].url}'), 'required'),
    ],
  },
};

// openai_image.image 参数需要文件类型，单独补齐（保持上方模板字面量整洁）
FORMAT_SPECS.openai_image.paramsPreset[4].file_type = 'file';

export function getSpec(formatType) {
  if (!formatType) return null;
  return FORMAT_SPECS[formatType] || null;
}

/** 格式预设列表（接口管理下拉 + 一键填充） */
export function listPresets() {
  return Object.values(FORMAT_SPECS).map((spec) => ({
    key: spec.key,
    label: spec.label,
    description: spec.description,
    kind: spec.kind,
    params: deepClone(spec.paramsPreset),
  }));
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 生成最终请求四要素（真实调用与「调试预览」共用，保证所见即所发） */
export function finalizeRequest(formatType, model, payload) {
  const spec = FORMAT_SPECS[formatType];
  if (!spec) throw new Error(`未知端点格式: ${formatType}`);
  const body = { ...(payload || {}) };
  if (spec.modelInBody && body.model === undefined) body.model = model.model_name;
  return {
    method: 'POST',
    url: spec.buildUrl(model.base_url, model.model_name),
    headers: spec.buildHeaders(model.api_key),
    query: spec.buildQuery(model.api_key),
    body,
  };
}

/** 请求头脱敏（预览展示） */
export function maskHeaders(headers) {
  const sensitive = ['authorization', 'x-api-key', 'x-goog-api-key'];
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (sensitive.includes(k.toLowerCase()) && v) {
      out[k] = String(v).toLowerCase().startsWith('bearer ') ? `${String(v).split(' ')[0]} ***` : '***';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function maskQuery(query) {
  const out = {};
  for (const [k, v] of Object.entries(query || {})) {
    out[k] = ['key', 'api_key'].includes(k.toLowerCase()) ? '***' : v;
  }
  return out;
}

/**
 * OpenAI Responses 响应文本聚合
 *
 * 注意：Responses API 的 output 里既可能有 reasoning（思考过程）也可能有 message（正式答案）。
 * 之前把所有 output 文本拼在一起，导致思维链混进正文、JSON 无法解析；这里优先只取 message。
 */
export function extractResponsesText(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') {
    if (Array.isArray(rawJson)) {
      const parts = rawJson.map((it) => extractResponsesText(it)).filter(Boolean);
      return parts.length ? parts.join('\n') : null;
    }
    return null;
  }
  if (typeof rawJson.output_text === 'string' && rawJson.output_text) return rawJson.output_text;

  const outputs = Array.isArray(rawJson.output) ? rawJson.output.filter((o) => o && typeof o === 'object') : [];

  const collect = (list) => {
    const pieces = [];
    for (const msg of list) {
      if (typeof msg.text === 'string' && msg.text) {
        pieces.push(msg.text);
        continue;
      }
      if (typeof msg.content === 'string' && msg.content) {
        pieces.push(msg.content);
        continue;
      }
      if (Array.isArray(msg.content)) {
        for (const blk of msg.content) {
          if (blk && typeof blk === 'object') {
            const t = blk.text || blk.output_text;
            if (typeof t === 'string' && t) pieces.push(t);
          }
        }
      }
    }
    return pieces;
  };

  // 1) 优先只取正式消息（type=message / role=assistant）
  const messages = outputs.filter(
    (o) => o.type === 'message' || o.role === 'assistant' || (o.type !== 'reasoning' && !o.summary),
  );
  const messagePieces = collect(messages);
  if (messagePieces.length) return messagePieces.join('\n');

  // 2) 没有 message 时退回全部（兼容旧端点/挡板只返回 output 数组）
  const pieces = collect(outputs);
  return pieces.length ? pieces.join('\n') : null;
}

/** 按格式的 contentPath 从原始响应提取主文本 */
export function extractTextContent(formatType, rawJson) {
  const spec = FORMAT_SPECS[formatType];
  if (!spec || !spec.contentPath || rawJson === null || rawJson === undefined) return null;
  if (formatType === 'openai_responses') return extractResponsesText(rawJson);
  const value = getByPath({ resp: rawJson }, spec.contentPath);
  if (value === MISSING || value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
