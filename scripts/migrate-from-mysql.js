/**
 * 一次性迁移：旧项目 MySQL（aitools） → 新项目 SQLite（ai-free-tools）
 *
 * 用法：
 *   node scripts/migrate-from-mysql.js --data-dir "C:\path\to\data"
 *   node scripts/migrate-from-mysql.js --data-dir ... --mysql-host 127.0.0.1 --mysql-user root --mysql-password xxx --mysql-database aitools
 *   node scripts/migrate-from-mysql.js --data-dir ... --truncate     # 先清空目标表再导入
 *
 * 迁移内容：
 *   model_config        → model_config（字段完全一致）
 *   interface_config    → interface_config（params 递归补 file_type="none"）
 *   asset               → asset
 *   skill               → 跳过（新架构以组件/页面承载，不再有 function calling 技能表）
 *   template + step     → workflow + steps（每个模板生成一个通用页面并绑定到所有步骤）
 *   step_config         → 步骤的 input_columns/output_columns 写入 step.settings.columns
 *   work                → work（template_id → workflow_id）
 *   work_step_result    → work_step（按 step_order 对齐）
 *   work_step_item / work_character → work_artifact（图片产物）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mysql from 'mysql2/promise';
import { openDatabase } from '../server/db/index.js';
import { bootstrap } from '../server/db/bootstrap.js';

/* ---------------- 参数 ---------------- */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

/** 与应用保持一致：%APPDATA%/ai-free-tools/data */
function defaultDataDir() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'ai-free-tools', 'data');
}

const dataDir = args['data-dir'] || process.env.AIFT_DATA_DIR || defaultDataDir();
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const mysqlConfig = {
  host: args['mysql-host'] || process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(args['mysql-port'] || process.env.MYSQL_PORT || 3306),
  user: args['mysql-user'] || process.env.MYSQL_USER || 'root',
  password: args['mysql-password'] || process.env.MYSQL_PASSWORD || '',
  database: args['mysql-database'] || process.env.MYSQL_DATABASE || 'aitools',
  dateStrings: true,
  charset: 'utf8mb4',
};

const TRUNCATE = args.truncate === true;
const nowIso = () => new Date().toISOString();
const toIso = (v) => {
  if (!v) return nowIso();
  if (v instanceof Date) return v.toISOString();
  const s = String(v).replace(' ', 'T');
  return s.length === 19 ? `${s}.000Z`.replace('T', 'T') : s;
};

/* ---------------- 旧图片文件搬迁 ---------------- */
// 旧项目把生成图存在 backend/generated_images，URL 形如 images/2026-09-07/x.png
const imageCandidates = [
  args['images-dir'],
  path.join(process.cwd(), '..', 'aitools', 'backend', 'generated_images'),
  path.join(process.cwd(), 'aitools', 'backend', 'generated_images'),
  'D:\\workspace\\pythonwork\\server\\aitools\\backend\\generated_images',
].filter(Boolean);
const oldImagesDir = imageCandidates.find((p) => p && fs.existsSync(p)) || null;
const copiedImages = new Set();

/**
 * 把旧图片 URL 映射为新项目的本地链接，并复制文件：
 *   images/2026-09-07/x.png -> /files/images/2026-09-07/x.png
 * 外部链接（https://…）原样保留。
 */
function mapImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const m = String(url).match(/(?:^|\/)images\/(.+)$/);
  if (!m) return url;
  const rel = m[1];
  if (!oldImagesDir) return url;
  const src = path.join(oldImagesDir, rel);
  if (!fs.existsSync(src)) return url;
  const dest = path.join(dataDir, 'files', 'images', rel);
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    copiedImages.add(rel);
  } catch (e) {
    return url;
  }
  return `/files/images/${rel.split(path.sep).join('/')}`;
}

function mapImageList(list) {
  if (!Array.isArray(list)) return list;
  return list.map((u) => mapImageUrl(u));
}

/** 把响应结构里的图片字段（images / items[].image_url / image）也映射成本地链接 */
function mapRspData(rsp) {
  if (!rsp || typeof rsp !== 'object') return rsp;
  const out = Array.isArray(rsp) ? [...rsp] : { ...rsp };
  if (Array.isArray(out.images)) out.images = mapImageList(out.images);
  if (typeof out.image === 'string') out.image = mapImageUrl(out.image);
  if (typeof out.image_url === 'string') out.image_url = mapImageUrl(out.image_url);
  if (Array.isArray(out.items)) {
    out.items = out.items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const copy = { ...it };
      for (const k of ['image', 'image_url', 'imageUrl']) {
        if (typeof copy[k] === 'string') copy[k] = mapImageUrl(copy[k]);
      }
      return copy;
    });
  }
  return out;
}

/* ---------------- 参数树补 file_type ---------------- */
function normalizeParamTree(list) {
  return (list || []).map((p) => ({
    param_type: p.param_type || 'input',
    param_name: p.param_name,
    value_type: p.value_type || 'string',
    file_type: p.file_type || 'none',
    description: p.description || '',
    validate_rule: p.validate_rule || null,
    param_value: p.param_value === undefined ? null : p.param_value,
    children: normalizeParamTree(p.children || []),
  }));
}

/* ---------------- 主流程 ---------------- */
const stats = {
  model_config: 0, interface_config: 0, asset: 0, workflow: 0, workflow_step: 0,
  page: 0, work: 0, work_step: 0, artifact: 0, skipped: [],
};

const conn = await mysql.createConnection(mysqlConfig);
console.log(`[migrate] 已连接 MySQL ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);

const db = await openDatabase({ dataDir });
// 迁移场景默认不写示例数据；需要示例可加 --with-demo
bootstrap(db, { seedDemo: args['with-demo'] === true });

if (TRUNCATE) {
  for (const t of ['work_artifact', 'work_step', 'work', 'workflow', 'page', 'asset', 'interface_config', 'model_config']) {
    db.run(`DELETE FROM ${t}`);
  }
  // 重置自增序列，保证迁移后 ID 从 1 开始（数据更干净，便于对照）
  try {
    db.run(
      `DELETE FROM sqlite_sequence WHERE name IN
        ('work','work_step','work_artifact','workflow','page','asset','interface_config','model_config')`,
    );
  } catch (e) {
    /* sqlite_sequence 不存在时忽略 */
  }
  console.log('[migrate] 已清空目标表');
}

async function safeQuery(sql, label) {
  try {
    const [rows] = await conn.query(sql);
    return rows;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      stats.skipped.push(`${label}（表不存在）`);
      return [];
    }
    throw e;
  }
}

/* 1. 模型 */
const models = await safeQuery('SELECT * FROM model_config', 'model_config');
const modelIdMap = new Map();
for (const m of models) {
  const ts = toIso(m.created_at);
  const { lastId } = db.run(
    `INSERT INTO model_config (name, provider, model_type, format_type, model_name, base_url, api_key,
      is_relay, is_active, remark, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.name, m.provider || 'openai', m.model_type || 'text', m.format_type || null,
      m.model_name || '', m.base_url || '', m.api_key || '',
      m.is_relay ? 1 : 0, m.is_active === 0 ? 0 : 1, m.remark || '', ts, toIso(m.updated_at),
    ],
  );
  modelIdMap.set(m.id, lastId);
  stats.model_config += 1;
}

/* 2. 接口 */
const interfaces = await safeQuery('SELECT * FROM interface_config', 'interface_config');
const interfaceIdMap = new Map();
for (const it of interfaces) {
  let params = [];
  try {
    params = typeof it.params === 'string' ? JSON.parse(it.params) : it.params || [];
  } catch (e) {
    params = [];
  }
  const { lastId } = db.run(
    `INSERT INTO interface_config (name, description, format_type, params, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      it.name, it.description || '', it.format_type || null,
      JSON.stringify(normalizeParamTree(params)),
      it.is_active === 0 ? 0 : 1, toIso(it.created_at), toIso(it.updated_at),
    ],
  );
  interfaceIdMap.set(it.id, lastId);
  stats.interface_config += 1;
}

/* 3. 资产 */
const assets = await safeQuery('SELECT * FROM asset', 'asset');
const assetKeys = new Set();
for (const a of assets) {
  if (assetKeys.has(a.key)) continue;
  db.run(
    'INSERT INTO asset (key, value, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [a.key, a.value ?? '', a.description || '', toIso(a.created_at), toIso(a.updated_at)],
  );
  assetKeys.add(a.key);
  stats.asset += 1;
}

/* 4. 步骤配置（用于列定义） */
const stepConfigs = await safeQuery('SELECT * FROM step_config', 'step_config');
const stepConfigMap = new Map(stepConfigs.map((s) => [s.id, s]));

/* 5. 模板 → 工作流 + 页面 */
const templates = await safeQuery('SELECT * FROM template', 'template');
const templateSteps = await safeQuery('SELECT * FROM template_step ORDER BY template_id, step_order', 'template_step');
const workflowIdMap = new Map();
const templateStepIdMap = new Map(); // old template_step.id -> {workflowId, stepOrder}

const parseJsonField = (v, fallback) => {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch (e) {
    return fallback;
  }
};

for (const t of templates) {
  const oldSteps = templateSteps.filter((s) => s.template_id === t.id);
  const ts = toIso(t.created_at);

  // 每个旧步骤各生成一个页面（页面承载执行配置：模型/接口/提示词/输入输出）
  const contextConfig = JSON.stringify({
    providers: [
      { id: 'work', type: 'builtin', kind: 'work', enabled: true },
      { id: 'assets', type: 'builtin', kind: 'assets', enabled: true },
      { id: 'params', type: 'builtin', kind: 'params', enabled: true },
      { id: 'steps', type: 'builtin', kind: 'stepList', enabled: true },
    ],
    variableMapping: parseJsonField(t.variable_mapping, {}),
  });

  const steps = oldSteps.map((s) => {
    const cfg = s.step_config_id ? stepConfigMap.get(s.step_config_id) : null;
    const columns = cfg
      ? (cfg.output_type === 'list' ? parseJsonField(cfg.output_columns, []) : parseJsonField(cfg.input_columns, []))
      : [];
    const outputType = (cfg && cfg.output_type) || s.output_type || 'none';
    const execution = {
      model_id: s.model_id ? modelIdMap.get(s.model_id) || null : null,
      interface_id: s.interface_id ? interfaceIdMap.get(s.interface_id) || null : null,
      input_type: (cfg && cfg.input_type) || s.input_type || 'none',
      output_type: outputType,
      input_value: s.input_value || '',
      prompt: s.prompt || '',
      model_input_value: parseJsonField(s.model_input_value, null),
      model_output_value: parseJsonField(s.model_output_value, null),
      settings: {
        columns,
        maxRows: 0,
        rowOffset: 0,
        image_ref: { from: '', matchField: 'role', nameField: 'name' },
        migrated_from_step_config: s.step_config_id || null,
      },
    };

    const stamp = `${Date.now()}-${s.id}`;
    const base = [
      { id: `blk-${stamp}-1`, component: 'page-title', props: { text: '${gb.step_name}', subtitle: '第 ${gb.step_index} 步', size: 'medium' } },
      { id: `blk-${stamp}-2`, component: 'prompt-template', props: { value: '${gb.prompt}', rows: 8, editable: true, showVars: true } },
      { id: `blk-${stamp}-3`, component: 'prompt-preview', props: { prompt: '${gb.prompt}', resolveApi: true, maxHeight: 320 } },
    ];
    // 列表输入的步骤：先给出「选择列表行」，勾选后按行循环执行
    if (execution.input_type === 'list') {
      base.push({
        id: `blk-${stamp}-0`,
        component: 'row-selector',
        props: {
          source: execution.input_value || '${stepList[0].rsp.items}',
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
    base.push({ id: `blk-${stamp}-4`, component: 'run-button', props: { label: '执行本步骤', showReset: true } });
    if (outputType === 'image') {
      base.splice(base.length - 1, 0, {
        id: `blk-${stamp}-9`,
        component: 'image-mode-switch',
        props: { label: '已有图片处理', defaultMode: 'overwrite' },
      });
    }
    if (outputType === 'image') {
      base.push(
        { id: `blk-${stamp}-5`, component: 'step-images', props: { label: '本步产出图片', columns: 4, size: 180, showIndex: true } },
        { id: `blk-${stamp}-6`, component: 'step-items', props: { label: '本步列表产出', columns: [], maxHeight: 380 }, span: 12 },
      );
    } else if (outputType === 'list') {
      base.push(
        { id: `blk-${stamp}-5`, component: 'step-items', props: { label: '本步列表产出', columns: [], maxHeight: 460 } },
        { id: `blk-${stamp}-6`, component: 'step-images', props: { label: '本步产出图片', columns: 4, size: 160 }, span: 12 },
      );
    }
    base.push({ id: `blk-${stamp}-7`, component: 'response-panel', props: { reqData: '', rspData: '', rawRsp: '', output: '' } });

    const page = db.run(
      `INSERT INTO page (name, description, layout, context_config, execution, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        s.name,
        `由旧模板「${t.name}」第 ${s.step_order} 步迁移生成`,
        JSON.stringify(base),
        contextConfig,
        JSON.stringify(execution),
        ts,
        toIso(t.updated_at),
      ],
    );
    stats.page += 1;

    return { id: `step-${t.id}-${s.id}`, name: s.name, page_id: page.lastId };
  });

  const wf = db.run(
    `INSERT INTO workflow (name, description, type, steps, variable_mapping, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `（迁移）${t.name}`,
      t.description || '',
      t.type || 'comic',
      JSON.stringify(steps),
      JSON.stringify(parseJsonField(t.variable_mapping, {})),
      t.is_active === 0 ? 0 : 1,
      ts,
      toIso(t.updated_at),
    ],
  );
  workflowIdMap.set(t.id, wf.lastId);
  oldSteps.forEach((oldStep, i) => {
    templateStepIdMap.set(oldStep.id, { workflowId: wf.lastId, stepOrder: i + 1 });
  });
  stats.workflow += 1;
  stats.workflow_step += steps.length;
}

/* 6. 作品 */
const works = await safeQuery('SELECT * FROM work', 'work');
const workIdMap = new Map();
for (const w of works) {
  const ts = toIso(w.created_at);
  const { lastId } = db.run(
    `INSERT INTO work (name, type, workflow_id, status, params, content, source_url, keywords, remark, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      w.name, w.type || 'comic',
      w.template_id ? workflowIdMap.get(w.template_id) || null : null,
      w.status || 'draft',
      JSON.stringify({}),
      w.content || '',
      w.source_url || '',
      w.keywords || '',
      w.remark || '',
      ts,
      toIso(w.updated_at),
    ],
  );
  workIdMap.set(w.id, lastId);
  stats.work += 1;
}

/* 7. 步骤执行结果 */
const results = await safeQuery('SELECT * FROM work_step_result', 'work_step_result');
for (const r of results) {
  const newWorkId = workIdMap.get(r.work_id);
  if (!newWorkId) continue;
  const mapped = templateStepIdMap.get(r.step_id);
  const stepOrder = mapped ? mapped.stepOrder : r.step_order;
  const ts = toIso(r.created_at);
  db.run(
    `INSERT INTO work_step (work_id, step_order, page_id, name, status, req_data, rsp_data, raw_rsp,
       output, images, message, started_at, finished_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newWorkId, stepOrder, null,
      mapped ? `步骤 ${stepOrder}` : `步骤 ${stepOrder}`,
      r.status || 'pending',
      r.req_data ? JSON.stringify(parseJsonField(r.req_data, null)) : null,
      r.rsp_data ? JSON.stringify(mapRspData(parseJsonField(r.rsp_data, null))) : null,
      r.raw_rsp || '',
      r.output || '',
      JSON.stringify(mapImageList(parseJsonField(r.images, []))),
      r.message || '',
      r.created_at ? ts : null,
      r.updated_at ? toIso(r.updated_at) : null,
      ts,
      toIso(r.updated_at),
    ],
  );
  stats.work_step += 1;
}

/* 8. 产物（角色图/分镜图） */
const characters = await safeQuery('SELECT * FROM work_character', 'work_character');
for (const c of characters) {
  const newWorkId = workIdMap.get(c.work_id);
  if (!newWorkId || !c.image_url) continue;
  db.run(
    `INSERT INTO work_artifact (work_id, step_order, name, type, url, meta, created_at)
     VALUES (?, ?, ?, 'image', ?, ?, ?)`,
    [newWorkId, null, c.name, mapImageUrl(c.image_url), JSON.stringify({ source: 'work_character' }), toIso(c.created_at)],
  );
  stats.artifact += 1;
}

const items = await safeQuery('SELECT * FROM work_step_item', 'work_step_item');
for (const it of items) {
  const newWorkId = workIdMap.get(it.work_id);
  if (!newWorkId || !it.image_url) continue;
  db.run(
    `INSERT INTO work_artifact (work_id, step_order, name, type, url, meta, created_at)
     VALUES (?, ?, ?, 'image', ?, ?, ?)`,
    [newWorkId, it.step_order, it.name, mapImageUrl(it.image_url), JSON.stringify({ source: 'work_step_item' }), toIso(it.created_at)],
  );
  stats.artifact += 1;
}

await conn.end();
db.close();

stats.images = copiedImages.size;

console.log('\n[migrate] 完成：');
for (const [k, v] of Object.entries(stats)) {
  if (k === 'skipped') continue;
  console.log(`  ${k.padEnd(18)} ${v}`);
}
if (stats.skipped.length) console.log(`  跳过：${stats.skipped.join('；')}`);
console.log(`\n[migrate] 目标数据目录：${dataDir}`);
console.log('[migrate] 提示：迁移前请先关闭正在运行的 AI Free Tools，避免数据库文件被占用。');

