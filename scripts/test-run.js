/**
 * 端到端执行测试：用本地 Mock 的 OpenAI 兼容服务，验证
 * 接口调用 → 上下文解析 → 步骤落库 → 后续步骤读取 stepList → 图片输出转存本地。
 *
 *   node scripts/test-run.js
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';

/* ---------------- Mock 上游服务 ---------------- */
const calls = [];
let imgCounter = 0;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(body || '{}');
    } catch (e) {
      payload = {};
    }
    calls.push({ url: req.url, payload, body, contentType: req.headers['content-type'] || '' });

    if (req.url.includes('/images/generations') || req.url.includes('/images/edits')) {
      // 每次返回不同内容，避免本地存储按内容哈希去重导致多行共用同一个文件
      imgCounter += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          data: [{ b64_json: Buffer.from(`fake-png-bytes-${imgCounter}`).toString('base64') }],
        }),
      );
      return;
    }
    const prompt = payload.messages ? payload.messages[payload.messages.length - 1].content : payload.prompt;
    // 列表类步骤：提示词里带 JSONLIST / JSONSCENES 时返回固定 JSON 数组
    let content = `MOCK:${prompt}`;
    if (String(prompt || '').includes('JSONLIST')) {
      content = '[{"name":"甲","desc":"角色甲"},{"name":"乙","desc":"角色乙"},{"name":"丙","desc":"角色丙"}]';
    } else if (String(prompt || '').includes('JSONSCENES')) {
      content = JSON.stringify([
        {
          page: 1,
          panel: 1,
          roles: ['甲', '乙'],
          description: '村口对峙',
          composition: '远景',
          actionExpression: '甲迈步向前',
          emotion: '紧张',
          dialogue: [{ type: 'speech', text: '你回来了？', shape: '圆形', bubblePosition: '右上' }],
        },
        {
          page: 1,
          panel: 2,
          roles: ['乙'],
          description: '乙退后',
          composition: '中景',
          actionExpression: '乙后退半步',
          emotion: '惶恐',
          dialogue: [{ type: 'narration', text: '风起。', shape: '方框', bubblePosition: '左上' }],
        },
      ]);
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        id: 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content } }],
      }),
    );
  });
});

await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockBase = `http://127.0.0.1:${mock.address().port}`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aift-run-'));
const handle = await startServer({ dataDir: path.join(tmp, 'data') });
const base = handle.baseUrl;

let pass = 0;
let fail = 0;
function expect(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(` FAIL  ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  }
}

async function call(method, url, body) {
  const resp = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return resp.json();
}

try {
  // 1. 模型（文本 + 图片）
  const textModel = (await call('POST', '/api/models', {
    name: 'mock-text', provider: 'openai', model_type: 'text', format_type: 'openai_chat',
    model_name: 'mock-gpt', base_url: mockBase, api_key: 'sk-mock',
  })).data;
  const imageModel = (await call('POST', '/api/models', {
    name: 'mock-image', provider: 'openai', model_type: 'image', format_type: 'openai_image',
    model_name: 'mock-img', base_url: mockBase, api_key: 'sk-mock',
  })).data;

  // 2. 接口（文本 + 图片）
  const presets = (await call('GET', '/api/interface-configs/format-presets')).data;
  const chatPreset = presets.find((p) => p.key === 'openai_chat');
  const imagePreset = presets.find((p) => p.key === 'openai_image');
  const chatIface = (await call('POST', '/api/interface-configs', {
    name: 'mock-chat', format_type: 'openai_chat', params: chatPreset.params,
  })).data;
  const imageIface = (await call('POST', '/api/interface-configs', {
    name: 'mock-image', format_type: 'openai_image', params: imagePreset.params,
  })).data;

  // 3. 页面
  const page = (await call('POST', '/api/pages', {
    name: '测试页', layout: [{ id: 'b1', component: 'page-title', props: { text: '${gb.name}' } }],
  })).data;

  // 4. 工作流：文本 → 文本（引用上一步）→ 图片
  const workflow = (await call('POST', '/api/workflows', {
    name: 'E2E 工作流',
    type: 'comic',
    steps: [
      {
        id: 's1', name: '第一步', page_id: page.id, model_id: textModel.id, interface_id: chatIface.id,
        input_type: 'none', output_type: 'none',
        prompt: '作品名：${gb.name}；资产风格：${art_style}',
      },
      {
        id: 's2', name: '第二步', page_id: page.id, model_id: textModel.id, interface_id: chatIface.id,
        input_type: 'none', output_type: 'none',
        prompt: '上一步：${stepList[0].rsp.content}\n快捷变量：${prev_output}',
      },
      {
        id: 's3', name: '生图', page_id: page.id, model_id: imageModel.id, interface_id: imageIface.id,
        input_type: 'none', output_type: 'image',
        prompt: '根据文本出图：${stepList[1].rsp.content}',
      },
    ],
  })).data;

  await call('POST', '/api/assets', { key: 'art_style', value: '赛璐璐' });

  // 5. 作品
  const work = (await call('POST', '/api/works', {
    name: 'E2E 作品', type: 'comic', workflow_id: workflow.id,
  })).data;

  // 6. 执行第一步
  const run1 = await call('POST', `/api/works/${work.id}/steps/1/run`, { inputs: {} });
  expect('第一步执行成功', run1.data && run1.data.status === 'success', run1);
  expect('提示词解析了作品名与资产',
    calls[0] && calls[0].payload.messages[0].content.includes('作品名：E2E 作品') &&
    calls[0].payload.messages[0].content.includes('资产风格：赛璐璐'),
    calls[0] && calls[0].payload.messages[0].content);
  expect('输出为 Mock 文本', String(run1.data && run1.data.output).startsWith('MOCK:'), run1.data && run1.data.output);

  // 7. 执行第二步（应能读到 stepList[0]）
  const run2 = await call('POST', `/api/works/${work.id}/steps/2/run`, { inputs: {} });
  expect('第二步执行成功', run2.data && run2.data.status === 'success', run2);
  const secondPrompt = calls[1] && calls[1].payload.messages[0].content;
  expect('第二步读到 stepList[0].rsp.content', secondPrompt.includes('MOCK:作品名：E2E 作品'), secondPrompt);
  expect('第二步读到 prev_output 快捷变量', secondPrompt.includes('快捷变量：MOCK:'), secondPrompt);

  // 8. 执行第三步（图片输出应转存本地）
  const run3 = await call('POST', `/api/works/${work.id}/steps/3/run`, { inputs: {} });
  expect('第三步（图片）执行成功', run3.data && run3.data.status === 'success', run3);
  const imgs = (run3.data && run3.data.images) || [];
  expect('图片输出已转存为本地链接', imgs.length === 1 && imgs[0].startsWith('/files/'), imgs);
  if (imgs[0]) {
    const resp = await fetch(`${base}${imgs[0]}`);
    expect('本地图片可访问', resp.ok, resp.status);
  }

  // 9. 详情：步骤状态与作品状态
  const detail = (await call('GET', `/api/works/${work.id}/detail`)).data;
  expect('作品状态为已完成', detail.work.status === 'done', detail.work.status);
  expect('三个步骤均为 success', detail.steps.every((s) => s.status === 'success'), detail.steps.map((s) => s.status));

  // 10. 页面运行时上下文包含 stepList
  const runtime = (await call('GET', `/api/works/${work.id}/page?step=2`)).data;
  expect('页面上下文 stepList 含前两步', (runtime.context.stepList || []).length === 2, runtime.context.stepList);
  expect('页面上下文含 asset 平铺', runtime.context.gb.art_style === '赛璐璐', runtime.context.gb.art_style);

  // 11. 重置第一步：后续全部清空
  await call('POST', `/api/works/${work.id}/steps/1/reset`);
  const after = (await call('GET', `/api/works/${work.id}/detail`)).data;
  expect('重置后所有步骤回到 pending', after.steps.every((s) => s.status === 'pending'), after.steps.map((s) => s.status));

  // 12. 前置未完成时禁止执行
  const blocked = await call('POST', `/api/works/${work.id}/steps/3/run`, { inputs: {} });
  expect('前置步骤未完成时被拦截', blocked.code !== 0, blocked);

  // 13. 执行时用「页面里编辑中的提示词」覆盖步骤模版
  const overrideRun = await call('POST', `/api/works/${work.id}/steps/1/run`, {
    inputs: { prompt: '覆盖提示词：${gb.name}' },
  });
  expect('带 inputs.prompt 执行成功', overrideRun.data && overrideRun.data.status === 'success', overrideRun);
  const lastCall = calls[calls.length - 1];
  expect('inputs.prompt 覆盖了步骤模版并完成解析',
    lastCall && lastCall.payload.messages[0].content === '覆盖提示词：E2E 作品',
    lastCall && lastCall.payload.messages[0].content);

  // 14. 执行配置归属页面：步骤只给 page_id，模型/接口/提示词全在页面 execution 上
  const execPage = (await call('POST', '/api/pages', {
    name: '页面执行配置页',
    layout: [{ id: 'b1', component: 'page-title', props: { text: '${gb.name}' } }],
    execution: {
      model_id: textModel.id,
      interface_id: chatIface.id,
      input_type: 'none',
      output_type: 'none',
      input_value: '',
      prompt: '页面配置的提示词：${gb.name}',
    },
  })).data;
  expect('页面保存了执行配置', execPage && execPage.execution && execPage.execution.model_id === textModel.id, execPage && execPage.execution);

  const pageWf = (await call('POST', '/api/workflows', {
    name: '页面执行工作流',
    steps: [{ id: 'p1', name: '页面步骤', page_id: execPage.id }],
  })).data;
  const pageWork = (await call('POST', '/api/works', {
    name: '页面执行作品', workflow_id: pageWf.id,
  })).data;
  const pageRun = await call('POST', `/api/works/${pageWork.id}/steps/1/run`, { inputs: {} });
  expect('只有 page_id 的步骤也能执行（配置来自页面）', pageRun.data && pageRun.data.status === 'success', pageRun);
  const pagePromptCall = calls[calls.length - 1];
  expect('页面提示词已解析并发送',
    pagePromptCall && pagePromptCall.payload.messages[0].content === '页面配置的提示词：页面执行作品',
    pagePromptCall && pagePromptCall.payload.messages[0].content);

  // 15. 勾选行执行：页面里「选择列表行」把选中行传给执行，后端按行循环（只处理勾选行）
  const listPage = (await call('POST', '/api/pages', {
    name: '列表步骤页',
    layout: [],
    execution: {
      model_id: textModel.id,
      interface_id: chatIface.id,
      input_type: 'none',
      output_type: 'list',
      prompt: 'JSONLIST',
    },
  })).data;
  const imgPage = (await call('POST', '/api/pages', {
    name: '逐行出图页',
    layout: [],
    execution: {
      model_id: imageModel.id,
      interface_id: imageIface.id,
      input_type: 'list',
      output_type: 'image',
      input_value: '${stepList[0].rsp.items}',
      prompt: '画 ${item.name}',
    },
  })).data;
  const selWf = (await call('POST', '/api/workflows', {
    name: '勾选出图工作流',
    steps: [
      { id: 'sl1', name: '列表', page_id: listPage.id },
      { id: 'sl2', name: '出图', page_id: imgPage.id },
    ],
  })).data;
  const selWork = (await call('POST', '/api/works', { name: '勾选出图作品', workflow_id: selWf.id })).data;

  const lr = await call('POST', `/api/works/${selWork.id}/steps/1/run`, { inputs: {} });
  expect('列表步骤产出 3 条', lr.data && lr.data.rspData && lr.data.rspData.items.length === 3, lr.data && lr.data.rspData);

  const imgCallsOf = () => calls.filter((c) => c.url.includes('/images/')).length;
  const beforeImg = imgCallsOf();
  const ir = await call('POST', `/api/works/${selWork.id}/steps/2/run`, {
    inputs: { rows: [{ name: '甲', desc: '角色甲' }, { name: '丙', desc: '角色丙' }] },
  });
  const afterImg = imgCallsOf();
  expect('勾选 2 行只生成 2 张图', ir.data && ir.data.images && ir.data.images.length === 2, ir.data && ir.data.images);
  expect('上游图片接口只被调用 2 次', afterImg - beforeImg === 2, { beforeImg, afterImg });
  expect('结果行只保留勾选的行（甲、丙）',
    ir.data && ir.data.rspData && ir.data.rspData.items.map((i) => i.name).join(',') === '甲,丙',
    ir.data && ir.data.rspData);

  const selDetail = (await call('GET', `/api/works/${selWork.id}/detail`)).data;
  const selStep2 = selDetail.steps.find((s) => s.order === 2);
  expect('步骤 inputs 只记录勾选行名字（不存整段描述）',
    selStep2 && Array.isArray(selStep2.inputs.rows) && selStep2.inputs.rows.join(',') === '甲,丙',
    selStep2 && selStep2.inputs);

  // 16. 分镜 + 角色图：提示词注入命中角色，多角色时一次传多张参考图
  const scenePage = (await call('POST', '/api/pages', {
    name: '分镜列表页',
    layout: [],
    execution: {
      model_id: textModel.id,
      interface_id: chatIface.id,
      input_type: 'none',
      output_type: 'list',
      prompt: 'JSONSCENES',
    },
  })).data;
  const finalImgPage = (await call('POST', '/api/pages', {
    name: '分镜成图页',
    layout: [],
    execution: {
      model_id: imageModel.id,
      interface_id: imageIface.id,
      input_type: 'list',
      output_type: 'image',
      input_value: '${stepList[2].rsp.items}',
      prompt: '画面：${item.description}｜角色：${item.character_names}｜设定：${item.character_descs}',
      settings: {
        columns: [],
        maxRows: 0,
        rowOffset: 0,
        image_ref: { from: '${stepList[1].rsp.items}', matchField: 'roles', nameField: 'name' },
      },
    },
  })).data;
  const finalWf = (await call('POST', '/api/workflows', {
    name: '分镜成图工作流',
    steps: [
      { id: 'f1', name: '角色列表', page_id: listPage.id },
      { id: 'f2', name: '角色图', page_id: imgPage.id },
      { id: 'f3', name: '分镜', page_id: scenePage.id },
      { id: 'f4', name: '成图', page_id: finalImgPage.id },
    ],
  })).data;
  const finalWork = (await call('POST', '/api/works', { name: '分镜成图作品', workflow_id: finalWf.id })).data;
  await call('POST', `/api/works/${finalWork.id}/steps/1/run`, { inputs: {} });
  await call('POST', `/api/works/${finalWork.id}/steps/2/run`, { inputs: { rows: [{ name: '甲', desc: '角色甲' }, { name: '乙', desc: '角色乙' }] } });
  await call('POST', `/api/works/${finalWork.id}/steps/3/run`, { inputs: {} });

  const d2 = (await call('GET', `/api/works/${finalWork.id}/detail`)).data;
  const s2items = d2.steps.find((s) => s.order === 2).rsp_data.items;
  expect('第二步结果行带 image_url', !!(s2items[0] && s2items[0].image_url), s2items[0]);

  const beforeFinal = calls.filter((c) => c.url.includes('/images/')).length;
  const sceneDetail = (await call('GET', `/api/works/${finalWork.id}/detail`)).data;
  const sceneItems = sceneDetail.steps.find((s) => s.order === 3).rsp_data.items;
  const preview4 = await call('POST', `/api/works/${finalWork.id}/steps/4/preview`, {
    inputs: { rows: [sceneItems[0]] },
  });
  expect('预览：分镜命中 2 个角色、2 张参考图',
    preview4.data && preview4.data.items[0] && preview4.data.items[0].image_refs && preview4.data.items[0].image_refs.length === 2,
    preview4.data && preview4.data.items[0] && { refs: preview4.data.items[0].image_refs, chars: preview4.data.items[0].characters });
  const fr = await call('POST', `/api/works/${finalWork.id}/steps/4/run`, {
    inputs: { rows: [{ page: 1, panel: 1, roles: ['甲', '乙'], description: '村口对峙' }] },
  });
  const finalCalls = calls.filter((c) => c.url.includes('/images/')).slice(beforeFinal);
  expect('分镜成图：勾选 1 格只出 1 张图', fr.data && fr.data.images && fr.data.images.length === 1, fr.data && fr.data.images);
  const multipart = finalCalls[0];
  const multiFieldCount = multipart ? (multipart.body.match(/name="image\[\]"/g) || []).length : 0;
  expect('双角色分镜一次上传 2 张参考图（image[]）', multiFieldCount === 2, {
    contentType: multipart && multipart.contentType,
    fields: multiFieldCount,
  });
  expect('结果行带命中角色名（甲、乙）',
    fr.data && fr.data.rspData && fr.data.rspData.items[0].character_names === '甲、乙',
    fr.data && fr.data.rspData && fr.data.rspData.items[0] && fr.data.rspData.items[0].character_names);
  expect('结果行带角色设定描述',
    fr.data && fr.data.rspData && String(fr.data.rspData.items[0].character_descs || '').includes('角色甲'),
    fr.data && fr.data.rspData && fr.data.rspData.items[0] && fr.data.rspData.items[0].character_descs);

  const previewItem = preview4.data.items[0];
  expect('台词注入提示词上下文：dialogue_text / bubble_positions',
    previewItem && previewItem.row && previewItem.row.dialogue_text === '你回来了？'
      && previewItem.row.bubble_positions === '右上',
    previewItem && previewItem.row && { t: previewItem.row.dialogue_text, p: previewItem.row.bubble_positions });

  // 17. 已有图片处理：覆盖 / 保留
  const twoScenes = [
    { page: 1, panel: 1, roles: ['甲', '乙'], description: '村口对峙' },
    { page: 1, panel: 2, roles: ['乙'], description: '乙退后' },
  ];
  const imgCalls = () => calls.filter((c) => c.url.includes('/images/')).length;

  const beforeBoth = imgCalls();
  const bothRun = await call('POST', `/api/works/${finalWork.id}/steps/4/run`, { inputs: { rows: twoScenes } });
  expect('覆盖模式：2 行生成 2 张', bothRun.data && bothRun.data.images && bothRun.data.images.length === 2 && imgCalls() - beforeBoth === 2,
    bothRun.data && bothRun.data.images);

  const beforeKeep = imgCalls();
  const keepRun = await call('POST', `/api/works/${finalWork.id}/steps/4/run`, {
    inputs: { rows: twoScenes, existing_image_mode: 'keep' },
  });
  expect('保留模式：不再调用图片接口', imgCalls() - beforeKeep === 0, { beforeKeep, after: imgCalls() });
  expect('保留模式：沿用已有 2 张图',
    keepRun.data && keepRun.data.images && keepRun.data.images.length === 2
      && keepRun.data.images.join(',') === (bothRun.data.images || []).join(','),
    keepRun.data && keepRun.data.images);
  expect('保留模式：提示里写明复用张数',
    keepRun.data && /复用已有图片 2 张/.test(String(keepRun.data.message || '')),
    keepRun.data && keepRun.data.message);

  const beforeOverwrite = imgCalls();
  const overRun = await call('POST', `/api/works/${finalWork.id}/steps/4/run`, {
    inputs: { rows: twoScenes, existing_image_mode: 'overwrite' },
  });
  expect('覆盖模式：重新调用 2 次接口', overRun.data && imgCalls() - beforeOverwrite === 2, {
    beforeOverwrite,
    after: imgCalls(),
  });

  const beforePartial = imgCalls();
  const partialRun = await call('POST', `/api/works/${finalWork.id}/steps/4/run`, {
    inputs: { rows: [twoScenes[0], { page: 9, panel: 9, roles: [], description: '新格子' }], existing_image_mode: 'keep' },
  });
  expect('保留模式：只为缺图的行生成 1 张', partialRun.data && imgCalls() - beforePartial === 1, {
    beforePartial,
    after: imgCalls(),
    message: partialRun.data && partialRun.data.message,
  });
  expect('结果与上次合并：1-2 格的图不会丢（共 3 条）',
    partialRun.data && partialRun.data.rspData && partialRun.data.rspData.items.length === 3,
    partialRun.data && partialRun.data.rspData && partialRun.data.rspData.items.map((i) => `${i.page}-${i.panel}`));

  const mergedItems = partialRun.data.rspData.items;
  const s1Image = mergedItems[0].image_url;
  const subRun = await call('POST', `/api/works/${finalWork.id}/steps/4/run`, {
    inputs: { rows: [twoScenes[1]], existing_image_mode: 'overwrite' },
  });
  expect('只跑第 2 格：第 1、3 格结果保留',
    subRun.data && subRun.data.rspData && subRun.data.rspData.items.length === 3
      && subRun.data.rspData.items[0].image_url === s1Image,
    subRun.data && subRun.data.rspData && subRun.data.rspData.items.map((i) => `${i.page}-${i.panel}`));
  expect('只跑第 2 格：只调用 1 次接口', imgCalls() - beforePartial === 2, { beforePartial, after: imgCalls() });
} catch (e) {
  fail += 1;
  console.error('E2E 异常:', e);
} finally {
  await handle.close();
  await new Promise((r) => mock.close(r));
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
