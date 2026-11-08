/**
 * 项目初始化（专用脚本）：建数据目录 → 建库 → 写默认设置与示例页面/工作流。
 *
 * 只初始化「可复用的脚手架」，**不初始化模型、不初始化作品**：
 *   - 模型需要各自填 API Key，属于个人环境，不能随项目分发；
 *   - 作品（以及步骤结果、产物、上传文件）属于生成内容，不能随项目分发。
 *
 * 用法：
 *   npm run init                                  # 初始化默认数据目录
 *   npm run init -- --data-dir D:\aift-data       # 指定数据目录
 *   npm run init -- --no-demo                     # 只写默认设置，不建示例页面/工作流
 *   npm run init -- --json                        # 机器可读输出
 *
 * 脚本是幂等的：已存在的数据库只补默认设置，已有页面/工作流/模型/作品都不会被删除或覆盖。
 * 执行前请先退出桌面应用（数据库有独占锁）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../server/db/index.js';
import { bootstrap } from '../server/db/bootstrap.js';

/** 与 Electron 主进程、run-server.js 保持一致：%APPDATA%/ai-free-tools/data */
function defaultDataDir() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'ai-free-tools', 'data');
}

function parseArgs(argv) {
  const out = { 'data-dir': '', demo: true, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--data-dir') out['data-dir'] = argv[++i] || '';
    else if (cur.startsWith('--data-dir=')) out['data-dir'] = cur.slice('--data-dir='.length);
    else if (cur === '--no-demo') out.demo = false;
    else if (cur === '--demo') out.demo = true;
    else if (cur === '--json') out.json = true;
    else if (cur === '--help' || cur === '-h') out.help = true;
    else if (cur.startsWith('-')) throw new Error(`未知参数：${cur}（用 --help 查看用法）`);
  }
  return out;
}

const HELP = `项目初始化（不初始化模型与作品）

用法：
  npm run init                             初始化默认数据目录
  npm run init -- --data-dir <dir>         指定数据目录（相对路径按当前目录解析）
  npm run init -- --no-demo                只写默认设置，不建示例页面/工作流
  npm run init -- --json                   以 JSON 输出结果

说明：
  - 模型（model_config）与作品（work / work_step / work_artifact）不会被创建；
  - 已有数据不会被删除或覆盖，脚本可重复执行；
  - 执行前请先退出桌面应用，避免数据库被占用。`;

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const dataDir = args['data-dir']
  ? path.resolve(args['data-dir'])
  : process.env.AIFT_DATA_DIR || defaultDataDir();
const filesDir = path.join(dataDir, 'files');
const dbFile = path.join(dataDir, 'ai-free-tools.db');
const dbExisted = fs.existsSync(dbFile);

fs.mkdirSync(filesDir, { recursive: true });

const db = await openDatabase({ dataDir });
let summary;
try {
  // seedDemo=true：写默认设置 + 首次启动的示例页面 / 工作流；
  // bootstrap 本身不会创建模型与作品，这里再显式校验一次。
  bootstrap(db, { seedDemo: args.demo });
  db.flush();

  const count = (table) => db.get(`SELECT COUNT(*) AS c FROM ${table}`).c;
  summary = {
    dataDir,
    filesDir,
    dbFile,
    dbCreated: !dbExisted,
    demoSeeded: args.demo,
    seededModels: false,
    seededWorks: false,
    counts: {
      models: count('model_config'),
      interfaces: count('interface_config'),
      pages: count('page'),
      workflows: count('workflow'),
      works: count('work'),
    },
  };
} finally {
  db.close();
}

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const { counts } = summary;
  console.log(`[init] 数据目录：${summary.dataDir}`);
  console.log(`[init] 数据库：${summary.dbFile}（${summary.dbCreated ? '新建' : '已存在，仅补默认设置'}）`);
  console.log(`[init] 页面 ${counts.pages} 个 / 工作流 ${counts.workflows} 个 / 接口 ${counts.interfaces} 个`);
  console.log('[init] 模型与作品未初始化（按要求跳过）');
  if (counts.models || counts.works) {
    console.log(`[init] 当前库中已有模型 ${counts.models} 个、作品 ${counts.works} 个，未做任何改动`);
  }
  console.log('');
  console.log('下一步：');
  console.log('  1) 在「模型管理」里添加模型并填写 API Key');
  console.log('  2) 在「接口管理」里核对接口参数模板');
  console.log('  3) 运行 npm run dev 启动桌面应用');
}
