<template>
  <div class="prompt-preview">
    <div class="pp-head">
      <span class="pp-label">解析后的提示词</span>
      <div class="pp-ops">
        <el-tag v-if="items.length > 1" size="mini" type="info">{{ items.length }} 行</el-tag>
        <el-button size="mini" :loading="loading" @click="load">重新解析</el-button>
      </div>
    </div>

    <div v-if="loading" class="text-muted pp-loading">解析中…</div>

    <template v-else-if="items.length > 1">
      <el-table :data="items" size="mini" border max-height="420" class="pp-table">
        <el-table-column type="index" width="46" label="#" />
        <el-table-column
          v-for="col in displayColumns"
          :key="col.key"
          :label="col.title || col.key"
          min-width="120"
          show-overflow-tooltip
        >
          <template slot-scope="{ row }">{{ cell(row.row, col.key) }}</template>
        </el-table-column>
        <el-table-column label="解析后提示词" min-width="260">
          <template slot-scope="{ row }">
            <div class="pp-cell" :style="{ maxHeight: maxHeight + 'px' }">{{ row.prompt || '（空）' }}</div>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <div v-else class="preview-box" :style="{ maxHeight: maxHeight + 'px' }">{{ resolvedText }}</div>

    <div v-if="errors.length" class="pp-errors">
      <el-alert
        v-for="(e, i) in errors"
        :key="i"
        :title="e"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import { workApi } from '@/api';
import { cellValue } from '@/utils/format';

export default {
  name: 'PromptPreview',
  mixins: [runtimeMixin],
  props: {
    prompt: { type: [String, Number], default: '' },
    rows: { type: Array, default: null },
    columns: { type: Array, default: () => [] },
    resolveApi: { type: Boolean, default: false },
    maxHeight: { type: Number, default: 360 },
  },
  data() {
    return { loading: false, items: [], errors: [] };
  },
  computed: {
    resolvedText() {
      if (this.items.length === 1) return this.items[0].prompt || '';
      if (Array.isArray(this.rows) && this.rows.length) return '';
      return String(this.prompt || '（暂无提示词）');
    },
    displayColumns() {
      if (Array.isArray(this.columns) && this.columns.length) return this.columns;
      return [{ key: 'name', title: '名称' }, { key: 'description', title: '描述' }];
    },
    promptInput() {
      return (this.rt.inputs && this.rt.inputs.prompt) || '';
    },
  },
  watch: {
    promptInput() {
      if (!this.resolveApi) return;
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this.load(), 700);
    },
  },
  mounted() {
    if (this.resolveApi) this.load();
  },
  methods: {
    cell(row, key) {
      return cellValue(row, key);
    },
    async load() {
      if (!this.rt.workId && this.rt.workId !== 0) return;
      this.loading = true;
      this.errors = [];
      try {
        const inputs = this.rt.getInputs ? this.rt.getInputs() : {};
        const data = await workApi.preview(this.rt.workId, Number(this.rt.stepIndex || 0) + 1, inputs);
        this.items = data.items || [];
        const errs = [];
        for (const item of this.items) errs.push(...(item.errors || []));
        this.errors = [...new Set(errs)];
      } catch (e) {
        /* 拦截器已提示 */
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.pp-label {
  font-weight: 600;
  color: #1f2d3d;
}

.pp-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pp-loading {
  padding: 12px 0;
  font-size: 12px;
}

.pp-cell {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
}

.pp-errors {
  margin-top: 8px;
}

.pp-errors .el-alert {
  margin-bottom: 4px;
}
</style>
