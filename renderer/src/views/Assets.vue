<template>
  <div class="aift-page">
    <page-table-card
      title="资产管理"
      desc="预设变量（key-value），页面上下文与提示词解析时按变量名取用"
      :total="total"
      :page.sync="query.page_num"
      :page-size.sync="query.page_size"
      :loading="loading"
    >
      <template #actions>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="openDialog()">新增资产</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </template>
      <template #search>
        <div class="aift-toolbar">
          <el-input v-model="query.key" size="small" placeholder="搜索变量名 / 说明" clearable style="width: 240px" @keyup.enter.native="reload" @clear="reload" />
          <el-button size="small" @click="reload">查询</el-button>
        </div>
      </template>

      <el-table :data="rows" size="small" border stripe>
        <el-table-column prop="id" label="ID" width="64" />
        <el-table-column label="变量名" width="220">
          <template slot-scope="{ row }">
            <span class="mono">{{ row.key }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="value" label="值" min-width="280" show-overflow-tooltip />
        <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
        <el-table-column label="更新时间" width="160">
          <template slot-scope="{ row }">{{ formatDate(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="openDialog(row)">编辑</el-button>
            <el-button type="text" size="mini" class="text-danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </page-table-card>

    <el-dialog :visible.sync="dialogVisible" :title="form.id ? '编辑资产' : '新增资产'" width="520px">
      <el-form ref="form" :model="form" :rules="rules" label-width="80px" size="small">
        <el-form-item label="变量名" prop="key">
          <el-input v-model="form.key" placeholder="例如：art_style" :disabled="!!form.id" />
        </el-form-item>
        <el-form-item label="值">
          <el-input v-model="form.value" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import PageTableCard from '@/components/ui/PageTableCard.vue';
import { assetApi } from '@/api';
import { formatDate } from '@/utils/format';

export default {
  name: 'AssetsView',
  components: { PageTableCard },
  data() {
    return {
      rows: [],
      total: 0,
      loading: false,
      saving: false,
      query: { key: '', page_num: 1, page_size: 20 },
      dialogVisible: false,
      form: { id: null, key: '', value: '', description: '' },
      rules: { key: [{ required: true, message: '请输入变量名', trigger: 'blur' }] },
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
        const res = await assetApi.page(this.query);
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
    openDialog(row) {
      this.form = row
        ? { id: row.id, key: row.key, value: row.value, description: row.description || '' }
        : { id: null, key: '', value: '', description: '' };
      this.dialogVisible = true;
    },
    save() {
      this.$refs.form.validate(async (valid) => {
        if (!valid) return;
        this.saving = true;
        try {
          if (this.form.id) await assetApi.update(this.form.id, this.form);
          else await assetApi.create(this.form);
          this.$message.success('已保存');
          this.dialogVisible = false;
          this.load();
        } catch (e) {
          /* ignore */
        } finally {
          this.saving = false;
        }
      });
    },
    async remove(row) {
      try {
        await this.$confirm(`确认删除资产「${row.key}」？`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await assetApi.remove(row.id);
      this.$message.success('已删除');
      this.load();
    },
  },
};
</script>
