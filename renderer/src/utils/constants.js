/** 全局枚举与文案映射 */

export const WORK_TYPES = [
  { value: 'comic', label: '漫画' },
  { value: 'novel', label: '小说' },
  { value: 'drama', label: '短剧' },
  { value: 'music', label: '音乐' },
];

export const WORK_STATUS = [
  { value: 'draft', label: '草稿', type: 'info' },
  { value: 'running', label: '进行中', type: '' },
  { value: 'done', label: '已完成', type: 'success' },
  { value: 'failed', label: '失败', type: 'danger' },
];

export const STEP_STATUS = [
  { value: 'pending', label: '待执行', type: 'info', icon: 'el-icon-time' },
  { value: 'running', label: '执行中', type: '', icon: 'el-icon-loading' },
  { value: 'success', label: '成功', type: 'success', icon: 'el-icon-circle-check' },
  { value: 'failed', label: '失败', type: 'danger', icon: 'el-icon-circle-close' },
];

export const MODEL_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图像' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
];

export const PROVIDERS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'custom', label: '自定义 / 中转站' },
];

export const FORMAT_TYPES = [
  { value: 'openai_chat', label: 'OpenAI Chat', kind: 'text' },
  { value: 'openai_completion', label: 'OpenAI Completion', kind: 'text' },
  { value: 'openai_responses', label: 'OpenAI Responses', kind: 'text' },
  { value: 'anthropic', label: 'Anthropic Messages', kind: 'text' },
  { value: 'gemini', label: 'Gemini generateContent', kind: 'text' },
  { value: 'openai_image', label: 'OpenAI Images', kind: 'image' },
];

export const VALUE_TYPES = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'object', label: 'object' },
  { value: 'array', label: 'array' },
];

export const FILE_TYPES = [
  { value: 'none', label: '非文件' },
  { value: 'file', label: 'file' },
  { value: 'url', label: 'url' },
  { value: 'base64', label: 'base64' },
];

export const STEP_INPUT_TYPES = [
  { value: 'none', label: 'none（单次）' },
  { value: 'list', label: 'list（列表逐行）' },
  { value: 'image', label: 'image（图片输入）' },
  { value: 'composite', label: 'composite（复合对象）' },
];

export const STEP_OUTPUT_TYPES = [
  { value: 'none', label: 'none（文本/通用）' },
  { value: 'list', label: 'list（JSON 列表）' },
  { value: 'image', label: 'image（图片）' },
  { value: 'composite', label: 'composite（复合对象）' },
];

export const COMPONENT_GROUPS = ['基础', '作品', '工作流', 'AI', '数据', '调试', '动作', '配置', '自定义'];

export function labelOf(list, value) {
  const hit = list.find((it) => it.value === value);
  return hit ? hit.label : value || '-';
}

export function typeOf(list, value) {
  const hit = list.find((it) => it.value === value);
  return hit ? hit.type : 'info';
}

export function formatLabel(value) {
  return labelOf(FORMAT_TYPES, value);
}
