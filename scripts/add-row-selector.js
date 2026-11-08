/**
 * 给「列表 → 图片」的页面插入「选择列表行」组件（放在执行按钮前）。
 *   node scripts/add-row-selector.js [--page 3] [--source '${stepList[0].rsp.items}'] [--dry]
 * 不带 --page 时，自动处理所有 input_type=list & output_type=image 的页面。
 */
import path from 'node:path';
import os from 'node:os';
import { openDatabase, now } from '../server/db/index.js';

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
const dryRun = argv.includes('--dry');
const onlyPage = Number(arg('page', 0)) || null;
const defaultSource = arg('source', '${stepList[0].rsp.items}');
const selectAll = arg('default-select-all', 'true') !== 'false';

const dataDir = arg('data-dir', process.env.AIFT_DATA_DIR || defaultDataDir());
const db = await openDatabase({ dataDir });
console.log(`数据目录: ${dataDir}${dryRun ? '（dry-run）' : ''}\n`);

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
let touched = 0;

for (const row of db.all('SELECT * FROM page ORDER BY id')) {
  const exec = parse(row.execution, null);
  if (!exec) continue;
  if (onlyPage && row.id !== onlyPage) continue;
  if (exec.input_type !== 'list' || exec.output_type !== 'image') continue;

  const layout = parse(row.layout, []);
  if (layout.some((b) => b.component === 'row-selector')) {
    console.log(`页面 #${row.id} ${row.name}：已有 row-selector，跳过`);
    continue;
  }

  const block = {
    id: `blk-${Date.now()}-${uid()}`,
    component: 'row-selector',
    props: {
      source: defaultSource,
      label: '选择要生成图片的行',
      nameField: 'name',
      descField: 'desc',
      imageField: 'image_url',
      showImage: true,
      defaultSelectAll: selectAll,
      maxHeight: 320,
    },
  };

  const at = layout.findIndex((b) => b.component === 'run-button');
  const next = [...layout];
  next.splice(at === -1 ? next.length : at, 0, block);
  if (!dryRun) {
    db.run('UPDATE page SET layout = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), now(), row.id]);
  }
  touched += 1;
  console.log(`页面 #${row.id} ${row.name}：已插入 row-selector（在 run-button 前）`);
}

db.close();
console.log(`\n完成：处理 ${touched} 个页面`);
