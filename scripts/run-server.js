/** 独立运行内嵌服务（不启动 Electron，便于调试后端接口） */
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../server/index.js';

/** 与 Electron 主进程保持一致：%APPDATA%/ai-free-tools/data */
function defaultDataDir() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'ai-free-tools', 'data');
}

const dataDir = process.env.AIFT_DATA_DIR || defaultDataDir();
const port = Number(process.env.AIFT_PORT || 41700);

const handle = await startServer({ dataDir, port });
console.log(`[server] http://127.0.0.1:${handle.port}`);
console.log(`[server] 数据目录: ${dataDir}`);
console.log('[server] 健康检查: GET /api/health');

process.on('SIGINT', async () => {
  await handle.close();
  process.exit(0);
});
