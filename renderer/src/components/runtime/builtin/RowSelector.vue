<template>
  <div class="row-selector">
    <div class="rs-head">
      <span class="rs-label">{{ label }}</span>
      <span class="text-muted rs-count">已选 {{ selected.length }} / 共 {{ rows.length }}</span>
      <span class="rs-ops">
        <el-button type="text" size="mini" :disabled="!rows.length" @click="selectAll">全选</el-button>
        <el-button type="text" size="mini" :disabled="!selected.length" @click="clearAll">清空</el-button>
      </span>
    </div>

    <el-table
      v-if="rows.length"
      ref="table"
      :data="rows"
      size="mini"
      border
      :max-height="maxHeight"
      row-key="_rsKey"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="44" :reserve-selection="false" />
      <el-table-column label="#" width="46">
        <template slot-scope="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <template v-if="columns.length">
        <el-table-column
          v-for="col in columns"
          :key="col.key"
          :label="col.title || col.key"
          :min-width="col.width || 120"
        >
          <template slot-scope="{ row }">
            <image-viewer
              v-if="col.type === 'image' && cell(row, col.key)"
              :src="cell(row, col.key)"
              :size="48"
            />
            <span v-else class="rs-cell">{{ cell(row, col.key) }}</span>
          </template>
        </el-table-column>
      </template>
      <template v-else>
        <el-table-column :label="nameTitle" min-width="130">
          <template slot-scope="{ row }">
            <span class="rs-name">{{ cell(row, nameField) || '未命名' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="showImage" label="参考图" width="88">
          <template slot-scope="{ row }">
            <image-viewer v-if="cell(row, imageField)" :src="cell(row, imageField)" :size="56" />
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="descTitle" min-width="220" show-overflow-tooltip>
          <template slot-scope="{ row }">
            <span class="text-muted">{{ cell(row, descField) || '' }}</span>
          </template>
        </el-table-column>
      </template>
    </el-table>

    <div v-else class="rs-empty text-muted">
      上一步还没有可选的列表数据（请先完成前置步骤）
    </div>

    <div class="rs-tip text-muted">
      执行时只处理勾选的行（后端按行循环调用，每行一次请求）；不勾选则按页面配置的输入执行。
    </div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import ImageViewer from '@/components/ui/ImageViewer.vue';

/**
 * 从「前置步骤的列表输出」里勾选要用哪些行去执行当前步骤。
 * 选中结果通过 rt.setInput('rows', [...]) 传给执行按钮，后端 runStep 会按这些行循环调用。
 */
export default {
  name: 'RowSelector',
  components: { ImageViewer },
  mixins: [runtimeMixin],
  props: {
    source: { type: [Array, Object, String], default: '' },
    label: { type: String, default: '选择要处理的行' },
    nameField: { type: String, default: 'name' },
    descField: { type: String, default: 'desc' },
    imageField: { type: String, default: 'image_url' },
    nameTitle: { type: String, default: '名称' },
    descTitle: { type: String, default: '描述' },
    showImage: { type: Boolean, default: true },
    defaultSelectAll: { type: Boolean, default: true },
    maxHeight: { type: Number, default: 360 },
    columns: { type: Array, default: () => [] },
  },
  data() {
    return { selected: [], initialized: false };
  },
  computed: {
    rows() {
      const src = this.source;
      let list = src;
      if (typeof list === 'string') {
        const m = /^\$\{stepList\[(\d+)\]\.rsp\.items\}$/.exec(list.trim());
        if (m) {
          const step = ((this.rt.context || {}).stepList || [])[Number(m[1])];
          list = step && step.rsp ? step.rsp.items : [];
        } else {
          try {
            list = JSON.parse(list);
          } catch (e) {
            list = [];
          }
        }
      }
      if (list && !Array.isArray(list) && Array.isArray(list.items)) list = list.items;
      if (!Array.isArray(list)) return [];
      return list
        .filter((it) => it && typeof it === 'object')
        .map((it, i) => ({ ...it, _rsKey: `${i}-${it[this.nameField] || it.name || i}` }));
    },
  },
  watch: {
    rows: {
      immediate: true,
      handler() {
        this.selected = [];
        this.initialized = false;
        this.$nextTick(() => this.applyDefaultSelection());
      },
    },
  },
  mounted() {
    this.$nextTick(() => this.applyDefaultSelection());
  },
  methods: {
    cell(row, field) {
      if (!row || !field) return '';
      const value = row[field];
      if (value === undefined || value === null) return '';
      if (Array.isArray(value)) {
        return value
          .map((v) => (v && typeof v === 'object' ? v.name || v.role || JSON.stringify(v) : String(v)))
          .filter(Boolean)
          .join('、');
      }
      if (typeof value === 'object') return value.name || value.text || JSON.stringify(value);
      return value;
    },
    /**
     * 默认勾选：只在「本步还没执行成功」时全选，避免重跑时又默默把全部行重新生成一遍。
     * el-table 的 ref 可能要等一两帧才就绪，用重试兜底。
     */
    applyDefaultSelection(retry = 0) {
      const table = this.$refs.table;
      if (!table) {
        if (retry < 6 && this.rows.length) {
          this.$nextTick(() => this.applyDefaultSelection(retry + 1));
        } else {
          this.initialized = true;
        }
        return;
      }
      if (this.initialized) return;
      const stepDone = this.rt.step && this.rt.step.status === 'success';
      table.clearSelection();
      this.initialized = true;
      if (this.defaultSelectAll && !stepDone && this.rows.length) {
        this.rows.forEach((r) => table.toggleRowSelection(r, true));
        this.selected = this.rows.slice();
      }
      this.publish();
    },
    onSelectionChange(rows) {
      this.selected = rows;
      this.publish();
    },
    publish() {
      if (!this.initialized) return;
      const rows = this.selected.map((r) => {
        const copy = { ...r };
        delete copy._rsKey;
        return copy;
      });
      if (this.rt.setInput) {
        this.rt.setInput('rows', rows);
        this.rt.setInput('row_count', rows.length);
        // 告诉执行按钮：本页有勾选器，没勾选就不要执行（带页面归属，避免切换步骤时串页）
        this.rt.setInput('row_select_active', true);
        this.rt.setInput('row_select_page', (this.rt.step && this.rt.step.page_id) || null);
      }
    },
    selectAll() {
      this.rows.forEach((r) => this.$refs.table.toggleRowSelection(r, true));
    },
    clearAll() {
      this.$refs.table.clearSelection();
    },
  },
};
</script>

<style scoped>
.rs-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.rs-label {
  font-weight: 600;
  color: #1f2d3d;
}

.rs-count {
  font-size: 12px;
}

.rs-ops {
  margin-left: auto;
}

.rs-name {
  font-weight: 600;
}

.rs-cell {
  font-size: 12px;
  color: #606266;
}

.rs-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
}

.rs-tip {
  font-size: 11px;
  margin-top: 6px;
}
</style>
