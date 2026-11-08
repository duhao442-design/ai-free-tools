<template>
  <div class="aift-page">
    <page-table-card
      title="工作流管理"
      desc="把页面按顺序组装成一条流程；页面之间不共享传参，数据由后端上下文重建"
      :total="total"
      :page.sync="query.page_num"
      :page-size.sync="query.page_size"
      :loading="loading"
    >
      <template #actions>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="create">新建工作流</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </template>
      <template #search>
        <div class="aift-toolbar">
          <el-input v-model="query.name" size="small" placeholder="搜索工作流名称" clearable style="width: 220px" @keyup.enter.native="reload" @clear="reload" />
          <el-select v-model="query.type" size="small" placeholder="类型" clearable style="width: 120px" @change="reload">
            <el-option v-for="t in workTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-button size="small" @click="reload">查询</el-button>
        </div>
      </template>

      <el-table :data="rows" size="small" border stripe>
        <el-table-column prop="id" label="ID" width="64" />
        <el-table-column label="工作流名称" min-width="200">
          <template slot-scope="{ row }">
            <el-link type="primary" :underline="false" @click.native="edit(row)">{{ row.name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template slot-scope="{ row }">
            <el-tag size="mini">{{ labelOf(workTypes, row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="步骤" width="80">
          <template slot-scope="{ row }">
            <el-tag size="mini" type="info">{{ row.step_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="页面顺序" min-width="300">
          <template slot-scope="{ row }">
            <span v-for="(s, i) in row.steps" :key="i" class="step-chip">
              {{ i + 1 }}. {{ s.name }}
              <span class="text-muted">{{ s.page_id ? (row.pages[s.page_id] || '已删除页面') : '未绑定页面' }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="160" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="edit(row)">配置</el-button>
            <el-button type="text" size="mini" class="text-danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </page-table-card>
  </div>
</template>

<script>
import PageTableCard from '@/components/ui/PageTableCard.vue';
import { workflowApi } from '@/api';
import { WORK_TYPES, labelOf } from '@/utils/constants';

export default {
  name: 'WorkflowsView',
  components: { PageTableCard },
  data() {
    return {
      workTypes: WORK_TYPES,
      rows: [],
      total: 0,
      loading: false,
      query: { name: '', type: '', page_num: 1, page_size: 20 },
    };
  },
  created() {
    this.load();
  },
  methods: {
    labelOf,
    async load() {
      this.loading = true;
      try {
        const res = await workflowApi.page(this.query);
        this.rows = res.data || [];
        this.total = res.total || 0;
      } finally {
        this.loading = false;
      }
    },
    reload() {
      this.query.page_num = 1;
      this.load();
    },
    async create() {
      try {
        const { value } = await this.$prompt('请输入工作流名称', '新建工作流', {
          inputPattern: /\S+/,
          inputErrorMessage: '名称不能为空',
        });
        const wf = await workflowApi.create({ name: value, type: 'comic', steps: [] });
        this.$router.push(`/workflows/${wf.id}`);
      } catch (e) {
        /* cancelled */
      }
    },
    edit(row) {
      this.$router.push(`/workflows/${row.id}`);
    },
    async remove(row) {
      try {
        await this.$confirm(`确认删除工作流「${row.name}」？`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await workflowApi.remove(row.id);
      this.$message.success('已删除');
      this.load();
    },
  },
};
</script>

<style scoped>
.step-chip {
  display: inline-block;
  background: #f4f6f9;
  border-radius: 4px;
  padding: 1px 7px;
  margin: 2px 6px 2px 0;
  font-size: 12px;
  color: #606266;
}
</style>
