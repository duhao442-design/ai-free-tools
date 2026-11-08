/**
 * 内置组件注册表
 *
 * 每个组件声明：
 *  key       唯一标识（页面 layout 里 component 字段引用它）
 *  props     暴露给「页面搭建」的传参配置；expr=true 表示值支持 ${...} 表达式
 *  runtime   Vue 组件文件名（renderer/src/components/runtime/builtin/*.vue）
 *
 * 这些组件是把旧项目 Works/WorkDetail/ConfigStepPanel/LegacyComicPanels/Interfaces 等
 * 页面里的功能区块「解析后内置」的结果，详见 docs/component-mapping.md。
 */

const p = (name, label, type, extra = {}) => ({
  name,
  label,
  type,
  expr: extra.expr !== undefined ? extra.expr : true,
  default: extra.default !== undefined ? extra.default : '',
  options: extra.options || null,
  description: extra.description || '',
  ...extra,
});

export const BUILTIN_COMPONENTS = [
  {
    key: 'page-title',
    name: '页面标题',
    group: '基础',
    icon: 'el-icon-notebook-2',
    description: '页面级标题与副标题，支持表达式',
    runtime: 'PageTitle',
    props: [
      p('text', '标题', 'string', { default: '${gb.page.name}' }),
      p('subtitle', '副标题', 'string', { default: '' }),
      p('size', '字号', 'select', { expr: false, default: 'medium', options: ['small', 'medium', 'large'] }),
    ],
  },
  {
    key: 'divider',
    name: '分割线',
    group: '基础',
    icon: 'el-icon-minus',
    description: '带文字的分割线',
    runtime: 'Divider',
    props: [
      p('text', '文字', 'string', { expr: false, default: '' }),
      p('position', '位置', 'select', { expr: false, default: 'left', options: ['left', 'center', 'right'] }),
    ],
  },
  {
    key: 'notice',
    name: '提示条',
    group: '基础',
    icon: 'el-icon-info',
    description: '信息 / 成功 / 警告 / 错误提示',
    runtime: 'Notice',
    props: [
      p('text', '内容', 'string', { default: '' }),
      p('type', '类型', 'select', { expr: false, default: 'info', options: ['info', 'success', 'warning', 'error'] }),
      p('closable', '可关闭', 'boolean', { expr: false, default: false }),
    ],
  },
  {
    key: 'work-info',
    name: '作品信息',
    group: '作品',
    icon: 'el-icon-document',
    description: '展示当前作品字段（名称/类型/状态/关键词/原文链接/内容摘要）',
    runtime: 'WorkInfo',
    props: [
      p('fields', '显示字段', 'array', {
        expr: false,
        default: ['name', 'type', 'status', 'keywords', 'source_url', 'content'],
        description: '可选：name/type/status/keywords/source_url/content/remark',
      }),
      p('contentRows', '内容预览行数', 'number', { expr: false, default: 4 }),
    ],
  },
  {
    key: 'step-flow',
    name: '步骤流程条',
    group: '工作流',
    icon: 'el-icon-s-order',
    description: '工作流步骤进度条，可点击切换步骤',
    runtime: 'StepFlow',
    props: [
      p('clickable', '允许点击切换', 'boolean', { expr: false, default: true }),
      p('direction', '方向', 'select', { expr: false, default: 'horizontal', options: ['horizontal', 'vertical'] }),
    ],
  },
  {
    key: 'prompt-template',
    name: '提示词模版区域',
    group: 'AI',
    icon: 'el-icon-edit-outline',
    description: '当前步骤的提示词模版，可编辑保存；保存后重新解析',
    runtime: 'PromptTemplate',
    props: [
      p('value', '提示词（默认取步骤模版）', 'string', { default: '${gb.prompt}' }),
      p('rows', '编辑框行数', 'number', { expr: false, default: 6 }),
      p('editable', '可编辑', 'boolean', { expr: false, default: true }),
      p('showVars', '显示可用变量', 'boolean', { expr: false, default: true }),
      p('tips', '提示文案', 'string', { expr: false, default: '' }),
    ],
  },
  {
    key: 'prompt-preview',
    name: '解析后的提示词区域',
    group: 'AI',
    icon: 'el-icon-view',
    description: '展示 ${...} 解析后的提示词；列表输入时按行展示',
    runtime: 'PromptPreview',
    props: [
      p('prompt', '提示词', 'string', { default: '${gb.prompt}' }),
      p('rows', '列表行（可选）', 'array', { default: '' }),
      p('columns', '列表列（可选）', 'array', { expr: false, default: [] }),
      p('resolveApi', '调用后端解析预览', 'boolean', { expr: false, default: false }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 360 }),
    ],
  },
  {
    key: 'model-selector',
    name: '模型选择',
    group: 'AI',
    icon: 'el-icon-cpu',
    description: '选择模型（文本/图像等），默认展示名称与模型标识',
    runtime: 'ModelSelector',
    props: [
      p('modelValue', '当前模型ID', 'number', { default: '${gb.model_id}' }),
      p('filterModelType', '限定模型类型', 'select', { expr: false, default: '', options: ['', 'text', 'image', 'audio', 'video'] }),
      p('placeholder', '占位提示', 'string', { expr: false, default: '请选择模型' }),
      p('showFormat', '显示端点格式', 'boolean', { expr: false, default: false }),
    ],
  },
  {
    key: 'step-item-table',
    name: '列表数据表格',
    group: '数据',
    icon: 'el-icon-s-grid',
    description: '由 columns 表头驱动的列表表格，支持图片列、可编辑、行选择',
    runtime: 'StepItemTable',
    props: [
      p('items', '数据列表', 'array', { default: '${stepList[0].rsp.items}' }),
      p('columns', '表头', 'array', { expr: false, default: [{ key: 'name', title: '名称' }, { key: 'description', title: '描述' }, { key: 'image', title: '图片' }] }),
      p('editable', '可编辑', 'boolean', { expr: false, default: false }),
      p('selectable', '可勾选', 'boolean', { expr: false, default: false }),
      p('showRaw', '显示原始JSON', 'boolean', { expr: false, default: false }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 460 }),
    ],
  },
  {
    key: 'image-grid',
    name: '图片网格',
    group: '数据',
    icon: 'el-icon-picture-outline',
    description: '按网格展示一组图片（角色图/分镜图/产出图）',
    runtime: 'ImageGrid',
    props: [
      p('images', '图片列表', 'array', { default: '${stepList[0].rsp.images}' }),
      p('columns', '每行列数', 'number', { expr: false, default: 4 }),
      p('size', '缩略图尺寸(px)', 'number', { expr: false, default: 160 }),
      p('showIndex', '显示序号', 'boolean', { expr: false, default: true }),
    ],
  },
  {
    key: 'image-upload',
    name: '图片/文件上传',
    group: '数据',
    icon: 'el-icon-upload2',
    description: '上传文件到项目级存储，返回本地链接',
    runtime: 'ImageUpload',
    props: [
      p('label', '按钮文案', 'string', { expr: false, default: '上传文件' }),
      p('accept', '接受类型', 'string', { expr: false, default: 'image/*' }),
      p('subDir', '存储子目录', 'string', { expr: false, default: 'uploads' }),
      p('bindTo', '回填变量名（可选）', 'string', { expr: false, default: '' }),
    ],
  },
  {
    key: 'json-viewer',
    name: 'JSON 查看',
    group: '数据',
    icon: 'el-icon-document-copy',
    description: '只读展示 JSON 结构',
    runtime: 'JsonViewer',
    props: [
      p('value', '数据', 'json', { default: '${gb}' }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 320 }),
      p('collapsed', '默认折叠', 'boolean', { expr: false, default: false }),
    ],
  },
  {
    key: 'json-editor',
    name: 'JSON 编辑',
    group: '数据',
    icon: 'el-icon-edit',
    description: '编辑 JSON（用于作品参数、变量映射、步骤配置等）',
    runtime: 'JsonEditor',
    props: [
      p('value', '初始值', 'json', { default: '' }),
      p('rows', '行数', 'number', { expr: false, default: 8 }),
      p('placeholder', '占位提示', 'string', { expr: false, default: '请输入 JSON' }),
    ],
  },
  {
    key: 'text-panel',
    name: '文本面板',
    group: '数据',
    icon: 'el-icon-tickets',
    description: '展示长文本，支持纯文本 / Markdown',
    runtime: 'TextPanel',
    props: [
      p('text', '内容', 'string', { default: '${stepList[0].rsp.content}' }),
      p('format', '格式', 'select', { expr: false, default: 'text', options: ['text', 'markdown'] }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 400 }),
      p('editable', '可编辑', 'boolean', { expr: false, default: false }),
    ],
  },
  {
    key: 'request-preview',
    name: '请求报文预览',
    group: '调试',
    icon: 'el-icon-s-promotion',
    description: '展示即将发送的 HTTP 请求（method/url/headers/query/body）',
    runtime: 'RequestPreview',
    props: [
      p('request', '请求对象', 'json', { default: '${gb.request}' }),
      p('showHeaders', '显示请求头', 'boolean', { expr: false, default: true }),
    ],
  },
  {
    key: 'response-panel',
    name: '执行结果',
    group: '调试',
    icon: 'el-icon-finished',
    description: '展示步骤的请求报文、提取结果、原始响应',
    runtime: 'ResponsePanel',
    props: [
      p('reqData', '请求报文', 'json', { default: '' }),
      p('rspData', '提取结果', 'json', { default: '' }),
      p('rawRsp', '原始响应', 'string', { default: '' }),
      p('output', '文本产出', 'string', { default: '' }),
    ],
  },
  {
    key: 'run-button',
    name: '执行按钮',
    group: '动作',
    icon: 'el-icon-video-play',
    description: '执行当前步骤 / 重置步骤，带运行状态与前置校验',
    runtime: 'RunButton',
    props: [
      p('label', '按钮文案', 'string', { expr: false, default: '执行本步骤' }),
      p('showReset', '显示重置', 'boolean', { expr: false, default: true }),
      p('showCancel', '显示中止', 'boolean', { expr: false, default: true }),
      p('confirm', '二次确认', 'boolean', { expr: false, default: false }),
    ],
  },
  {
    key: 'batch-toolbar',
    name: '批量生成工具条',
    group: '动作',
    icon: 'el-icon-magic-stick',
    description: '批量对列表项执行同一动作（角色生图 / 分镜生图）',
    runtime: 'BatchToolbar',
    props: [
      p('selected', '选中的行', 'array', { default: '' }),
      p('label', '按钮文案', 'string', { expr: false, default: '批量生成' }),
      p('hint', '提示文案', 'string', { expr: false, default: '' }),
    ],
  },
  {
    key: 'interface-param-tree',
    name: '接口参数树',
    group: '配置',
    icon: 'el-icon-set-up',
    description: '接口输入/输出参数树编辑器（含文件类型列）',
    runtime: 'InterfaceParamTree',
    props: [
      p('params', '参数列表', 'array', { default: '' }),
      p('readonly', '只读', 'boolean', { expr: false, default: false }),
      p('direction', '方向', 'select', { expr: false, default: 'both', options: ['both', 'input', 'output'] }),
    ],
  },
  {
    key: 'row-selector',
    name: '选择列表行',
    group: '数据',
    icon: 'el-icon-finished',
    description: '从前置步骤的列表输出里勾选要处理的行（如角色列表），执行时只对勾选行循环调用接口',
    runtime: 'RowSelector',
    props: [
      p('source', '列表来源', 'array', { default: '${stepList[0].rsp.items}', description: '如 ${stepList[0].rsp.items}' }),
      p('label', '标题', 'string', { expr: false, default: '选择要处理的行' }),
      p('nameField', '名称字段', 'string', { expr: false, default: 'name' }),
      p('descField', '描述字段', 'string', { expr: false, default: 'desc' }),
      p('imageField', '图片字段', 'string', { expr: false, default: 'image_url' }),
      p('showImage', '显示参考图', 'boolean', { expr: false, default: true }),
      p('defaultSelectAll', '默认全选', 'boolean', { expr: false, default: true }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 360 }),
      p('columns', '自定义列', 'array', {
        expr: false,
        default: [],
        description: '留空用「名称/参考图/描述」；可传 [{key,title,width,type:"image"}]',
      }),
    ],
  },
  {
    key: 'image-mode-switch',
    name: '已有图片处理',
    group: '数据',
    icon: 'el-icon-refresh',
    description: '图片步骤的已有图片处理方式：覆盖（重新生成）或保留（已有图的行不调接口）',
    runtime: 'ImageModeSwitch',
    props: [
      p('label', '标题', 'string', { expr: false, default: '已有图片处理' }),
      p('defaultMode', '默认方式', 'select', {
        expr: false,
        default: 'overwrite',
        options: ['overwrite', 'keep'],
      }),
      p('configurable', '允许切换', 'boolean', { expr: false, default: true }),
    ],
  },
  {
    key: 'comic-reader',
    name: '漫画成品页',
    group: '数据',
    icon: 'el-icon-reading',
    description: '把「最终成图」的画面与「分镜生成」的台词组装成漫画页，右上角可下载为图片',
    runtime: 'ComicReader',
    props: [
      p('images', '画面来源', 'array', { default: '${stepList[3].rsp.items}', description: '如 ${stepList[3].rsp.items}（最终成图）' }),
      p('scenes', '分镜来源', 'array', { default: '${stepList[2].rsp.items}', description: '如 ${stepList[2].rsp.items}（分镜，含台词）' }),
      p('title', '标题', 'string', { default: '${gb.name}' }),
      p('columns', '每行列数', 'number', { expr: false, default: 2 }),
      p('sheetWidth', '画布宽度(px)', 'number', { expr: false, default: 1200 }),
      p('gap', '格子间距(px)', 'number', { expr: false, default: 18 }),
      p('showCaption', '显示页/格标注', 'boolean', { expr: false, default: false }),
      p('layout', '默认排版', 'select', {
        expr: false,
        default: 'grid',
        options: ['grid', 'single', 'strip', 'mosaic'],
        description: 'grid=一页多格 / single=一页一格 / strip=拼接条漫 / mosaic=拼贴整页',
      }),
      p('showLayoutSwitch', '允许切换排版', 'boolean', { expr: false, default: true }),
      p('filePattern', '导出文件名', 'string', {
        expr: false,
        default: '{index:3}-{label}',
        description: '占位符：{index} / {index:3} / {page} / {label}',
      }),
    ],
  },
  {
    key: 'step-images',
    name: '本步产出图片',
    group: '数据',
    icon: 'el-icon-picture',
    description: '展示当前步骤生成的图片（直接读取该步执行结果，不依赖页面上下文）',
    runtime: 'StepImages',
    props: [
      p('label', '标题', 'string', { expr: false, default: '本步产出图片' }),
      p('columns', '每行列数', 'number', { expr: false, default: 4 }),
      p('size', '缩略图尺寸(px)', 'number', { expr: false, default: 180 }),
      p('showIndex', '显示序号', 'boolean', { expr: false, default: true }),
      p('nameField', '名称字段', 'string', { expr: false, default: 'name' }),
      p('labelFields', '标签字段', 'array', {
        expr: false,
        default: [],
        description: '按字段拼标签，如 ["page","panel"] → 1-2；留空用名称字段',
      }),
    ],
  },
  {
    key: 'step-items',
    name: '本步列表产出',
    group: '数据',
    icon: 'el-icon-s-grid',
    description: '展示当前步骤解析出的列表（如角色列表、分镜列表）',
    runtime: 'StepItems',
    props: [
      p('label', '标题', 'string', { expr: false, default: '本步列表产出' }),
      p('columns', '表头', 'array', { expr: false, default: [] , description: '留空按首行字段自动推导' }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 420 }),
      p('showRaw', '显示原始JSON', 'boolean', { expr: false, default: false }),
    ],
  },
  {
    key: 'asset-list',
    name: '资产列表',
    group: '配置',
    icon: 'el-icon-collection',
    description: '展示资产管理中的预设变量',
    runtime: 'AssetList',
    props: [
      p('keyword', '过滤关键字', 'string', { expr: false, default: '' }),
      p('maxHeight', '最大高度(px)', 'number', { expr: false, default: 320 }),
    ],
  },
];

export const BUILTIN_BY_KEY = Object.fromEntries(BUILTIN_COMPONENTS.map((c) => [c.key, c]));

export const COMPONENT_GROUPS = [...new Set(BUILTIN_COMPONENTS.map((c) => c.group))];

/** 组件 key 是否内置 */
export function isBuiltinKey(key) {
  return Boolean(BUILTIN_BY_KEY[key]);
}

/** 生成一个组件的默认 props（页面搭建时新增实例用） */
export function defaultProps(meta) {
  const out = {};
  for (const prop of meta.props || []) {
    out[prop.name] = prop.default;
  }
  return out;
}
