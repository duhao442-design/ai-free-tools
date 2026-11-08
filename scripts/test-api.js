/**
 * 接口冒烟测试：启动内嵌服务，跑一遍主要 CRUD 与运行链路。
 *   node scripts/test-api.js
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aift-api-'));
const handle = await startServer({ dataDir: path.join(tmp, 'data') });
const base = handle.baseUrl;

let pass = 0;
let fail = 0;

async function call(method, url, body) {
  const resp = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, json };
}

function expect(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(` FAIL  ${name}${extra ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  }
}

try {
  const health = await call('GET', '/api/health');
  expect('GET /api/health', health.json.code === 0, health.json);

  const comps = await call('GET', '/api/components');
  expect('GET /api/components 含内置组件', comps.json.data.components.length >= 19, comps.json.data?.components?.length);

  const registry = await call('GET', '/api/components/registry');
  expect('GET /api/components/registry', registry.json.code === 0 && registry.json.data.groups.length > 0);

  const pages = await call('GET', '/api/pages');
  expect('GET /api/pages 种子页面', pages.json.data.length >= 4, pages.json.data?.length);
  const pageId = pages.json.data[0].id;

  const pageDetail = await call('GET', `/api/pages/${pageId}`);
  expect('GET /api/pages/:id', pageDetail.json.data.layout.length > 0);

  const createdPage = await call('POST', '/api/pages', {
    name: '测试页面',
    layout: [{ id: 'b1', component: 'page-title', props: { text: '${gb.name}' } }],
  });
  expect('POST /api/pages', createdPage.json.code === 0, createdPage.json);
  const newPageId = createdPage.json.data.id;

  const workflows = await call('GET', '/api/workflows');
  expect('GET /api/workflows 种子工作流', workflows.json.data.length >= 1);
  const wfId = workflows.json.data[0].id;

  const createdWork = await call('POST', '/api/works', {
    name: '冒烟作品',
    type: 'comic',
    workflow_id: wfId,
    params: { art_style: '赛璐璐' },
  });
  expect('POST /api/works', createdWork.json.code === 0, createdWork.json);
  const workId = createdWork.json.data.id;

  const detail = await call('GET', `/api/works/${workId}/detail`);
  expect('GET /api/works/:id/detail 含步骤', detail.json.data.steps.length >= 4, detail.json.data?.steps?.length);
  expect('detail.pages 已带页面定义', Object.keys(detail.json.data.pages).length > 0);

  const runtime = await call('GET', `/api/works/${workId}/page?step=0`);
  expect('GET /api/works/:id/page 返回上下文与解析结果', runtime.json.code === 0 && runtime.json.data.resolved.length > 0, runtime.json);
  expect('页面上下文含 gb.name', runtime.json.data?.context?.gb?.name === '冒烟作品', runtime.json.data?.context?.gb?.name);
  expect('页面上下文含 asset 展开', runtime.json.data?.context?.gb?.art_style === '赛璐璐', runtime.json.data?.context?.gb);

  const previewCtx = await call('POST', '/api/pages/preview-context', { page_id: pageId, work_id: workId, step: 1 });
  expect('POST /api/pages/preview-context', previewCtx.json.code === 0);

  const resolvePage = await call('POST', '/api/pages/resolve', { page_id: pageId, work_id: workId, step: 1 });
  expect('POST /api/pages/resolve', resolvePage.json.code === 0 && Array.isArray(resolvePage.json.data.resolved));

  // 模型 / 接口 CRUD
  const model = await call('POST', '/api/models', {
    name: '测试模型', provider: 'openai', model_type: 'text', format_type: 'openai_chat',
    model_name: 'gpt-4o', base_url: 'https://api.example.com', api_key: 'sk-test',
  });
  expect('POST /api/models', model.json.code === 0, model.json);
  const modelId = model.json.data.id;
  const models = await call('GET', '/api/models?page_num=1&page_size=10');
  expect('GET /api/models 分页', models.json.total >= 1 && Array.isArray(models.json.data));

  const iface = await call('POST', '/api/interface-configs', {
    name: '测试接口', format_type: 'openai_chat',
    params: [
      { param_type: 'input', param_name: 'model', value_type: 'string', param_value: { kind: 'constant', expr: 'gpt-4o' } },
      { param_type: 'input', param_name: 'messages', value_type: 'array', children: [
        { param_type: 'input', param_name: 'role', value_type: 'string', param_value: { kind: 'constant', expr: 'user' } },
        { param_type: 'input', param_name: 'content', value_type: 'string', param_value: { kind: 'variable', expr: '${gb.prompt}' } },
      ] },
      { param_type: 'input', param_name: 'image', value_type: 'string', file_type: 'url', param_value: { kind: 'variable', expr: '${gb.img}' } },
      { param_type: 'output', param_name: 'content', value_type: 'string',
        param_value: { kind: 'variable', expr: '${resp.choices[0].message.content}' } },
    ],
  });
  expect('POST /api/interface-configs（含 file_type）', iface.json.code === 0, iface.json);
  const ifaceId = iface.json.data.id;

  const badIface = await call('POST', '/api/interface-configs', {
    name: '重名接口',
    params: [
      { param_type: 'input', param_name: 'a', value_type: 'string' },
      { param_type: 'input', param_name: 'a', value_type: 'string' },
    ],
  });
  expect('接口参数重名被拦截', badIface.json.code !== 0, badIface.json);

  const preview = await call('POST', '/api/interface-configs/preview', {
    params: iface.json.data.params,
    model_id: modelId,
    context: { gb: { prompt: '画猫', img: 'https://a.com/x.png' }, stepList: [] },
  });
  expect('接口报文预览', preview.json.data?.payload?.model === 'gpt-4o', preview.json.data);
  expect('预览请求 URL 正确', preview.json.data?.request?.url === 'https://api.example.com/v1/chat/completions', preview.json.data?.request);
  expect('预览请求头脱敏', String(preview.json.data?.request?.headers?.Authorization || '').includes('***'));

  const assets = await call('POST', '/api/assets', { key: 'style_demo', value: '水彩' });
  expect('POST /api/assets', assets.json.code === 0, assets.json);

  const upload = await call('POST', '/api/files/upload', {
    filename: 'a.png',
    content_base64: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
  });
  expect('POST /api/files/upload 返回本地链接', String(upload.json.data?.url || '').includes('/files/'), upload.json);

  const conv = await call('POST', '/api/files/convert', {
    value: `data:image/png;base64,${Buffer.from('abc').toString('base64')}`,
    target: 'url',
    filename: 'b.png',
  });
  expect('POST /api/files/convert base64→url', String(conv.json.data?.value || '').startsWith('/files/'), conv.json);

  // 删除
  const delPage = await call('DELETE', `/api/pages/${newPageId}`);
  expect('DELETE /api/pages/:id', delPage.json.code === 0);
  const delWork = await call('DELETE', `/api/works/${workId}`);
  expect('DELETE /api/works/:id', delWork.json.code === 0);
  const delIface = await call('DELETE', `/api/interface-configs/${ifaceId}`);
  expect('DELETE /api/interface-configs/:id', delIface.json.code === 0);
  const delModel = await call('DELETE', `/api/models/${modelId}`);
  expect('DELETE /api/models/:id', delModel.json.code === 0);

  const notFound = await call('GET', '/api/not-exists');
  expect('未知接口返回 404 结构', notFound.status === 404 && notFound.json.code === -1);
} catch (e) {
  fail += 1;
  console.error('冒烟测试异常:', e);
} finally {
  await handle.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
