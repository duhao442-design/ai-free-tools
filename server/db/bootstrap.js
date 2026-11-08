/** 初始化：默认设置 + 首次启动的示例页面 / 工作流 */
import { now } from './index.js';
import { normalizeStorageConfig } from '../core/storage/index.js';
import { DEFAULT_CONTEXT_CONFIG } from '../core/pageContext.js';

function seedSetting(db, key, value) {
  const exists = db.get('SELECT key FROM app_setting WHERE key = ?', [key]);
  if (exists) return;
  db.run('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)', [
    key,
    JSON.stringify(value),
    now(),
  ]);
}

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

function page1Layout() {
  return [
    { id: uid('blk'), component: 'page-title', props: { text: '${gb.name}', subtitle: '作品概览', size: 'medium' } },
    { id: uid('blk'), component: 'work-info', props: { fields: ['name', 'type', 'status', 'keywords', 'source_url', 'content'], contentRows: 4 } },
    { id: uid('blk'), component: 'divider', props: { text: '上下文（页面加载时由后端产出）', position: 'left' } },
    { id: uid('blk'), component: 'json-viewer', props: { value: '${gb}', maxHeight: 320 } },
  ];
}

function page2Layout() {
  return [
    { id: uid('blk'), component: 'page-title', props: { text: '${gb.step_name}', subtitle: '步骤 ${gb.step_index}', size: 'medium' } },
    { id: uid('blk'), component: 'prompt-template', props: { value: '${gb.prompt}', rows: 8, editable: true, showVars: true } },
    { id: uid('blk'), component: 'prompt-preview', props: { prompt: '${gb.prompt}', resolveApi: true, maxHeight: 360 } },
    { id: uid('blk'), component: 'run-button', props: { label: '执行本步骤', showReset: true } },
    { id: uid('blk'), component: 'response-panel', props: { reqData: '', rspData: '', rawRsp: '', output: '' } },
  ];
}

function page3Layout(selectorSource) {
  const head = [
    { id: uid('blk'), component: 'page-title', props: { text: '${gb.step_name}', subtitle: '图片产出', size: 'medium' } },
  ];
  if (selectorSource) {
    head.push({
      id: uid('blk'),
      component: 'row-selector',
      props: {
        source: selectorSource,
        label: '选择要处理的行',
        nameField: 'name',
        descField: 'desc',
        imageField: 'image_url',
        showImage: true,
        defaultSelectAll: false,
        maxHeight: 320,
      },
    });
  }
  return [
    ...head,
    { id: uid('blk'), component: 'image-mode-switch', props: { label: '已有图片处理', defaultMode: 'overwrite' } },
    { id: uid('blk'), component: 'run-button', props: { label: '执行本步骤', showReset: true } },
    { id: uid('blk'), component: 'step-images', props: { label: '本步产出图片', columns: 4, size: 180, showIndex: true } },
    { id: uid('blk'), component: 'response-panel', props: { reqData: '', rspData: '', rawRsp: '', output: '' } },
  ];
}

function page4Layout() {
  return [
    { id: uid('blk'), component: 'page-title', props: { text: '${gb.step_name}', subtitle: '列表产出', size: 'medium' } },
    { id: uid('blk'), component: 'run-button', props: { label: '执行本步骤', showReset: true } },
    { id: uid('blk'), component: 'step-items', props: { label: '本步列表产出', columns: [], maxHeight: 420 } },
    { id: uid('blk'), component: 'response-panel', props: { reqData: '', rspData: '', rawRsp: '', output: '' } },
  ];
}

/**
 * 初始化数据库：默认设置 + 首次启动的示例页面 / 工作流。
 * @param {object} db 数据库实例
 * @param {{seedDemo?: boolean}} [options] seedDemo=false 时只写默认设置（不写示例数据）
 */
export function bootstrap(db, options = {}) {
  const seedDemo = options.seedDemo !== false;
  seedSetting(db, 'storage', normalizeStorageConfig(null));
  seedSetting(db, 'app', { language: 'zh-CN', theme: 'light' });
  if (!seedDemo) return;

  const pageCount = db.get('SELECT COUNT(*) AS c FROM page').c;
  const workflowCount = db.get('SELECT COUNT(*) AS c FROM workflow').c;
  if (pageCount > 0 || workflowCount > 0) return;

  const ts = now();
  const ctx = JSON.stringify({
    ...DEFAULT_CONTEXT_CONFIG,
  });

  // 示例：每个步骤一个页面，执行配置（提示词/输入输出）挂在页面上
  const demo = [
    {
      step: '生成角色设定',
      description: '示例：根据作品内容生成角色设定',
      layout: page2Layout(),
      execution: {
        input_type: 'none',
        output_type: 'none',
        prompt: '请根据作品《${gb.name}》创作角色设定。\n作品内容：${gb.content}\n关键词：${gb.keywords}',
      },
    },
    {
      step: '角色立绘',
      description: '示例：为角色生成立绘',
      layout: page3Layout(),
      execution: { input_type: 'none', output_type: 'image', prompt: '为角色绘制立绘，角色：${step_1_output}' },
    },
    {
      step: '分镜生成',
      description: '示例：把角色设定转成分镜列表',
      layout: page4Layout(),
      execution: { input_type: 'none', output_type: 'list', prompt: '根据角色设定生成分镜列表（JSON 数组）：\n${step_1_output}' },
    },
    {
      step: '分镜生图',
      description: '示例：按分镜逐张出图',
      layout: page3Layout('${stepList[2].rsp.items}'),
      execution: {
        input_type: 'list',
        output_type: 'image',
        input_value: '${stepList[2].rsp.items}',
        prompt: '绘制分镜：${item.name} —— ${item.description}',
      },
    },
    {
      step: '合成结果',
      description: '示例：汇总最终说明',
      layout: page2Layout(),
      execution: { input_type: 'none', output_type: 'none', prompt: '请输出最终创作说明' },
    },
  ];

  const pageIds = [];
  for (const item of demo) {
    const { lastId } = db.run(
      `INSERT INTO page (name, description, layout, context_config, execution, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        item.step,
        item.description,
        JSON.stringify(item.layout),
        ctx,
        JSON.stringify({
          model_id: null,
          interface_id: null,
          input_value: '',
          model_input_value: null,
          model_output_value: null,
          settings: { columns: [], maxRows: 0, rowOffset: 0, image_ref: { from: '', matchField: 'role', nameField: 'name' } },
          ...item.execution,
        }),
        ts,
        ts,
      ],
    );
    pageIds.push(lastId);
  }

  const steps = demo.map((item, i) => ({ id: uid('step'), name: item.step, page_id: pageIds[i] }));
  db.run(
    `INSERT INTO workflow (name, description, type, steps, variable_mapping, is_active, created_at, updated_at)
     VALUES (?, ?, 'comic', ?, ?, 1, ?, ?)`,
    [
      '示例工作流：AI 漫画',
      '演示「页面 → 工作流 → 作品」的流转：每一步展示一个页面，页面之间不传参，数据由后端上下文重建。',
      JSON.stringify(steps),
      JSON.stringify({ content: '作品内容', keywords: '关键词', name: '作品名称' }),
      ts,
      ts,
    ],
  );

  // 独立页面：漫画成品页（把第四步画面与第三步台词组装，支持下载为图片）
  db.run(
    `INSERT INTO page (name, description, layout, context_config, execution, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
    [
      '漫画成品页',
      '把「最终成图」的画面与「分镜生成」的台词组装成漫画页，右上角可下载为图片',
      JSON.stringify([
        { id: uid('blk'), component: 'page-title', props: { text: '${gb.name}', subtitle: '漫画成品', size: 'large' } },
        {
          id: uid('blk'),
          component: 'comic-reader',
          props: {
            images: '${stepList[3].rsp.items}',
            scenes: '${stepList[2].rsp.items}',
            title: '${gb.name}',
            columns: 2,
            sheetWidth: 1200,
            gap: 18,
            showCaption: false,
          },
        },
      ]),
      ctx,
      ts,
      ts,
    ],
  );
}
