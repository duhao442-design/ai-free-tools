/**
 * 单步执行调试工具：在真实数据目录上跑某作品某一步，打印预览/执行结果与报错。
 *
 *   node scripts/run-step.js --work 1 --step 1            # 预览（不调用模型）
 *   node scripts/run-step.js --work 1 --step 1 --run      # 真执行
 *   node scripts/run-step.js --list                       # 列出作品
 *   node scripts/run-step.js --work 1 --detail            # 作品详情
 */
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../server/index.js';

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

/**
 * 优先复用已在运行的服务（避免两个进程同时开同一个 SQLite 文件互相覆盖）；
 * 没有可用服务时自己起一个。
 */
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

const call = async (method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { __raw: text, __status: r.status };
  }
};

const finish = async (code = 0) => {
  if (h) await h.close();
  process.exit(code);
};

console.log(`数据目录: ${dataDir}\n`);

if (has('list')) {
  const works = await call('GET', '/api/works?page_size=100');
  for (const w of works.data || []) console.log(`#${w.id} ${w.name} | ${w.status} | 工作流#${w.workflow_id}`);
  await finish(0);
}

const workId = Number(arg('work', 0));
if (!workId) {
  console.error('缺少 --work <作品ID>（可用 --list 查看）');
  await finish(1);
}

if (has('detail')) {
  const d = await call('GET', `/api/works/${workId}/detail`);
  console.log(JSON.stringify(d, null, 2));
  await finish(0);
}

const step = Number(arg('step', 1));

if (has('run')) {
  console.log(`>>> 执行 作品#${workId} 第 ${step} 步`);
  const res = await call('POST', `/api/works/${workId}/steps/${step}/run`, { inputs: {} });
  console.log(JSON.stringify(res, null, 2).slice(0, 8000));
} else {
  console.log(`>>> 预览 作品#${workId} 第 ${step} 步（不调用模型）`);
  const res = await call('POST', `/api/works/${workId}/steps/${step}/preview`, { inputs: {} });
  const data = res.data || {};
  console.log('模型:', data.model && `${data.model.name} / ${data.model.model_name} / ${data.model.format_type}`);
  console.log('接口:', data.interface && `${data.interface.name} / ${data.interface.format_type}`);
  console.log('步骤:', data.step && `${data.step.name} · ${data.step.input_type}→${data.step.output_type}`);
  for (const [i, item] of (data.items || []).entries()) {
    console.log(`\n--- 第 ${i + 1} 行 ---`);
    console.log('提示词:', String(item.prompt || '').slice(0, 500));
    console.log('报文:', JSON.stringify(item.request).slice(0, 1500));
    if (item.errors && item.errors.length) console.log('参数错误:', item.errors);
  }
  if (!res.data) console.log(JSON.stringify(res, null, 2).slice(0, 4000));
}

await finish(0);

