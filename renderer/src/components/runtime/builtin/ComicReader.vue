<template>
  <div class="comic-reader">
    <div class="cr-toolbar">
      <span class="cr-title">{{ title || '漫画成品' }}</span>
      <span class="cr-sub text-muted">{{ panels.length }} 格 · {{ images.length }} 张图</span>

      <el-radio-group v-if="showLayoutSwitch" v-model="mode" size="mini" class="cr-layouts">
        <el-radio-button label="grid">一页多格</el-radio-button>
        <el-radio-button label="single">一页一格</el-radio-button>
        <el-radio-button label="strip">拼接条漫</el-radio-button>
        <el-radio-button label="mosaic">拼贴整页</el-radio-button>
      </el-radio-group>

      <el-button v-if="hasOffsets" type="text" size="mini" @click="resetOffsets">重置气泡位置</el-button>

      <el-button class="cr-download" type="primary" size="small" icon="el-icon-download" :loading="downloading" @click="download">
        下载 ZIP（一页一张）
      </el-button>
    </div>

    <div ref="sheet" class="cr-sheet" :class="`mode-${mode}`" :style="sheetStyle">
      <div v-for="page in pages" :key="page.key" class="cr-page">
        <div class="cr-page-no">{{ page.label }}</div>
        <div class="cr-grid" :style="gridStyle">
          <div v-for="panel in page.panels" :key="panel.key" class="cr-panel">
            <div class="cr-imgwrap">
              <img v-if="panel.image" :src="normalize(panel.image)" :alt="panel.key" draggable="false" />
              <div v-else class="cr-noimg text-muted">未生成</div>
              <div
                v-for="group in panel.bubbleGroups"
                :key="group.pos"
                :class="['cr-bubbles', `pos-${group.pos}`]"
              >
                <div
                  v-for="(b, bi) in group.items"
                  :key="bi"
                  :class="[
                    'cr-bubble',
                    `type-${b.type}`,
                    b.direction === 'up' ? 'dir-up' : 'dir-down',
                    { 'is-dragging': dragKey === b.key, 'has-size': hasSize(b.key) },
                  ]"
                  :style="bubbleStyle(b.key)"
                  :data-key="b.key"
                  @mousedown.prevent="startDrag(b.key, $event)"
                  @touchstart.prevent="startDrag(b.key, $event)"
                >
                  <span class="cr-text">{{ b.text }}</span>
                  <span
                    v-if="b.type === 'speech'"
                    :class="['cr-tail', `dir-${b.direction}`]"
                    :style="tailStyle(b.key)"
                    @mousedown.stop.prevent="startTailDrag(b.key, $event)"
                    @touchstart.stop.prevent="startTailDrag(b.key, $event)"
                  />
                  <span
                    class="cr-resize"
                    @mousedown.stop.prevent="startResize(b.key, $event)"
                    @touchstart.stop.prevent="startResize(b.key, $event)"
                  />
                </div>
              </div>
            </div>
            <div v-if="showCaption" class="cr-cap text-muted">{{ panel.key }}</div>
          </div>
        </div>
      </div>
      <div v-if="!pages.length" class="cr-empty text-muted">还没有可组装的画面，请先完成「最终成图」。</div>
    </div>
    <div v-if="showLayoutSwitch" class="cr-hint text-muted">
      提示：气泡可拖动微调位置；切换排版仅影响显示与导出，不改动数据。
    </div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import { zipStore, formatFileName } from '@/utils/zip';

const POS_ALIASES = [
  [['左上', '左上角', 'tl'], 'tl'],
  [['右上', '右上角', 'tr'], 'tr'],
  [['左下', '左下角', 'bl'], 'bl'],
  [['右下', '右下角', 'br'], 'br'],
  [['中上', '顶部', '上方', 'tc'], 'tc'],
  [['底部', '下方', 'bc'], 'bc'],
  [['中间', '居中', 'cc'], 'cc'],
];

const TOP_POS = new Set(['tl', 'tr', 'tc', 'cc']);

function normalizePos(value, type) {
  const raw = String(value || '').trim();
  for (const [aliases, key] of POS_ALIASES) {
    if (aliases.some((a) => raw.includes(a))) return key;
  }
  if (type === 'narration') return 'tl';
  if (type === 'thought') return 'tr';
  return 'tr';
}

/** 去掉「林策：」「王举人:」这类说话人前缀（台词里不该带人名） */
function cleanDialogueText(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^([\u4e00-\u9fa5A-Za-z0-9·（）()]{1,8})\s*[：:]\s*(.+)$/);
  if (!m) return raw;
  const rest = m[2].trim();
  if (!rest) return raw;
  return rest;
}

export default {
  name: 'ComicReader',
  mixins: [runtimeMixin],
  props: {
    images: { type: [Array, String], default: () => [] },
    scenes: { type: [Array, String], default: () => [] },
    title: { type: String, default: '' },
    columns: { type: Number, default: 2 },
    sheetWidth: { type: Number, default: 1200 },
    gap: { type: Number, default: 18 },
    showCaption: { type: Boolean, default: false },
    layout: { type: String, default: 'grid' },
    showLayoutSwitch: { type: Boolean, default: true },
    filePattern: { type: String, default: '{index:3}-{label}' },
  },
  data() {
    return {
      downloading: false,
      mode: ['grid', 'single', 'strip', 'mosaic'].includes(this.layout) ? this.layout : 'grid',
      offsets: {},
      dragKey: '',
    };
  },
  created() {
    this.loadOffsets();
  },
  mounted() {
    this.fitAllText();
  },
  watch: {
    layout(value) {
      if (['grid', 'single', 'strip', 'mosaic'].includes(value)) this.mode = value;
    },
    pages: {
      deep: true,
      handler() {
        this.fitAllText();
      },
    },
  },
  computed: {
    storageKey() {
      const workId = (this.rt && this.rt.workId) || 'design';
      return `aift:comic-bubbles:${workId}:${this.title || ''}`;
    },
    hasOffsets() {
      return Object.keys(this.offsets || {}).some((k) => {
        const o = this.offsets[k] || {};
        return o.x || o.y || o.w || o.h || o.tail !== undefined;
      });
    },
    imageList() {
      const list = toArray(this.images).filter((it) => it && typeof it === 'object');
      // 按 页码 → 格号 排序，避免结果顺序（勾选/合并顺序）导致排版乱序
      return list.slice().sort((a, b) => {
        const pa = Number(a.page || 0);
        const pb = Number(b.page || 0);
        if (pa !== pb) return pa - pb;
        return Number(a.panel || 0) - Number(b.panel || 0);
      });
    },
    sceneList() {
      return toArray(this.scenes).filter((it) => it && typeof it === 'object');
    },
    scenesByKey() {
      const map = {};
      for (const s of this.sceneList) {
        const key = `${s.page}-${s.panel}`;
        if (key !== 'undefined-undefined') map[key] = s;
      }
      return map;
    },
    panels() {
      return this.imageList.map((img) => {
        const key = `${img.page}-${img.panel}`;
        const scene = this.scenesByKey[key] || (img.description ? img : null);
        return this.buildPanel(img, scene);
      });
    },
    pages() {
      if (this.mode === 'single') {
        return this.panels.map((panel, i) => ({
          key: `s-${i}`,
          label: `第 ${panel.page} 页 · 第 ${panel.panel} 格`,
          panels: [panel],
        }));
      }
      const map = new Map();
      for (const panel of this.panels) {
        const page = panel.page || 1;
        if (!map.has(page)) map.set(page, []);
        map.get(page).push(panel);
      }
      return [...map.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([page, panels]) => ({ key: `p-${page}`, label: `第 ${page} 页`, panels }));
    },
    sheetStyle() {
      return { width: this.sheetWidth + 'px', maxWidth: '100%' };
    },
    gridStyle() {
      let cols = Math.max(1, Number(this.columns) || 2);
      if (this.mode === 'single') cols = 1;
      if (this.mode === 'strip') cols = 1;
      const gap = this.mode === 'grid' || this.mode === 'single' ? this.gap : 0;
      return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: `${gap}px` };
    },
  },
  methods: {
    loadOffsets() {
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) this.offsets = JSON.parse(raw) || {};
      } catch (e) {
        /* ignore */
      }
    },
    saveOffsets() {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.offsets));
      } catch (e) {
        /* ignore */
      }
    },
    resetOffsets() {
      this.offsets = {};
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch (e) {
        /* ignore */
      }
    },
    normalize(src) {
      const s = String(src || '');
      if (!s) return '';
      if (/^(https?:|data:|blob:)/i.test(s)) return s;
      if (s.startsWith('/files/')) {
        const base = (window.aift && window.aift.apiBase) || '';
        return `${base}${s}`;
      }
      return s;
    },
    bubbleStyle(key) {
      const s = this.offsets[key] || {};
      const style = { transform: `translate(${s.x || 0}px, ${s.y || 0}px)` };
      if (s.w) style.width = `${s.w}px`;
      if (s.h) style.height = `${s.h}px`;
      return style;
    },
    hasSize(key) {
      const s = this.offsets[key] || {};
      return Boolean(s.w || s.h);
    },
    tailStyle(key) {
      const s = this.offsets[key] || {};
      const left = s.tail === undefined ? 22 : s.tail;
      return { left: `${left}px` };
    },
    buildPanel(img, scene) {
      const key = `${img.page}-${img.panel}`;
      const dialogues = scene
        ? (Array.isArray(scene.dialogue) ? scene.dialogue : scene.dialogue ? [scene.dialogue] : [])
        : [];
      const groups = new Map();
      let bi = 0;
      for (const d of dialogues) {
        if (!d || !d.text) continue;
        const type = d.type || 'speech';
        const pos = normalizePos(d.bubblePosition || d.bubble_position || d.position, type);
        const bubbleKey = `${key}-${pos}-${bi}`;
        bi += 1;
        if (!groups.has(pos)) groups.set(pos, []);
        groups.get(pos).push({
          key: bubbleKey,
          text: cleanDialogueText(d.text),
          type,
          direction: TOP_POS.has(pos) ? 'down' : 'up',
        });
      }
      return {
        key,
        page: img.page || (scene && scene.page) || 1,
        panel: img.panel || (scene && scene.panel) || 1,
        image: img.image_url || img.image || '',
        bubbleGroups: [...groups.entries()].map(([pos, items]) => ({ pos, items })),
      };
    },
    startDrag(key, event) {
      const point = event.touches ? event.touches[0] : event;
      const startX = point.clientX;
      const startY = point.clientY;
      const start = this.offsets[key] || { x: 0, y: 0 };
      this.dragKey = key;
      const move = (ev) => {
        const p = ev.touches ? ev.touches[0] : ev;
        this.$set(this.offsets, key, {
          x: Math.round(start.x + (p.clientX - startX)),
          y: Math.round(start.y + (p.clientY - startY)),
        });
      };
      const up = () => {
        this.dragKey = '';
        this.saveOffsets();
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    },
    /** 拖拽气泡尾巴：沿气泡上/下边缘水平移动 */
    startTailDrag(key, event) {
      const point = event.touches ? event.touches[0] : event;
      const bubbleEl = event.target.closest('.cr-bubble');
      if (!bubbleEl) return;
      const width = bubbleEl.getBoundingClientRect().width;
      const state = this.offsets[key] || {};
      const startLeft = state.tail === undefined ? 22 : state.tail;
      const startX = point.clientX;
      const move = (ev) => {
        const p = ev.touches ? ev.touches[0] : ev;
        const next = Math.round(startLeft + (p.clientX - startX));
        const max = Math.max(8, Math.round(width) - 20);
        this.$set(this.offsets, key, { ...(this.offsets[key] || {}), tail: Math.min(max, Math.max(6, next)) });
      };
      const up = () => {
        this.saveOffsets();
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    },
    /** 拖拽右下角调整气泡宽高，文字随后自适应 */
    startResize(key, event) {
      const point = event.touches ? event.touches[0] : event;
      const bubbleEl = event.target.closest('.cr-bubble');
      if (!bubbleEl) return;
      const rect = bubbleEl.getBoundingClientRect();
      const startW = Math.round(rect.width);
      const startH = Math.round(rect.height);
      const startX = point.clientX;
      const startY = point.clientY;
      const move = (ev) => {
        const p = ev.touches ? ev.touches[0] : ev;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;
        const base = this.offsets[key] || {};
        const next = { ...base, w: Math.max(80, Math.round(startW + dx)) };
        // 只横向拖动时保持高度自适应；明显纵向拖动才固定高度
        if (Math.abs(dy) > 6) next.h = Math.max(36, Math.round((base.h || startH) + dy));
        this.$set(this.offsets, key, next);
      };
      const up = () => {
        this.fitAllText();
        this.saveOffsets();
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    },
    /** 文字自适应：限高时逐级缩小字号，直到放得下（最小 10px） */
    fitAllText() {
      this.$nextTick(() => {
        const sheet = this.$refs.sheet;
        if (!sheet) return;
        const nodes = sheet.querySelectorAll('.cr-bubble');
        nodes.forEach((el) => {
          const textEl = el.querySelector('.cr-text');
          if (!textEl) return;
          textEl.style.fontSize = '';
          if (!el.style.height) return;
          let size = 14;
          let guard = 0;
          while (el.scrollHeight > el.clientHeight + 1 && size > 10 && guard < 10) {
            size -= 1;
            textEl.style.fontSize = `${size}px`;
            guard += 1;
          }
        });
      });
    },
    /** 把一个 .cr-page 元素分段截屏拼成一张 PNG（元素可能高于窗口） */
    async captureElement(el) {
      const first = el.getBoundingClientRect();
      const width = Math.ceil(first.width);
      const docTop = first.top + window.scrollY;
      const total = Math.ceil(first.height);
      const viewport = window.innerHeight;
      const scale = window.devicePixelRatio || 1;
      const step = Math.max(200, Math.floor(viewport * 0.9));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(total * scale);
      const ctx = canvas.getContext('2d');
      const originalScroll = window.scrollY;
      let drawn = 0;
      try {
        while (drawn < total) {
          window.scrollTo(0, docTop + drawn);
          await new Promise((r) => setTimeout(r, 110));
          const rect = el.getBoundingClientRect();
          const actual = Math.max(0, Math.round(window.scrollY - docTop));
          const y = Math.max(0, Math.ceil(rect.top));
          const h = Math.min(step, total - actual, viewport - y);
          if (h <= 0) break;
          const shot = await window.aift.capturePage({
            x: Math.ceil(rect.left),
            y,
            width: Math.min(width, window.innerWidth - Math.ceil(rect.left)),
            height: h,
          });
          if (!shot || !shot.dataUrl) throw new Error('截屏失败');
          const img = await loadImage(shot.dataUrl);
          ctx.drawImage(img, 0, Math.ceil(actual * scale), canvas.width, Math.ceil(h * scale));
          drawn = actual + h;
        }
      } finally {
        window.scrollTo(0, originalScroll);
      }
      return canvas.toDataURL('image/png');
    },
    /** 一页一张 PNG，按命名规则打包成 ZIP 下载 */
    async download() {
      const sheet = this.$refs.sheet;
      if (!sheet) return;
      if (!window.aift || !window.aift.capturePage) {
        this.$message.warning('导出需要在桌面版应用中使用');
        return;
      }
      this.downloading = true;
      try {
        const pageEls = [...sheet.querySelectorAll('.cr-page')];
        if (!pageEls.length) {
          this.$message.warning('没有可导出的页面');
          return;
        }
        const files = [];
        for (let i = 0; i < pageEls.length; i += 1) {
          const page = this.pages[i] || {};
          const panel = (page.panels && page.panels[0]) || {};
          const dataUrl = await this.captureElement(pageEls[i]);
          const label = page.label || `page-${i + 1}`;
          const baseName = formatFileName(this.filePattern, {
            index: i + 1,
            page: panel.page !== undefined ? panel.page : i + 1,
            label,
          });
          files.push({ name: `${baseName}.png`, data: dataUrlToBytes(dataUrl) });
        }
        const zipBytes = zipStore(files);
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const saved = await window.aift.saveFile({
          base64: bytesToBase64(zipBytes),
          defaultName: `漫画成品-${stamp}.zip`,
          filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
        });
        if (saved && saved.saved) this.$message.success(`已导出 ${files.length} 页：${saved.path}`);
      } catch (e) {
        this.$message.error(`导出失败：${e.message || e}`);
      } finally {
        this.downloading = false;
      }
    },
  },
};

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

/** data:image/png;base64,... → Uint8Array */
function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Uint8Array → base64（分块，避免超长参数爆栈） */
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
</script>

<style scoped>
.comic-reader {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cr-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 8px;
  flex-wrap: wrap;
}

.cr-title {
  font-weight: 600;
  color: #1f2d3d;
  font-size: 15px;
}

.cr-sub {
  font-size: 12px;
}

.cr-layouts {
  margin-left: 6px;
}

.cr-download {
  margin-left: auto;
}

.cr-sheet {
  margin: 0 auto;
  background: #f4f1ea;
  padding: 24px;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.cr-page {
  margin-bottom: 24px;
}

.mode-strip .cr-page,
.mode-mosaic .cr-page {
  margin-bottom: 12px;
}

.cr-page-no {
  font-size: 13px;
  color: #8a7f6b;
  margin-bottom: 8px;
  font-weight: 600;
  letter-spacing: 1px;
}

.cr-grid {
  display: grid;
}

.cr-panel {
  min-width: 0;
}

.cr-imgwrap {
  position: relative;
  background: #fff;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.mode-strip .cr-imgwrap,
.mode-mosaic .cr-imgwrap {
  border-radius: 0;
  box-shadow: none;
}

.cr-imgwrap img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
}

.cr-noimg {
  padding: 40px 0;
  text-align: center;
  font-size: 12px;
}

.cr-cap {
  font-size: 11px;
  margin-top: 4px;
}

.cr-bubbles {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 44%;
  pointer-events: none;
}

.pos-tl { top: 3%; left: 3%; align-items: flex-start; }
.pos-tr { top: 3%; right: 3%; align-items: flex-end; }
.pos-bl { bottom: 3%; left: 3%; align-items: flex-start; }
.pos-br { bottom: 3%; right: 3%; align-items: flex-end; }
.pos-tc { top: 3%; left: 50%; transform: translateX(-50%); align-items: center; }
.pos-bc { bottom: 3%; left: 50%; transform: translateX(-50%); align-items: center; }
.pos-cc { top: 50%; left: 50%; transform: translate(-50%, -50%); align-items: center; }

.cr-bubble {
  position: relative;
  background: #fff;
  border: 2px solid #2b2b2b;
  border-radius: 14px;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.5;
  color: #1f1f1f;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  word-break: break-word;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.15s;
}

.cr-bubble:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.cr-bubble.is-dragging {
  cursor: grabbing;
  z-index: 5;
}

.cr-bubble.has-size {
  display: flex;
  align-items: flex-start;
  overflow: hidden;
}

.cr-text {
  display: block;
  width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 气泡尾巴：可沿上/下边缘拖动 */
.cr-tail {
  position: absolute;
  width: 13px;
  height: 13px;
  background: #fff;
  border-right: 2px solid #2b2b2b;
  border-bottom: 2px solid #2b2b2b;
  transform: rotate(45deg);
  cursor: ew-resize;
}

.cr-tail.dir-down {
  bottom: -9px;
  border-radius: 0 0 2px 0;
}

.cr-tail.dir-up {
  top: -9px;
  transform: rotate(225deg);
  border-radius: 0 0 2px 0;
}

/* 右下角缩放手柄 */
.cr-resize {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 45%, rgba(43, 43, 43, 0.55) 45%, rgba(43, 43, 43, 0.55) 55%, transparent 55%);
  opacity: 0;
  transition: opacity 0.15s;
}

.cr-bubble:hover .cr-resize,
.cr-bubble.is-dragging .cr-resize {
  opacity: 1;
}

.cr-bubble.type-thought {
  border-radius: 18px;
  border-style: dotted;
}

.cr-bubble.type-narration {
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.96);
  font-size: 13px;
  font-style: italic;
  cursor: grab;
}

.cr-empty {
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
}

.cr-hint {
  font-size: 11px;
  text-align: center;
}
</style>
