<template>
  <div class="palette">
    <div class="palette-search">
      <el-input v-model="keyword" size="small" placeholder="搜索组件" prefix-icon="el-icon-search" clearable />
    </div>
    <div class="palette-tip text-muted">拖拽到右侧画布，或点「＋」添加到末尾</div>
    <div v-for="group in grouped" :key="group.name" class="palette-group">
      <div class="palette-group-title">{{ group.name }}</div>
      <div class="palette-list">
        <div
          v-for="item in group.items"
          :key="item.key"
          class="palette-item"
          draggable="true"
          :title="item.description"
          @dragstart="onDragStart($event, item)"
          @dragend="draggingKey = ''"
          @dblclick="$emit('pick', item)"
        >
          <i :class="item.icon || 'el-icon-s-operation'" />
          <span class="palette-name">{{ item.name }}</span>
          <i class="el-icon-plus palette-add" title="添加到画布" @click.stop="$emit('pick', item)" />
        </div>
      </div>
    </div>
    <div v-if="!grouped.length" class="text-muted palette-empty">没有匹配的组件</div>
  </div>
</template>

<script>
import { DND_COMPONENT_MIME } from '@/utils/dnd';

/**
 * 组件调色板：原生 HTML5 拖放（不依赖拖拽库，Electron 下行为稳定）。
 * 拖拽时把组件 key 写入 dataTransfer，画布在 drop 时读取。
 */
export default {
  name: 'ComponentPalette',
  props: {
    components: { type: Array, default: () => [] },
  },
  data() {
    return { keyword: '', draggingKey: '' };
  },
  computed: {
    filtered() {
      const kw = this.keyword.trim().toLowerCase();
      if (!kw) return this.components;
      return this.components.filter(
        (c) => c.name.toLowerCase().includes(kw) || c.key.toLowerCase().includes(kw),
      );
    },
    grouped() {
      const map = new Map();
      for (const c of this.filtered) {
        const g = c.group_name || '其他';
        if (!map.has(g)) map.set(g, []);
        map.get(g).push(c);
      }
      return [...map.entries()].map(([name, items]) => ({ name, items }));
    },
  },
  methods: {
    onDragStart(event, item) {
      this.draggingKey = item.key;
      const dt = event.dataTransfer;
      if (!dt) return;
      dt.effectAllowed = 'copy';
      dt.setData(DND_COMPONENT_MIME, item.key);
      dt.setData('text/plain', item.key);
    },
  },
};
</script>

<style scoped>
.palette {
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  height: 100%;
  overflow: auto;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  width: 100%;
}

.palette-search {
  margin-bottom: 4px;
}

.palette-tip {
  font-size: 11px;
  margin-bottom: 4px;
  line-height: 1.5;
}

.palette-group-title {
  font-size: 12px;
  color: #909399;
  padding: 8px 4px 6px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: grab;
  border: 1px dashed #dcdfe6;
  margin-bottom: 6px;
  background: #fff;
  font-size: 13px;
  user-select: none;
}

.palette-item:hover {
  border-color: #409eff;
  color: #409eff;
  background: #f2f8ff;
}

.palette-item:active {
  cursor: grabbing;
}

.palette-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.palette-add {
  color: #b1b6bf;
  font-size: 12px;
  padding: 2px;
  border-radius: 3px;
}

.palette-add:hover {
  color: #409eff;
  background: #e6f1ff;
}

.palette-empty {
  font-size: 12px;
  text-align: center;
  padding: 20px 0;
}
</style>
