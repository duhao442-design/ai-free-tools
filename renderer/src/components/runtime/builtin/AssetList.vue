<template>
  <div class="asset-list-block">
    <div class="al-head">
      <span class="al-label">资产（预设变量）</span>
      <el-input v-model="filter" size="mini" placeholder="过滤" style="width: 140px" clearable />
    </div>
    <el-table :data="rows" size="mini" border :max-height="maxHeight">
      <el-table-column prop="key" label="变量名" width="180">
        <template slot-scope="{ row }">
          <span class="mono">{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
      <el-table-column prop="description" label="说明" min-width="120" show-overflow-tooltip />
    </el-table>
    <div v-if="!rows.length" class="text-muted al-empty">暂无资产</div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import { assetApi } from '@/api';

export default {
  name: 'AssetList',
  mixins: [runtimeMixin],
  props: {
    keyword: { type: String, default: '' },
    maxHeight: { type: Number, default: 320 },
  },
  data() {
    return { assets: [], filter: this.keyword };
  },
  computed: {
    rows() {
      const f = String(this.filter || '').trim().toLowerCase();
      if (!f) return this.assets;
      return this.assets.filter(
        (a) => String(a.key).toLowerCase().includes(f) || String(a.description || '').toLowerCase().includes(f),
      );
    },
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      try {
        this.assets = await assetApi.all();
      } catch (e) {
        /* ignore */
      }
    },
  },
};
</script>

<style scoped>
.al-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.al-label {
  font-weight: 600;
  color: #1f2d3d;
}

.al-empty {
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}
</style>
