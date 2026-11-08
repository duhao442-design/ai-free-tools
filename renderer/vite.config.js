import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 浏览器调试模式：把 /api、/files 代理到独立运行的内嵌服务（npm run server）
const apiProxy = process.env.AIFT_API_PROXY || '';
const proxy = apiProxy
  ? {
      '/api': { target: apiProxy, changeOrigin: true },
      '/files': { target: apiProxy, changeOrigin: true },
    }
  : undefined;

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    host: '127.0.0.1',
    proxy,
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
