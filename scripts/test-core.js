/**
 * 后端核心自测（不依赖 Electron）：
 *   node scripts/test-core.js
 * 覆盖：模板解析、文件类型互转、SQLite 读写、接口报文构造、页面上下文、工作流引擎骨架。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getByPath, resolveValue, renderText, renderDeep, extractPlaceholders, MISSING } from '../server/core/resolver.js';
import { detectKind, convertFile, prepareInputValue, persistOutputValue } from '../server/core/fileConvert.js';
import { buildRequest } from '../server/core/interfaceRunner.js';
import { FORMAT_SPECS, finalizeRequest, extractTextContent, extractResponsesText } from '../server/core/endpointFormats.js';
import { openDatabase } from '../server/db/index.js';
import { bootstrap } from '../server/db/bootstrap.js';
import { setRuntime, normalizeStorageConfig } from '../server/core/storage/index.js';
import { buildPageContext } from '../server/core/pageContext.js';
import { zipStore, formatFileName, crc32 } from '../renderer/src/utils/zip.js';
import { normalizeWorkflowSteps, extractJsonList, normalizeRoleNames, resolveRowReference, resolveRowReferences, rowKeyValues, buildExistingImageMap, mergeImageItems } from '../server/core/workflowEngine.js';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e.message]);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e.message]);
  }
}

const ctx = {
  gb: {
    name: '测试作品',
    content: '一段内容',
    prompt: '画一只猫',
    item: { name: '分镜1', desc: '雨夜' },
    character: { name: '小明' },
    list: [{ a: 1 }, { a: 2 }],
    num: 42,
    flag: true,
    model_name: 'gpt-4o',
  },
  stepList: [
    { step_order: 1, rsp: { content: '第一步文本', images: ['http://x/1.png'] } },
  ],
};

check('getByPath 基础路径', () => assert.equal(getByPath(ctx, 'gb.name'), '测试作品'));
check('getByPath 数组下标', () => assert.equal(getByPath(ctx, 'gb.list[1].a'), 2));
check('getByPath 别名 item', () => assert.equal(getByPath(ctx, 'item.name'), '分镜1'));
check('getByPath 别名 character', () => assert.equal(getByPath(ctx, 'character.name'), '小明'));
check('getByPath 缺失返回 MISSING', () => assert.equal(getByPath(ctx, 'gb.nope.x'), MISSING));
check('renderText 替换并保留未命中', () => {
  assert.equal(renderText(ctx, '${gb.name}-${gb.missing}'), '测试作品-${gb.missing}');
});
check('resolveValue 单占位符返回原生类型', () => {
  assert.equal(resolveValue(ctx, '${gb.num}'), 42);
  assert.equal(resolveValue(ctx, '${gb.flag}'), true);
  assert.deepEqual(resolveValue(ctx, '${gb.list}'), [{ a: 1 }, { a: 2 }]);
});
check('resolveValue 按类型转型', () => {
  assert.equal(resolveValue(ctx, '${gb.num}', 'string'), '42');
  assert.equal(resolveValue(ctx, '[{"k":"${gb.name}"}]', 'array')[0].k, '测试作品');
});
check('renderDeep 递归渲染', () => {
  const out = renderDeep(ctx, { a: ['${gb.name}'], b: { c: 'x${gb.num}' } });
  assert.equal(out.a[0], '测试作品');
  assert.equal(out.b.c, 'x42');
});
check('extractPlaceholders', () => {
  assert.deepEqual(extractPlaceholders('a ${gb.x} b ${stepList[0].rsp.content}'), ['gb.x', 'stepList[0].rsp.content']);
});

check('detectKind', () => {
  assert.equal(detectKind('data:image/png;base64,AAA'), 'base64');
  assert.equal(detectKind('https://a.com/x.png'), 'url');
  assert.equal(detectKind('hello'), 'none');
  assert.equal(detectKind({ path: 'C:/a.png' }), 'file');
});

check('endpointFormats URL 推导', () => {
  const spec = FORMAT_SPECS.openai_chat;
  assert.equal(spec.buildUrl('https://api.test.com'), 'https://api.test.com/v1/chat/completions');
  assert.equal(spec.buildUrl('https://api.test.com/v1'), 'https://api.test.com/v1/chat/completions');
  assert.equal(FORMAT_SPECS.gemini.buildUrl('https://g.test.com', 'gemini-pro'),
    'https://g.test.com/v1beta/models/gemini-pro:generateContent');
  assert.equal(FORMAT_SPECS.openai_image.buildUrl('https://a.com'), 'https://a.com/v1/images/generations');
});

check('extractTextContent', () => {
  const raw = { choices: [{ message: { content: 'hi' } }] };
  assert.equal(extractTextContent('openai_chat', raw), 'hi');
});

check('Responses 格式只取 message，不混入 reasoning', () => {
  const raw = {
    output: [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: '思考过程 [1,2,3] 结束' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '[{"name":"林策"}]' }] },
    ],
  };
  assert.equal(extractResponsesText(raw), '[{"name":"林策"}]');
  assert.equal(extractTextContent('openai_responses', raw), '[{"name":"林策"}]');
});

check('extractJsonList 跳过思维链，取最后的 JSON 数组', () => {
  const text = [
    '思考：先列 [1,2] 再参考示例 [{"a":1}]',
    '最终答案：',
    '```json',
    '[{"name":"林策","desc":"将军"},{"name":"二狗子","desc":"村民"}]',
    '```',
  ].join('\n');
  const items = extractJsonList(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, '林策');
});

check('extractJsonList 容忍前后说明文字', () => {
  const items = extractJsonList('好的，结果如下：[{"name":"A"},{"name":"B"}] 以上。');
  assert.deepEqual(items.map((i) => i.name), ['A', 'B']);
});

check('normalizeRoleNames 支持数组/字符串/对象', () => {
  assert.deepEqual(normalizeRoleNames(['林策', { name: '二狗子' }]), ['林策', '二狗子']);
  assert.deepEqual(normalizeRoleNames('林策,王举人、二狗子'), ['林策', '王举人', '二狗子']);
  assert.deepEqual(normalizeRoleNames({ role: '王举人' }), ['王举人']);
});

check('resolveRowReference 按角色名匹配参考图', () => {
  const ctx = {
    gb: { item: { name: '分镜1', role: ['二狗子'] } },
    stepList: [
      { rsp: {} },
      { rsp: { items: [{ name: '林策', image_url: '/files/a.png' }, { name: '二狗子', image_url: '/files/b.png' }] } },
    ],
  };
  const step = { settings: { image_ref: { from: '${stepList[1].rsp.items}', matchField: 'role', nameField: 'name' } } };
  assert.equal(resolveRowReference(step, ctx, ctx.gb.item), '/files/b.png');
});

check('buildExistingImageMap 按 name / page+panel 建索引', () => {
  const step = { settings: {} };
  const stepRow = {
    rsp_data: JSON.stringify({
      items: [
        { name: '林策', image_url: '/files/a.png' },
        { name: '二狗子', image_url: '' },
        { page: 1, panel: 2, image_url: '/files/b.png' },
      ],
    }),
  };
  const byName = buildExistingImageMap(step, stepRow);
  assert.equal(byName.get('林策'), '/files/a.png');
  assert.equal(byName.has('二狗子'), false);
  assert.equal(byName.get('1|2'), '/files/b.png');
});

check('rowKeyValues 支持 settings.row_key', () => {
  assert.equal(rowKeyValues({ settings: { row_key: 'page,panel' } }, { page: 3, panel: 4 }), '3|4');
  assert.equal(rowKeyValues({ settings: {} }, { name: 'A' }), 'A');
});

check('mergeImageItems 合并本次未处理的行并保持顺序', () => {
  const step = { settings: {} };
  const prev = [
    { page: 1, panel: 1, image_url: '/a.png' },
    { page: 1, panel: 2, image_url: '/b.png' },
  ];
  const processed = [
    { page: 1, panel: 1, image_url: '/a2.png' },
    { page: 2, panel: 1, image_url: '/c.png' },
  ];
  const merged = mergeImageItems(step, prev, processed);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].image_url, '/a2.png');
  assert.equal(merged[1].image_url, '/b.png');
  assert.equal(merged[2].image_url, '/c.png');
});

check('formatFileName 占位符与非法字符', () => {
  assert.equal(formatFileName('{index:3}-{label}', { index: 2, label: '第2页' }), '002-第2页');
  assert.equal(formatFileName('p{page}-{index}', { index: 5, page: 3 }), 'p3-5');
  assert.equal(formatFileName('a/b:{index}', { index: 1 }), 'a_b_1');
});

check('zipStore 生成可解析的 zip 结构', () => {
  const files = [
    { name: '001-第1页.png', data: new Uint8Array([1, 2, 3, 4]) },
    { name: '002-第2页.png', data: new Uint8Array([5, 6]) },
  ];
  const zip = zipStore(files);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  // EOCD 在末尾 22 字节
  assert.equal(dv.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(zip.length - 22 + 10, true), 2);
  assert.equal(dv.getUint32(14, true), crc32(files[0].data));
  const text = new TextDecoder().decode(zip);
  assert.ok(text.includes('001-第1页.png'), 'zip 内含文件名');
});

check('resolveRowReferences 多角色命中多张参考图', () => {
  const ctx = {
    gb: { item: { name: '分镜1', roles: ['林策', '二狗子'] } },
    stepList: [
      { rsp: {} },
      {
        rsp: {
          items: [
            { name: '林策', desc: '将军', image_url: '/files/a.png' },
            { name: '二狗子', desc: '村民', image_url: '/files/b.png' },
          ],
        },
      },
    ],
  };
  const step = { settings: { image_ref: { from: '${stepList[1].rsp.items}', matchField: 'roles', nameField: 'name' } } };
  const info = resolveRowReferences(step, ctx, ctx.gb.item);
  assert.equal(info.images.length, 2);
  assert.equal(info.characters.length, 2);
  assert.deepEqual(info.characters.map((c) => c.desc), ['将军', '村民']);
});

check('resolveRowReference 无匹配返回 null（退化为文生图）', () => {
  const ctx = {
    gb: { item: { name: '分镜2', role: ['路人'] } },
    stepList: [{ rsp: {} }, { rsp: { items: [{ name: '林策', image_url: '/files/a.png' }] } }],
  };
  const step = { settings: { image_ref: { from: '${stepList[1].rsp.items}', matchField: 'role', nameField: 'name' } } };
  assert.equal(resolveRowReference(step, ctx, ctx.gb.item), null);
});

check('finalizeRequest 注入 model', () => {
  const req = finalizeRequest('openai_chat', { base_url: 'https://a.com', model_name: 'gpt-x', api_key: 'k' }, { messages: [] });
  assert.equal(req.body.model, 'gpt-x');
  assert.equal(req.headers.Authorization, 'Bearer k');
});

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aift-test-'));
const dataDir = path.join(tmpDir, 'data');
setRuntime({ dataDir, baseUrl: 'http://127.0.0.1:1' });
const storageConfig = normalizeStorageConfig(null);

await checkAsync('convertFile base64 -> url(本地存储)', async () => {
  const dataUri = `data:image/png;base64,${Buffer.from('hello-image').toString('base64')}`;
  const url = await convertFile(dataUri, 'url', { storageConfig });
  // 本地存储返回相对链接 /files/...（端口每次启动可能不同，由前端按当前地址拼接）
  assert.ok(url.startsWith('/files/'), url);
  const file = url.split('/files/')[1];
  const abs = path.join(dataDir, 'files', file);
  assert.ok(fs.existsSync(abs), abs);
});

await checkAsync('prepareInputValue 非文件原样返回', async () => {
  assert.equal(await prepareInputValue('纯文本', 'file', { storageConfig }), '纯文本');
});

await checkAsync('persistOutputValue 输出转存本地链接', async () => {
  const out = await persistOutputValue('data:image/png;base64,AAAA', 'file', { storageConfig });
  assert.ok(out.startsWith('/files/'), out);
});

await checkAsync('buildRequest 递归构造报文', async () => {
  const params = FORMAT_SPECS.openai_chat.paramsPreset;
  const { payload, errors } = await buildRequest(params, null, ctx, { storageConfig });
  assert.equal(payload.model, 'gpt-4o');
  assert.deepEqual(payload.messages, [{ role: 'user', content: '画一只猫' }]);
  assert.equal(payload.temperature, 0.7);
  assert.deepEqual(errors, []);
});

await checkAsync('buildRequest 带 file_type 的参数转换', async () => {
  const params = [
    { param_type: 'input', param_name: 'image', value_type: 'string', file_type: 'url',
      param_value: { kind: 'variable', expr: '${gb.dataimg}' } },
  ];
  const c = { gb: { dataimg: `data:image/png;base64,${Buffer.from('x').toString('base64')}` } };
  const { payload } = await buildRequest(params, null, c, { storageConfig });
  assert.ok(String(payload.image).startsWith('/files/'), String(payload.image));
});

await checkAsync('sqlite 读写 + bootstrap 种子', async () => {
  const db = await openDatabase({ dataDir });
  bootstrap(db);
  const pages = db.all('SELECT * FROM page');
  assert.ok(pages.length >= 4, `pages=${pages.length}`);
  const wf = db.get('SELECT * FROM workflow LIMIT 1');
  assert.ok(wf, 'workflow 未生成');
  const steps = normalizeWorkflowSteps(wf);
  assert.ok(steps.length >= 4);
  db.run('INSERT INTO asset (key, value, description, created_at, updated_at) VALUES (?,?,?,?,?)',
    ['art_style', '日系赛璐璐', '风格', new Date().toISOString(), new Date().toISOString()]);
  const asset = db.get('SELECT * FROM asset WHERE key = ?', ['art_style']);
  assert.equal(asset.value, '日系赛璐璐');

  const ts = new Date().toISOString();
  const { lastId } = db.run(
    `INSERT INTO work (name, type, workflow_id, status, params, content, source_url, keywords, remark, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['W1', 'comic', wf.id, 'draft', JSON.stringify({ theme: '冒险' }), '内容', '', '关键词', '', ts, ts],
  );
  const work = db.get('SELECT * FROM work WHERE id = ?', [lastId]);
  const page = pages[0];
  const result = await buildPageContext({ db, work, workflow: wf, page, stepOrder: 2 });
  assert.equal(result.gb.name, 'W1');
  assert.equal(result.gb.art_style, '日系赛璐璐');
  assert.equal(result.gb.theme, '冒险');
  assert.equal(result.gb.work_name, 'W1');
  assert.equal(result.gb.step_index, 2);
  db.close();
});

// 输出汇总
let failed = 0;
for (const [pass, name, msg] of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${msg ? ` -> ${msg}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch (e) {
  /* ignore */
}
process.exit(failed ? 1 : 0);

