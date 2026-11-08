/**
 * Electron 主进程：拉起内嵌 HTTP 服务（Node + SQLite），再打开 Vue2 渲染进程。
 * 渲染进程通过 preload 暴露的 window.aift.apiBase 访问本地接口。
 */
import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEV_SERVER = process.env.AIFT_DEV_SERVER || '';
const isDev = Boolean(DEV_SERVER);

let mainWindow = null;
let serverHandle = null;

function resolveDataDir() {
  const fromEnv = process.env.AIFT_DATA_DIR;
  if (fromEnv) {
    fs.mkdirSync(fromEnv, { recursive: true });
    return fromEnv;
  }
  // 固定目录：开发态（electron .）与安装版共用同一份数据，避免「换一种启动方式数据就不见了」
  const dir = path.join(app.getPath('appData'), 'ai-free-tools', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开数据目录',
          click: () => shell.openPath(resolveDataDir()),
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 AI Free Tools',
              message: 'AI Free Tools 0.1.0',
              detail: `低代码 AI 工作流桌面应用\n数据目录：${resolveDataDir()}\n本地服务：${serverHandle?.baseUrl || '-'}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#f5f7fa',
    title: 'AI Free Tools',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--api-base=${serverHandle.baseUrl}`],
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER);
    if (process.env.AIFT_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexFile = path.join(ROOT, 'dist', 'renderer', 'index.html');
    if (!fs.existsSync(indexFile)) {
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<h2 style="font-family:sans-serif">渲染层尚未构建</h2><p>请先运行 <code>npm run build:renderer</code></p>`,
        )}`,
      );
    } else {
      mainWindow.loadFile(indexFile);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 调试/自动化时可跳过单实例锁（AIFT_SKIP_SINGLE_INSTANCE=1），便于并行验证
const gotLock = process.env.AIFT_SKIP_SINGLE_INSTANCE === '1' ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const dataDir = resolveDataDir();
      serverHandle = await startServer({ dataDir });
      console.log(`[main] 本地服务已启动: ${serverHandle.baseUrl}`);
      console.log(`[main] 数据目录: ${dataDir}`);
      buildMenu();
      createWindow();
    } catch (e) {
      console.error('[main] 启动失败:', e);
      dialog.showErrorBox('启动失败', String(e?.stack || e));
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // 退出前先把数据库刷盘、释放数据目录锁（Electron 不会 await 异步回调，先阻止退出）
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    (async () => {
      try {
        if (serverHandle) await serverHandle.close();
      } catch (e) {
        console.error('[main] 关闭服务失败:', e);
      } finally {
        serverHandle = null;
        app.quit();
      }
    })();
  });
}

ipcMain.handle('aift:open-external', (event, url) => {
  if (/^https?:/i.test(String(url))) return shell.openExternal(String(url));
  return false;
});

ipcMain.handle('aift:show-item', (event, target) => {
  shell.showItemInFolder(String(target));
  return true;
});

ipcMain.handle('aift:data-dir', () => resolveDataDir());
ipcMain.handle('aift:api-base', () => serverHandle?.baseUrl || '');

/** 截取窗口内指定区域，返回 PNG dataURL（用于「漫画成品页 → 下载为图片」） */
ipcMain.handle('aift:capture-page', async (event, rect) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('窗口不存在');
  const area = {
    x: Math.max(0, Math.round(Number(rect?.x) || 0)),
    y: Math.max(0, Math.round(Number(rect?.y) || 0)),
    width: Math.max(1, Math.round(Number(rect?.width) || 1)),
    height: Math.max(1, Math.round(Number(rect?.height) || 1)),
  };
  const image = await win.webContents.capturePage(area);
  return { dataUrl: image.toDataURL(), width: image.getSize().width, height: image.getSize().height };
});

/** 保存任意文件（base64），弹保存对话框 */
ipcMain.handle('aift:save-file', async (event, payload) => {
  const base64 = String(payload?.base64 || '');
  if (!base64) throw new Error('文件数据为空');
  const buffer = Buffer.from(base64, 'base64');
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: '保存文件',
    defaultPath: path.join(app.getPath('downloads'), String(payload?.defaultName || `export-${Date.now()}.bin`)),
    filters: Array.isArray(payload?.filters) ? payload.filters : undefined,
  });
  if (result.canceled || !result.filePath) return { saved: false, canceled: true };
  fs.writeFileSync(result.filePath, buffer);
  return { saved: true, path: result.filePath };
});

/** 保存 dataURL 图片：弹出保存对话框，默认放到「下载」目录 */
ipcMain.handle('aift:save-image', async (event, payload) => {
  const dataUrl = String(payload?.dataUrl || '');
  if (!dataUrl.startsWith('data:image/')) throw new Error('图片数据无效');
  const win = BrowserWindow.fromWebContents(event.sender);
  const base64 = dataUrl.split(',')[1] || '';
  const buffer = Buffer.from(base64, 'base64');
  const defaultName = String(payload?.defaultName || `image-${Date.now()}.png`);
  const downloads = app.getPath('downloads');
  const result = await dialog.showSaveDialog(win, {
    title: '保存图片',
    defaultPath: path.join(downloads, defaultName),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false, canceled: true };
  fs.writeFileSync(result.filePath, buffer);
  return { saved: true, path: result.filePath };
});
