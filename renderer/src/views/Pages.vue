<template>
  <div class="aift-page">
    <page-table-card
      title="页面管理"
      desc="页面由组件拖拽搭建，并携带页面加载时后端产出的全局上下文；工作流通过页面组装而成"
      :total="total"
      :page.sync="query.page_num"
      :page-size.sync="query.page_size"
      :loading="loading"
    >
      <template #actions>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="createDialog = true">新建页面</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </template>
      <template #search>
        <div class="aift-toolbar">
          <el-input v-model="query.name" size="small" placeholder="搜索页面名称" clearable style="width: 220px" @keyup.enter.native="reload" @clear="reload" />
          <el-button size="small" @click="reload">查询</el-button>
        </div>
      </template>

      <el-table :data="rows" size="small" border stripe>
        <el-table-column prop="id" label="ID" width="64" />
        <el-table-column label="页面名称" min-width="200">
          <template slot-scope="{ row }">
            <el-link type="primary" :underline="false" @click.native="design(row)">{{ row.name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="组件数" width="90">
          <template slot-scope="{ row }">
            <el-tag size="mini" type="info">{{ row.component_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="执行配置" min-width="210">
          <template slot-scope="{ row }">
            <div v-if="(row.execution_summary || {}).model">{{ row.execution_summary.model }}</div>
            <div v-else class="text-muted">未配置模型</div>
            <div class="text-muted page-exec-sub">
              {{ (row.execution_summary || {}).input_type || 'none' }} → {{ (row.execution_summary || {}).output_type || 'none' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="组件构成" min-width="300">
          <template slot-scope="{ row }">
            <span v-for="(b, i) in row.layout.slice(0, 6)" :key="i" class="comp-chip">{{ b.component }}</span>
            <span v-if="row.layout.length > 6" class="text-muted">…共 {{ row.layout.length }} 个</span>
          </template>
        </el-table-column>
        <el-table-column label="是否启用" width="90">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
        <el-table-column label="更新时间" width="160">
          <template slot-scope="{ row }">{{ formatDate(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="design(row)">设计</el-button>
            <el-button type="text" size="mini" @click="duplicate(row)">复制</el-button>
            <el-button type="text" size="mini" class="text-danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </page-table-card>

    <el-dialog :visible.sync="createDialog" title="新建页面" width="480px">
      <el-form label-width="84px" size="small">
        <el-form-item label="页面名称">
          <el-input v-model="createForm.name" placeholder="例如：提示词与解析" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="createDialog = false">取消</el-button>
        <el-button size="small" type="primary" @click="create">创建并设计</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import PageTableCard from '@/components/ui/PageTableCard.vue';
import { pageApi } from '@/api';
import { formatDate } from '@/utils/format';

export default {
  name: 'PagesView',
  components: { PageTableCard },
  data() {
    return {
      rows: [],
      total: 0,
      loading: false,
      query: { name: '', page_num: 1, page_size: 20 },
      createDialog: false,
      createForm: { name: '', description: '' },
    };
  },
  created() {
    this.load();
  },
  methods: {
    formatDate,
    async load() {
      this.loading = true;
      try {
        const res = await pageApi.page(this.query);
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
    design(row) {
      this.$router.push(`/pages/${row.id}/design`);
    },
    async create() {
      if (!this.createForm.name) {
        this.$message.warning('请填写页面名称');
        return;
      }
      const page = await pageApi.create({
        name: this.createForm.name,
        description: this.createForm.description,
        layout: [],
      });
      this.createDialog = false;
      this.createForm = { name: '', description: '' };
      this.$router.push(`/pages/${page.id}/design`);
    },
    async duplicate(row) {
      const page = await pageApi.create({
        name: `${row.name} 副本`,
        description: row.description,
        layout: row.layout,
        context_config: row.context_config,
      });
      this.$message.success('已复制');
      this.$router.push(`/pages/${page.id}/design`);
    },
    async remove(row) {
      try {
        await this.$confirm(`确认删除页面「${row.name}」？工作流中引用该页面的步骤会失效。`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await pageApi.remove(row.id);
      this.$message.success('已删除');
      this.load();
    },
  },
};
</script>

<style scoped>
.comp-chip {
  display: inline-block;
  background: #f4f6f9;
  border-radius: 4px;
  padding: 1px 7px;
  margin: 2px 6px 2px 0;
  font-size: 12px;
  color: #606266;
  font-family: Consolas, Monaco, monospace;
}

.page-exec-sub {
  font-size: 11px;
}
</style>
