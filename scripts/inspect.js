/**
 * 数据体检：启动内嵌服务并打印当前数据目录的概览
 *   node scripts/inspect.js                        # 默认检查应用真实数据目录
 *   node scripts/inspect.js --data-dir <dir>
 */
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../server/index.js';

/** 与 Electron 主进程保持一致：%APPDATA%/ai-free-tools/data */
export function defaultDataDir() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'ai-free-tools', 'data');
}

const argv = process.argv.slice(2);
const idx = argv.indexOf('--data-dir');
const dataDir = idx !== -1 ? argv[idx + 1] : process.env.AIFT_DATA_DIR || defaultDataDir();

// 优先复用已在运行的服务（sql.js 单文件库不支持多进程同时打开）
const probe = process.env.AIFT_API || 'http://127.0.0.1:41700';
let h = null;
let base = probe;
const healthy = await (async () => {
  try {
    const r = await fetch(`${probe}/api/health`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j && j.code === 0;
  } catch (e) {
    return false;
  }
})();
if (healthy) {
  console.log(`复用已运行的服务: ${probe}`);
} else {
  h = await startServer({ dataDir });
  base = h.baseUrl;
}

const get = async (u) => (await (await fetch(base + u)).json()).data;

console.log(`数据目录: ${dataDir}\n`);

const models = await get('/api/models/all');
console.log(`模型（${models.length}）`);
for (const m of models) {
  console.log(`  #${m.id} ${m.name} | ${m.model_type} | ${m.format_type || '-'} | ${m.model_name} | ${m.base_url}`);
}

const ifaces = await get('/api/interface-configs/all');
console.log(`\n接口（${ifaces.length}）`);
for (const it of ifaces) {
  const count = (list) => (list || []).reduce((n, p) => n + 1 + count(p.children), 0);
  const inputs = (it.params || []).filter((p) => (p.param_type || 'input') === 'input');
  const outputs = (it.params || []).filter((p) => p.param_type === 'output');
  const files = (it.params || []).filter((p) => (p.file_type || 'none') !== 'none').length;
  console.log(`  #${it.id} ${it.name} | ${it.format_type || '-'} | 入${count(inputs)} 出${count(outputs)} | 文件参数${files}`);
}

const workflows = await get('/api/workflows');
console.log(`\n工作流（${workflows.length}）`);
for (const w of workflows) {
  console.log(`  #${w.id} ${w.name} | ${w.step_count} 步`);
  for (const s of w.steps) {
    // 执行配置归属页面：从页面拿模型/接口
    let exec = {};
    if (s.page_id) {
      try {
        exec = (await get(`/api/pages/${s.page_id}`)).execution || {};
      } catch (e) {
        exec = {};
      }
    }
    console.log(
      `      ${s.name} · 页面#${s.page_id || '-'} · 模型#${exec.model_id || '-'} · 接口#${exec.interface_id || '-'}` +
        ` · ${exec.input_type || 'none'}→${exec.output_type || 'none'}`,
    );
  }
}

const pages = await get('/api/pages/all');
console.log(`\n页面（${pages.length}）`);
for (const p of pages) console.log(`  #${p.id} ${p.name}`);

const assets = await get('/api/assets/all');
console.log(`\n资产（${assets.length}）`);

const works = await get('/api/works');
console.log(`\n作品（${works.length}）`);
for (const w of works) console.log(`  #${w.id} ${w.name} | ${w.status} | 工作流#${w.workflow_id || '-'}`);

await (h ? h.close() : Promise.resolve());
