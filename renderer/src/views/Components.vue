<template>
  <div class="aift-page">
    <page-table-card
      title="组件管理"
      desc="内置组件由旧项目页面解析而来；自定义组件可声明传参并在页面里拖拽使用"
      :loading="loading"
    >
      <template #actions>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="$router.push('/components/new')">新建自定义组件</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </template>
      <template #search>
        <div class="aift-toolbar">
          <el-input v-model="keyword" size="small" placeholder="搜索组件名 / 标识" clearable style="width: 240px" />
          <el-select v-model="group" size="small" placeholder="分组" clearable style="width: 140px">
            <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
          </el-select>
          <el-radio-group v-model="source" size="mini">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="builtin">内置</el-radio-button>
            <el-radio-button label="user">自定义</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <div v-for="g in grouped" :key="g.name" class="comp-group">
        <div class="comp-group-title">
          {{ g.name }}
          <span class="text-muted">{{ g.items.length }}</span>
        </div>
        <div class="comp-grid">
          <div v-for="c in g.items" :key="c.key" class="comp-card">
            <div class="comp-card-head">
              <i :class="c.icon || 'el-icon-s-operation'" />
              <span class="comp-card-name">{{ c.name }}</span>
              <el-tag size="mini" :type="c.source === 'builtin' ? 'info' : 'success'">
                {{ c.source === 'builtin' ? '内置' : '自定义' }}
              </el-tag>
            </div>
            <div class="comp-card-key mono text-muted">{{ c.key }}</div>
            <div class="comp-card-desc">{{ c.description || '（无说明）' }}</div>
            <div class="comp-card-foot">
              <span class="text-muted">传参 {{ (c.props_schema || []).length }} 项</span>
              <span class="aift-toolbar">
                <el-button type="text" size="mini" @click="openDetail(c)">查看</el-button>
                <el-button v-if="c.source === 'user'" type="text" size="mini" @click="$router.push(`/components/${c.id}`)">编辑</el-button>
                <el-button v-if="c.source === 'user'" type="text" size="mini" class="text-danger" @click="remove(c)">删除</el-button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!grouped.length" class="text-muted comp-empty">没有匹配的组件</div>
    </page-table-card>

    <el-dialog :visible.sync="detailVisible" :title="detail ? `${detail.name}（${detail.key}）` : ''" width="720px">
      <template v-if="detail">
        <el-alert type="info" :closable="false" :title="detail.description || '（无说明）'" show-icon />
        <div class="detail-title">组件传参（页面搭建时可配置，支持 ${...} 表达式）</div>
        <el-table :data="detail.props_schema || []" size="mini" border>
          <el-table-column prop="name" label="参数名" width="140" />
          <el-table-column prop="label" label="显示名" width="140" />
          <el-table-column prop="type" label="类型" width="90" />
          <el-table-column label="支持表达式" width="100">
            <template slot-scope="{ row }">
              <el-tag size="mini" :type="row.expr === false ? 'info' : 'success'">{{ row.expr === false ? '否' : '是' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="default" label="默认值" min-width="180" show-overflow-tooltip>
            <template slot-scope="{ row }">
              <span class="mono">{{ stringifyDefault(row.default) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="160" show-overflow-tooltip />
        </el-table>
        <div v-if="detail.render_spec" class="detail-title">渲染配置（render_spec）</div>
        <json-viewer v-if="detail.render_spec" :value="detail.render_spec" :max-height="240" />
      </template>
    </el-dialog>
  </div>
</template>

<script>
import PageTableCard from '@/components/ui/PageTableCard.vue';
import JsonViewer from '@/components/ui/JsonViewer.vue';
import { componentApi } from '@/api';
import { formatJson } from '@/utils/format';

export default {
  name: 'ComponentsView',
  components: { PageTableCard, JsonViewer },
  data() {
    return {
      loading: false,
      components: [],
      groups: [],
      keyword: '',
      group: '',
      source: '',
      detailVisible: false,
      detail: null,
    };
  },
  computed: {
    filtered() {
      const kw = this.keyword.trim().toLowerCase();
      return this.components.filter((c) => {
        if (this.group && c.group_name !== this.group) return false;
        if (this.source && c.source !== this.source) return false;
        if (!kw) return true;
        return c.name.toLowerCase().includes(kw) || c.key.toLowerCase().includes(kw);
      });
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
  created() {
    this.load();
  },
  methods: {
    stringifyDefault(v) {
      if (v === undefined || v === null || v === '') return '';
      if (typeof v === 'object') return formatJson(v).replace(/\s+/g, ' ');
      return String(v);
    },
    async load() {
      this.loading = true;
      try {
        const data = await componentApi.list();
        this.components = data.components || [];
        this.groups = data.groups || [];
      } finally {
        this.loading = false;
      }
    },
    openDetail(c) {
      this.detail = c;
      this.detailVisible = true;
    },
    async remove(c) {
      try {
        await this.$confirm(`确认删除自定义组件「${c.name}」？引用它的页面会显示缺失。`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await componentApi.remove(c.id);
      this.$message.success('已删除');
      this.load();
    },
  },
};
</script>

<style scoped>
.comp-group {
  margin-bottom: 16px;
}

.comp-group-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2d3d;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.comp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.comp-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comp-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.comp-card-head i {
  color: #409eff;
}

.comp-card-name {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comp-card-key {
  font-size: 11px;
}

.comp-card-desc {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  min-height: 38px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.comp-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  border-top: 1px dashed #f0f2f5;
  padding-top: 6px;
}

.comp-empty {
  text-align: center;
  padding: 30px 0;
}

.detail-title {
  font-weight: 600;
  margin: 14px 0 6px;
  font-size: 13px;
}
</style>
