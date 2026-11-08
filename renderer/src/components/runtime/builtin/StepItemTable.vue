<template>
  <div class="step-item-table">
    <div class="sit-head">
      <span class="sit-label">{{ label }}</span>
      <div class="sit-ops">
        <el-tag size="mini" type="info">{{ rows.length }} 条</el-tag>
        <el-button v-if="selectable" size="mini" @click="selectAll">全选</el-button>
        <el-button v-if="selectable" size="mini" @click="clearSelection">清空选择</el-button>
      </div>
    </div>

    <el-table
      ref="table"
      :data="rows"
      size="mini"
      border
      :max-height="maxHeight"
      :row-class-name="rowClass"
      @selection-change="onSelectionChange"
    >
      <el-table-column v-if="selectable" type="selection" width="44" />
      <el-table-column v-if="showIndex" type="index" label="#" width="46" />
      <el-table-column
        v-for="col in normalizedColumns"
        :key="col.key"
        :label="col.title || col.key"
        :min-width="col.width || 140"
        :show-overflow-tooltip="!isImageCol(col) && !isEditableCol(col)"
      >
        <template slot-scope="{ row, $index }">
          <template v-if="isImageCol(col)">
            <image-viewer
              :src="cell(row, col.key)"
              :size="56"
              @click="previewImage(row, col.key)"
            />
          </template>
          <template v-else-if="isEditableCol(col) && editable">
            <el-input
              :value="cell(row, col.key)"
              size="mini"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              @change="(v) => onEdit(row, $index, col.key, v)"
            />
          </template>
          <template v-else>
            <span class="cell-text">{{ cell(row, col.key) }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column v-if="showRaw" label="原始 JSON" min-width="180">
        <template slot-scope="{ row }">
          <el-popover placement="left" width="420" trigger="click">
            <json-viewer :value="row.raw_data || row" :max-height="300" />
            <el-button slot="reference" type="text" size="mini">查看</el-button>
          </el-popover>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!rows.length" class="sit-empty text-muted">暂无数据</div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import ImageViewer from '@/components/ui/ImageViewer.vue';
import JsonViewer from '@/components/ui/JsonViewer.vue';
import { cellValue, isImageUrl } from '@/utils/format';

export default {
  name: 'StepItemTable',
  components: { ImageViewer, JsonViewer },
  mixins: [runtimeMixin],
  props: {
    items: { type: [Array, Object], default: () => [] },
    columns: { type: Array, default: () => [] },
    label: { type: String, default: '列表数据' },
    editable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: false },
    showIndex: { type: Boolean, default: true },
    showRaw: { type: Boolean, default: false },
    maxHeight: { type: Number, default: 460 },
  },
  data() {
    return { selection: [] };
  },
  computed: {
    rows() {
      if (Array.isArray(this.items)) return this.items;
      if (this.items && typeof this.items === 'object') return [this.items];
      return [];
    },
    normalizedColumns() {
      if (Array.isArray(this.columns) && this.columns.length) return this.columns;
      const first = this.rows[0];
      if (!first || typeof first !== 'object') return [{ key: 'value', title: '值' }];
      return Object.keys(first.raw_data || first)
        .filter((k) => !k.startsWith('_'))
        .map((k) => ({ key: k, title: k }));
    },
  },
  methods: {
    cell(row, key) {
      return cellValue(row, key);
    },
    isImageCol(col) {
      if (/image|img|url|cover|avatar/i.test(col.key)) return true;
      const sample = this.rows.slice(0, 5).map((r) => this.cell(r, col.key)).find(Boolean);
      return sample ? isImageUrl(sample) : false;
    },
    isEditableCol(col) {
      return col.editable === true || ['name', 'description', 'desc'].includes(col.key);
    },
    rowClass() {
      return '';
    },
    previewImage(row, key) {
      const url = this.cell(row, key);
      if (url) this.$emit('preview-image', url);
    },
    onSelectionChange(val) {
      this.selection = val;
      this.$emit('selection-change', val);
    },
    selectAll() {
      this.$refs.table.toggleAllSelection();
    },
    clearSelection() {
      this.$refs.table.clearSelection();
    },
    onEdit(row, index, key, value) {
      this.$set(row, key, value);
      if (row.raw_data && typeof row.raw_data === 'object') this.$set(row.raw_data, key, value);
      this.$emit('edit-field', { row, index, key, value });
    },
  },
};
</script>

<style scoped>
.sit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sit-label {
  font-weight: 600;
  color: #1f2d3d;
}

.sit-ops {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cell-text {
  font-size: 12px;
  color: #606266;
}

.sit-empty {
  text-align: center;
  padding: 18px 0;
  font-size: 12px;
}
</style>
