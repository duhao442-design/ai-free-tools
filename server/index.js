/** 内嵌 HTTP 服务（运行在 Electron 主进程，也可用 node scripts/run-server.js 单独跑） */
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from './db/index.js';
import { bootstrap } from './db/bootstrap.js';
import { setRuntime } from './core/storage/index.js';
import { fail } from './routes/helpers.js';

import modelsRouter from './routes/models.js';
import interfacesRouter from './routes/interfaces.js';
import assetsRouter from './routes/assets.js';
import componentsRouter from './routes/components.js';
import pagesRouter from './routes/pages.js';
import workflowsRouter from './routes/workflows.js';
import worksRouter from './routes/works.js';
import settingsRouter from './routes/settings.js';
import filesRouter from './routes/files.js';
import { now } from './db/index.js';

/**
 * 启动时恢复「上次没跑完」的步骤：应用被关闭 / 进程崩溃 / 请求超时中断，
 * work_step 会停在 running，界面上看起来「执行完什么都没有」。这里统一标记为失败并写清原因。
 */
function recoverInterruptedSteps(db) {
  const ts = now();
  const stale = db.run(
    `UPDATE work_step SET status = 'failed', message = ?, finished_at = ?, updated_at = ?
     WHERE status = 'running'`,
    ['上次执行被中断（应用退出或请求超时），请重新执行。', ts, ts],
  );
  if (!stale || !stale.changes) return;
  console.log(`[recover] 清理未完成步骤：${stale.changes} 条`);
  // 重新计算这些作品的状态，避免一直显示「进行中」
  for (const row of db.all('SELECT DISTINCT work_id FROM work_step WHERE status = ?', ['failed'])) {
    const steps = db.all('SELECT status FROM work_step WHERE work_id = ?', [row.work_id]);
    const anyFailed = steps.some((s) => s.status === 'failed');
    const allSuccess = steps.length > 0 && steps.every((s) => s.status === 'success');
    const status = anyFailed ? 'failed' : (allSuccess ? 'done' : 'running');
    db.run('UPDATE work SET status = ?, updated_at = ? WHERE id = ?', [status, ts, row.work_id]);
  }
}

export async function startServer({ dataDir, host = '127.0.0.1', port = 0 } = {}) {
  if (!dataDir) throw new Error('dataDir 必填');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });

  const db = await openDatabase({ dataDir });
  bootstrap(db);
  recoverInterruptedSteps(db);

  const app = express();
  app.locals.db = db;
  app.locals.dataDir = dataDir;

  app.use(cors());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // 本地文件访问（本地存储适配器的产物）
  app.use(
    '/files',
    express.static(path.join(dataDir, 'files'), {
      maxAge: '7d',
      fallthrough: true,
      setHeaders(res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    }),
  );

  app.use(modelsRouter());
  app.use(interfacesRouter());
  app.use(assetsRouter());
  app.use(componentsRouter());
  app.use(pagesRouter());
  app.use(workflowsRouter());
  app.use(worksRouter());
  app.use(settingsRouter());
  app.use(filesRouter());

  app.get('/api/health', (req, res) => {
    res.json({ code: 0, message: 'ok', data: { status: 'healthy', dataDir, version: '0.1.0' } });
  });

  app.use((req, res) => fail(res, `接口不存在: ${req.method} ${req.path}`, -1, 404));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[server] 未处理异常:', err);
    if (res.headersSent) return;
    fail(res, err?.message || '服务器内部错误', -1, 500);
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, host, resolve));
  const actualPort = server.address().port;
  const baseUrl = `http://${host}:${actualPort}`;
  app.locals.baseUrl = baseUrl;
  setRuntime({ dataDir, baseUrl });

  return {
    app,
    server,
    db,
    port: actualPort,
    baseUrl,
    async close() {
      await new Promise((resolve) => {
        server.close(resolve);
        // Electron 退出时避免被 keep-alive 连接拖住
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
      db.close();
    },
  };
}
