<template>
  <div class="aift-page">
    <page-table-card
      title="作品管理"
      desc="创建作品后按工作流一步步流转；每个步骤展示一个低代码配置的页面"
      :total="total"
      :page.sync="query.page_num"
      :page-size.sync="query.page_size"
      :loading="loading"
    >
      <template #actions>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="openDialog()">新建作品</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </template>
      <template #search>
        <div class="aift-toolbar">
          <el-input v-model="query.name" size="small" placeholder="搜索作品名称" clearable style="width: 200px" @keyup.enter.native="reload" @clear="reload" />
          <el-select v-model="query.type" size="small" placeholder="类型" clearable style="width: 120px" @change="reload">
            <el-option v-for="t in workTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-select v-model="query.status" size="small" placeholder="状态" clearable style="width: 120px" @change="reload">
            <el-option v-for="s in workStatus" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
          <el-button size="small" @click="reload">查询</el-button>
        </div>
      </template>

      <el-table :data="rows" size="small" border stripe>
        <el-table-column prop="id" label="ID" width="64" />
        <el-table-column label="作品名称" min-width="200">
          <template slot-scope="{ row }">
            <el-link type="primary" :underline="false" @click.native="enter(row)">{{ row.name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template slot-scope="{ row }">
            <el-tag size="mini">{{ labelOf(workTypes, row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="工作流" min-width="160">
          <template slot-scope="{ row }">
            <span v-if="row.workflow_name">{{ row.workflow_name }}</span>
            <span v-else class="text-muted">未绑定</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="keywords" label="关键词" min-width="120" show-overflow-tooltip />
        <el-table-column label="创建时间" width="160">
          <template slot-scope="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="enter(row)">进入</el-button>
            <el-button type="text" size="mini" @click="openDialog(row)">编辑</el-button>
            <el-button type="text" size="mini" class="text-danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </page-table-card>

    <el-dialog :visible.sync="dialogVisible" :title="form.id ? '编辑作品' : '新建作品'" width="640px" @closed="resetForm">
      <el-form ref="form" :model="form" :rules="rules" label-width="92px" size="small">
        <el-form-item label="作品名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：都市悬疑漫画 01" />
        </el-form-item>
        <el-form-item label="作品类型" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="t in workTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="工作流">
          <el-select v-model="form.workflow_id" clearable placeholder="选择工作流（不选则无法流转）" style="width: 100%">
            <el-option v-for="w in workflows" :key="w.id" :label="`${w.name}（${w.step_count} 步）`" :value="w.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="原文链接">
          <el-input v-model="form.source_url" placeholder="可选" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="form.keywords" placeholder="多个用英文逗号分隔" />
        </el-form-item>
        <el-form-item label="作品内容">
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="长文本内容，供提示词解析使用" />
        </el-form-item>
        <el-form-item label="输入参数">
          <json-editor v-model="form.params" :rows="4" placeholder='{"theme":"冒险"}' />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
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
import JsonEditor from '@/components/ui/JsonEditor.vue';
import { workApi, workflowApi } from '@/api';
import { WORK_TYPES, WORK_STATUS, labelOf, typeOf } from '@/utils/constants';
import { formatDate } from '@/utils/format';

function emptyForm() {
  return {
    id: null,
    name: '',
    type: 'comic',
    workflow_id: null,
    source_url: '',
    keywords: '',
    content: '',
    params: {},
    remark: '',
  };
}

export default {
  name: 'WorksView',
  components: { PageTableCard, JsonEditor },
  data() {
    return {
      workTypes: WORK_TYPES,
      workStatus: WORK_STATUS,
      rows: [],
      total: 0,
      loading: false,
      saving: false,
      query: { name: '', type: '', status: '', page_num: 1, page_size: 20 },
      workflows: [],
      dialogVisible: false,
      form: emptyForm(),
      rules: {
        name: [{ required: true, message: '请输入作品名称', trigger: 'blur' }],
        type: [{ required: true, message: '请选择类型', trigger: 'change' }],
      },
    };
  },
  created() {
    this.load();
    this.loadWorkflows();
  },
  methods: {
    labelOf,
    formatDate,
    statusLabel(v) {
      return labelOf(WORK_STATUS, v);
    },
    statusType(v) {
      return typeOf(WORK_STATUS, v);
    },
    async load() {
      this.loading = true;
      try {
        const res = await workApi.page(this.query);
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
    async loadWorkflows() {
      try {
        this.workflows = await workflowApi.all();
      } catch (e) {
        /* ignore */
      }
    },
    enter(row) {
      this.$router.push(`/works/${row.id}`);
    },
    openDialog(row) {
      if (row) {
        this.form = { ...emptyForm(), ...row, params: row.params || {} };
      } else {
        this.form = emptyForm();
      }
      this.dialogVisible = true;
    },
    resetForm() {
      this.form = emptyForm();
      if (this.$refs.form) this.$refs.form.clearValidate();
    },
    save() {
      this.$refs.form.validate(async (valid) => {
        if (!valid) return;
        this.saving = true;
        try {
          const payload = { ...this.form };
          if (payload.id) await workApi.update(payload.id, payload);
          else await workApi.create(payload);
          this.$message.success('已保存');
          this.dialogVisible = false;
          this.load();
        } catch (e) {
          /* 拦截器已提示 */
        } finally {
          this.saving = false;
        }
      });
    },
    async remove(row) {
      try {
        await this.$confirm(`确认删除作品「${row.name}」？该操作不可恢复。`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await workApi.remove(row.id);
      this.$message.success('已删除');
      this.load();
    },
  },
};
</script>
