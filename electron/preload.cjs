/**
 * 预加载脚本（CommonJS）：向渲染进程暴露最小化的桌面能力。
 */
const { contextBridge, ipcRenderer } = require('electron');

function readArg(prefix) {
  const hit = (process.argv || []).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const apiBase = readArg('--api-base=');

contextBridge.exposeInMainWorld('aift', {
  apiBase,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  openExternal: (url) => ipcRenderer.invoke('aift:open-external', url),
  showItemInFolder: (target) => ipcRenderer.invoke('aift:show-item', target),
  dataDir: () => ipcRenderer.invoke('aift:data-dir'),
  // 漫画成品页导出：截取窗口区域 / 保存 PNG
  capturePage: (rect) => ipcRenderer.invoke('aift:capture-page', rect),
  saveImage: (payload) => ipcRenderer.invoke('aift:save-image', payload),
  saveFile: (payload) => ipcRenderer.invoke('aift:save-file', payload),
});
