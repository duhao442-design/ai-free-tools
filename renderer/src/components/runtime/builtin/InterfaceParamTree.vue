<template>
  <div class="iface-param-view">
    <div class="ipv-head">
      <span class="ipv-label">接口参数</span>
      <span class="text-muted">输入 {{ inputs.length }} 项 / 输出 {{ outputs.length }} 项</span>
    </div>
    <el-table :data="rows" size="mini" border row-key="key" :tree-props="{ children: 'children' }" default-expand-all>
      <el-table-column prop="param_type" label="方向" width="70">
        <template slot-scope="{ row }">
          <el-tag size="mini" :type="row.param_type === 'input' ? '' : 'success'">{{ row.param_type === 'input' ? '入' : '出' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="param_name" label="参数名" min-width="140" show-overflow-tooltip />
      <el-table-column prop="value_type" label="类型" width="90" />
      <el-table-column prop="file_type" label="文件类型" width="90">
        <template slot-scope="{ row }">
          <span v-if="row.file_type && row.file_type !== 'none'" class="format-chip">{{ row.file_type }}</span>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="expr" label="取值" min-width="220" show-overflow-tooltip>
        <template slot-scope="{ row }">
          <span class="mono">{{ row.expr || '' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="说明" min-width="140" show-overflow-tooltip />
    </el-table>
  </div>
</template>

<script>
export default {
  name: 'InterfaceParamTree',
  props: {
    params: { type: [Array, String], default: () => [] },
    readonly: { type: Boolean, default: true },
    direction: { type: String, default: 'both' },
  },
  computed: {
    list() {
      let list = this.params;
      if (typeof list === 'string') {
        try {
          list = JSON.parse(list);
        } catch (e) {
          list = [];
        }
      }
      if (!Array.isArray(list)) return [];
      if (this.direction === 'both') return list;
      return list.filter((p) => (p.param_type || 'input') === this.direction);
    },
    inputs() {
      return this.normalizeList.filter((p) => p.param_type === 'input');
    },
    outputs() {
      return this.normalizeList.filter((p) => p.param_type === 'output');
    },
    normalizeList() {
      const walk = (arr, parentKey) =>
        (arr || []).map((p, i) => {
          const key = `${parentKey}-${i}`;
          const cfg = p.param_value;
          let expr = '';
          if (typeof cfg === 'string') expr = cfg;
          else if (cfg && typeof cfg === 'object') expr = cfg.expr || '';
          return {
            key,
            param_type: p.param_type || 'input',
            param_name: p.param_name,
            value_type: p.value_type || 'string',
            file_type: p.file_type || 'none',
            expr,
            description: p.description || '',
            children: p.children && p.children.length ? walk(p.children, key) : undefined,
          };
        });
      return walk(this.list, 'p');
    },
    rows() {
      return this.normalizeList;
    },
  },
};
</script>

<style scoped>
.ipv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ipv-label {
  font-weight: 600;
  color: #1f2d3d;
}
</style>
