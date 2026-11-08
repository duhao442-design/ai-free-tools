<template>
  <div
    class="design-canvas-inner"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="canvas-list">
      <div
        v-for="(blk, i) in layout"
        :key="blk.id"
        class="design-block"
        :class="{ active: selectedId === blk.id, 'drop-before': dropIndex === i }"
        draggable="true"
        @click="$emit('select', blk.id)"
        @dragstart="onBlockDragStart($event, i)"
        @dragend="onBlockDragEnd"
        @dragover.prevent.stop="onDragOver"
        @drop.prevent.stop="onDrop"
      >
        <div class="design-block-bar">
          <span>
            <i class="el-icon-rank drag-handle" />
            {{ nameOf(blk.component) }}
            <span class="text-muted">· {{ spanLabel(blk) }}</span>
          </span>
          <span class="ops" @click.stop>
            <el-tooltip content="整行/半行" placement="top">
              <i class="el-icon-full-screen" @click="$emit('toggle-span', blk.id)" />
            </el-tooltip>
            <el-tooltip content="上移" placement="top">
              <i class="el-icon-top" @click="$emit('move', { id: blk.id, delta: -1 })" />
            </el-tooltip>
            <el-tooltip content="下移" placement="top">
              <i class="el-icon-bottom" @click="$emit('move', { id: blk.id, delta: 1 })" />
            </el-tooltip>
            <el-tooltip content="复制" placement="top">
              <i class="el-icon-document-copy" @click="$emit('duplicate', blk.id)" />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <i class="el-icon-delete" @click="$emit('remove', blk.id)" />
            </el-tooltip>
          </span>
        </div>
        <div class="design-block-body">
          <runtime-block :block="blk" :resolved="resolvedMap" :spec-map="specMap" />
        </div>
      </div>
    </div>

    <div v-if="!layout.length" class="canvas-empty" :class="{ 'drag-over': dragOver }">
      <i class="el-icon-plus" />
      <div>从左侧拖拽组件到这里</div>
    </div>
  </div>
</template>

<script>
import RuntimeBlock from '@/components/runtime/RuntimeBlock.vue';
import { DND_COMPONENT_MIME } from '@/utils/dnd';

export default {
  name: 'DesignCanvas',
  components: { RuntimeBlock },
  props: {
    layout: { type: Array, default: () => [] },
    components: { type: Array, default: () => [] },
    selectedId: { type: String, default: '' },
    resolved: { type: Array, default: () => [] },
    specMap: { type: Object, default: () => ({}) },
  },
  data() {
    return { dragOver: false, dropIndex: -1, draggingBlockIndex: -1 };
  },
  computed: {
    resolvedMap() {
      const map = {};
      for (const item of this.resolved || []) map[item.id] = item;
      return map;
    },
  },
  methods: {
    nameOf(key) {
      const hit = this.components.find((c) => c.key === key);
      return hit ? hit.name : key;
    },
    spanLabel(blk) {
      const span = Number(blk.span) || 24;
      return span >= 24 ? '整行' : `${Math.round((span / 24) * 100)}%`;
    },
    isComponentDrag(event) {
      const dt = event.dataTransfer;
      if (!dt) return false;
      return Array.from(dt.types || []).includes(DND_COMPONENT_MIME);
    },
    onDragOver(event) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = this.isComponentDrag(event) ? 'copy' : 'move';
      this.dragOver = true;
      this.dropIndex = this.computeDropIndex(event);
    },
    onDragLeave(event) {
      // 只有真正离开画布才清除高亮
      const next = event.relatedTarget;
      if (next && this.$el.contains(next)) return;
      this.dragOver = false;
      this.dropIndex = -1;
    },
    computeDropIndex(event) {
      const blocks = Array.from(this.$el.querySelectorAll('.design-block'));
      let index = blocks.length;
      for (let i = 0; i < blocks.length; i += 1) {
        const rect = blocks[i].getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          index = i;
          break;
        }
      }
      return index;
    },
    onDrop(event) {
      event.preventDefault();
      const dt = event.dataTransfer;
      const index = this.computeDropIndex(event);
      this.dragOver = false;
      this.dropIndex = -1;

      const componentKey = dt ? dt.getData(DND_COMPONENT_MIME) : '';
      if (componentKey) {
        this.$emit('add', { key: componentKey, index });
        return;
      }
      if (this.draggingBlockIndex >= 0) {
        let to = index;
        if (to > this.draggingBlockIndex) to -= 1;
        if (to !== this.draggingBlockIndex) this.$emit('reorder', { from: this.draggingBlockIndex, to });
      }
      this.draggingBlockIndex = -1;
    },
    onBlockDragStart(event, index) {
      this.draggingBlockIndex = index;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        // Firefox 需要 setData 才会真正开始拖拽
        event.dataTransfer.setData('text/plain', String(index));
      }
    },
    onBlockDragEnd() {
      this.draggingBlockIndex = -1;
      this.dragOver = false;
      this.dropIndex = -1;
    },
  },
};
</script>

<style scoped>
.design-canvas-inner {
  min-height: 240px;
  border-radius: 8px;
  transition: box-shadow 0.15s;
}

.design-canvas-inner.drag-over {
  box-shadow: inset 0 0 0 2px #a3d0ff;
}

.canvas-list {
  min-height: 120px;
}

.design-block {
  border: 1px dashed transparent;
  border-radius: 8px;
  padding: 4px;
  transition: border-color 0.15s;
}

.design-block + .design-block {
  margin-top: 10px;
}

.design-block:hover {
  border-color: #c6e2ff;
}

.design-block.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.12);
}

.design-block.drop-before {
  border-top: 2px solid #409eff;
}

.design-block-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #909399;
  padding: 0 2px 4px;
}

.design-block-bar .ops {
  display: flex;
  gap: 8px;
}

.design-block-bar .ops i {
  cursor: pointer;
}

.design-block-bar .ops i:hover {
  color: #409eff;
}

.drag-handle {
  cursor: grab;
}

.design-block-body {
  background: #fff;
  border-radius: 6px;
  padding: 12px 14px;
  pointer-events: none;
}

.canvas-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #b1b6bf;
  font-size: 13px;
  padding: 80px 0;
  border: 1px dashed #d4d9e2;
  border-radius: 8px;
  background: #fff;
}

.canvas-empty.drag-over {
  border-color: #409eff;
  color: #409eff;
  background: #f2f8ff;
}
</style>
