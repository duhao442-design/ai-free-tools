/**
 * 把「多个工作流步骤共用一个页面」拆成「每步一个页面」，并把执行配置（模型/接口/提示词/输入输出）
 * 从步骤搬到页面的 execution 上。
 *
 *   node scripts/split-workflow-pages.js            # 默认应用数据目录
 *   node scripts/split-workflow-pages.js --data-dir <dir> --dry
 *
 * 拆分后：
 *   页面.execution = { model_id, interface_id, input_type, output_type, input_value, prompt,
 *                      model_input_value, model_output_value, settings }
 *   工作流步骤    = { id, name, page_id }
 */
import path from 'node:path';
import os from 'node:os';
import { openDatabase, now } from '../server/db/index.js';
import { normalizeContextConfig, DEFAULT_CONTEXT_CONFIG } from '../server/core/pageContext.js';

function defaultDataDir() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'ai-free-tools', 'data');
}

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const dataDir = arg('data-dir', process.env.AIFT_DATA_DIR || defaultDataDir());
const dryRun = has('dry');

const db = await openDatabase({ dataDir });
console.log(`数据目录: ${dataDir}${dryRun ? '（dry-run，不写库）' : ''}\n`);

const parse = (v, fallback) => {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch (e) {
    return fallback;
  }
};

const uid = () => Math.random().toString(36).slice(2, 8);

function layoutFor(outputType, stamp, { inputType, inputValue } = {}) {
  const title = { id: `blk-${stamp}-1`, component: 'page-title', props: { text: '${gb.step_name}', subtitle: '第 ${gb.step_index} 步', size: 'medium' } };
  const prompt = { id: `blk-${stamp}-2`, component: 'prompt-template', props: { value: '${gb.prompt}', rows: 8, editable: true, showVars: true } };
  const preview = { id: `blk-${stamp}-3`, component: 'prompt-preview', props: { prompt: '${gb.prompt}', resolveApi: true, maxHeight: 320 } };
  const runBtn = { id: `blk-${stamp}-4`, component: 'run-button', props: { label: '执行本步骤', showReset: true } };
  const result = { id: `blk-${stamp}-7`, component: 'response-panel', props: { reqData: '', rspData: '', rawRsp: '', output: '' } };
  const selector = {
    id: `blk-${stamp}-0`,
    component: 'row-selector',
    props: {
      source: inputValue || '${stepList[0].rsp.items}',
      label: '选择要处理的行',
      nameField: 'name',
      descField: 'desc',
      imageField: 'image_url',
      showImage: true,
      defaultSelectAll: false,
      maxHeight: 320,
    },
  };
  const modeSwitch = {
    id: `blk-${stamp}-8`,
    component: 'image-mode-switch',
    props: { label: '已有图片处理', defaultMode: 'overwrite' },
  };
  const head = inputType === 'list' ? [title, selector, prompt, preview, runBtn] : [title, prompt, preview, runBtn];
  if (outputType === 'image') head.splice(head.length - 1, 0, modeSwitch);
  if (outputType === 'image') {
    return [
      ...head,
      { id: `blk-${stamp}-5`, component: 'step-images', props: { label: '本步产出图片', columns: 4, size: 180, showIndex: true } },
      { id: `blk-${stamp}-6`, component: 'step-items', props: { label: '本步列表产出', columns: [], maxHeight: 380 }, span: 12 },
      result,
    ];
  }
  if (outputType === 'list') {
    return [
      ...head,
      { id: `blk-${stamp}-5`, component: 'step-items', props: { label: '本步列表产出', columns: [], maxHeight: 460 } },
      { id: `blk-${stamp}-6`, component: 'step-images', props: { label: '本步产出图片', columns: 4, size: 160 }, span: 12 },
      result,
    ];
  }
  return [...head, result];
}

function executionFromStep(step) {
  const settings = { columns: [], maxRows: 0, rowOffset: 0, image_ref: { from: '', matchField: 'role', nameField: 'name' }, ...(step.settings || {}) };
  if (!Array.isArray(settings.columns)) settings.columns = [];
  if (!settings.image_ref || typeof settings.image_ref !== 'object') settings.image_ref = { from: '', matchField: 'role', nameField: 'name' };
  return {
    model_id: step.model_id ?? null,
    interface_id: step.interface_id ?? null,
    input_type: step.input_type || 'none',
    output_type: step.output_type || 'none',
    input_value: step.input_value || '',
    prompt: step.prompt || '',
    model_input_value: step.model_input_value ?? null,
    model_output_value: step.model_output_value ?? null,
    settings,
  };
}

const workflows = db.all('SELECT * FROM workflow ORDER BY id');
let createdPages = 0;
let updatedSteps = 0;
const removedPages = [];

for (const wf of workflows) {
  const steps = parse(wf.steps, []);
  if (!Array.isArray(steps) || !steps.length) continue;

  const nextSteps = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const oldPage = step.page_id ? db.get('SELECT * FROM page WHERE id = ?', [step.page_id]) : null;
    const oldExec = oldPage ? parse(oldPage.execution, null) : null;

    // 页面已独享且已有 execution：保持不变
    const usage = db.all('SELECT id, steps FROM workflow').filter((w) => {
      const list = parse(w.steps, []);
      return Array.isArray(list) && list.filter((s) => s.page_id === step.page_id).length > 0;
    });
    const stepCountOnPage = usage.reduce((n, w) => {
      const list = parse(w.steps, []);
      return n + (Array.isArray(list) ? list.filter((s) => s.page_id === step.page_id).length : 0);
    }, 0);

    const execution = oldExec || executionFromStep(step);
    const name = step.name || (oldPage && oldPage.name) || `步骤 ${i + 1}`;

    if (oldPage && stepCountOnPage === 1 && oldExec) {
      // 已经是独享页面：只确保步骤不再带执行字段
      nextSteps.push({ id: step.id, name, page_id: step.page_id });
      continue;
    }

    const stamp = `${Date.now()}-${uid()}`;
    // 按该步的输出类型生成合适的页面布局（列表步看表格、图片步看图、文本步看结果）
    const layout = layoutFor(execution.output_type, stamp, {
      inputType: execution.input_type,
      inputValue: execution.input_value,
    });
    const contextConfig = oldPage
      ? parse(oldPage.context_config, DEFAULT_CONTEXT_CONFIG)
      : DEFAULT_CONTEXT_CONFIG;

    const ts = now();
    let pageId = step.page_id;
    if (!dryRun) {
      const res = db.run(
        `INSERT INTO page (name, description, layout, context_config, execution, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          name,
          `工作流「${wf.name}」第 ${i + 1} 步：${name}`,
          JSON.stringify(layout),
          JSON.stringify(normalizeContextConfig(contextConfig)),
          JSON.stringify(execution),
          ts,
          ts,
        ],
      );
      pageId = res.lastId;
    }
    createdPages += 1;
    nextSteps.push({ id: step.id, name, page_id: pageId });
    console.log(`  [${wf.name}] 第 ${i + 1} 步「${name}」 → 新页面 ${dryRun ? '(dry)' : pageId}`);
  }

  if (!dryRun) {
    db.run('UPDATE workflow SET steps = ?, updated_at = ? WHERE id = ?', [JSON.stringify(nextSteps), now(), wf.id]);
  }
  updatedSteps += nextSteps.length;

  // 清理不再被引用的旧页面
  if (!dryRun) {
    const referenced = new Set(
      db.all('SELECT steps FROM workflow').flatMap((w) =>
        parse(w.steps, []).map((s) => s.page_id).filter(Boolean),
      ),
    );
    for (const p of db.all('SELECT id, name FROM page')) {
      if (!referenced.has(p.id)) {
        db.run('DELETE FROM page WHERE id = ?', [p.id]);
        removedPages.push(`#${p.id} ${p.name}`);
      }
    }
  }
}

db.close();
console.log(`\n完成：新建页面 ${createdPages} 个，更新步骤 ${updatedSteps} 个`);
if (removedPages.length) console.log(`清理未引用页面：${removedPages.join('、')}`);
