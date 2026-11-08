<template>
  <div class="image-grid-block">
    <div class="ig-head">
      <span class="ig-label">{{ label }}</span>
      <span class="text-muted">{{ imageList.length }} 张</span>
    </div>
    <div class="ig-grid" :style="gridStyle">
      <div v-for="(img, i) in imageList" :key="i" class="ig-item">
        <image-viewer :src="img" :size="Number(size) || 160" />
        <div v-if="showIndex" class="ig-index">#{{ i + 1 }}</div>
        <div v-if="labelOf(i)" class="ig-name">{{ labelOf(i) }}</div>
      </div>
    </div>
    <div v-if="!imageList.length" class="ig-empty text-muted">暂无图片</div>
  </div>
</template>

<script>
import ImageViewer from '@/components/ui/ImageViewer.vue';
import { isImageUrl } from '@/utils/format';

export default {
  name: 'ImageGrid',
  components: { ImageViewer },
  props: {
    images: { type: [Array, String], default: () => [] },
    columns: { type: Number, default: 4 },
    size: { type: Number, default: 160 },
    showIndex: { type: Boolean, default: true },
    label: { type: String, default: '图片产出' },
    labels: { type: Array, default: () => [] },
  },
  data() {
    return {};
  },
  computed: {
    imageList() {
      let list = this.images;
      if (typeof list === 'string') {
        try {
          const parsed = JSON.parse(list);
          list = Array.isArray(parsed) ? parsed : [list];
        } catch (e) {
          list = list.split('\n');
        }
      }
      if (!Array.isArray(list)) list = list ? [list] : [];
      return list.filter((v) => typeof v === 'string' && v && (isImageUrl(v) || /^https?:\/\//.test(v)));
    },
    gridStyle() {
      const n = Math.max(1, Number(this.columns) || 4);
      return { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
    },
  },
  methods: {
    labelOf(index) {
      const label = this.labels && this.labels[index];
      return label === undefined || label === null ? '' : String(label);
    },
  },
};
</script>

<style scoped>
.ig-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ig-label {
  font-weight: 600;
  color: #1f2d3d;
}

.ig-grid {
  display: grid;
  gap: 8px;
}

.ig-item {
  position: relative;
}

.ig-index {
  position: absolute;
  left: 4px;
  top: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  border-radius: 3px;
  padding: 0 4px;
}

.ig-name {
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ig-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
}
</style>
