<template>
  <div class="aift-page">
    <page-table-card
      title="模型管理"
      desc="模型字段与旧项目保持一致：provider / model_type / format_type / model_name / base_url / api_key"
      :total="total"
      :page.sync="query.page_num"
      :page-size.sync="query.page_size"
      :loading="loading"
    >
      <template #actions>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="openDialog()">新建模型</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="load">刷新</el-button>
      </template>
      <template #search>
        <div class="aift-toolbar">
          <el-input v-model="query.name" size="small" placeholder="搜索模型名称" clearable style="width: 200px" @keyup.enter.native="reload" @clear="reload" />
          <el-select v-model="query.model_type" size="small" placeholder="模型类型" clearable style="width: 120px" @change="reload">
            <el-option v-for="t in modelTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-button size="small" @click="reload">查询</el-button>
        </div>
      </template>

      <el-table :data="rows" size="small" border stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="名称" width="150" show-overflow-tooltip />
        <el-table-column label="提供商" width="110">
          <template slot-scope="{ row }">{{ labelOf(providers, row.provider) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template slot-scope="{ row }">
            <el-tag size="mini">{{ labelOf(modelTypes, row.model_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="端点格式" width="150">
          <template slot-scope="{ row }">
            <span class="format-chip">{{ row.format_type || '未指定' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="model_name" label="模型标识" width="150" show-overflow-tooltip />
        <el-table-column prop="base_url" label="接口地址" min-width="200" show-overflow-tooltip />
        <el-table-column label="中转" width="70" align="center">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="row.is_relay ? 'warning' : 'info'">{{ row.is_relay ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="70" align="center">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="$router.push(`/models/${row.id}/test`)">测试</el-button>
            <el-button type="text" size="mini" @click="openDialog(row)">编辑</el-button>
            <el-button type="text" size="mini" class="text-danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </page-table-card>

    <el-dialog :visible.sync="dialogVisible" :title="form.id ? '编辑模型' : '新建模型'" width="640px">
      <el-form ref="form" :model="form" :rules="rules" label-width="96px" size="small">
        <el-form-item label="模型名称" prop="name">
          <el-input v-model="form.name" placeholder="展示用名称，例如：GPT-4o" />
        </el-form-item>
        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="提供商" prop="provider">
              <el-select v-model="form.provider" style="width: 100%" @change="applyProvider">
                <el-option v-for="p in providers" :key="p.value" :label="p.label" :value="p.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模型类型" prop="model_type">
              <el-select v-model="form.model_type" style="width: 100%" @change="applyModelType">
                <el-option v-for="t in modelTypes" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="端点格式">
          <el-select v-model="form.format_type" clearable style="width: 100%">
            <el-option
              v-for="f in visibleFormats"
              :key="f.value"
              :label="f.label"
              :value="f.value"
            />
          </el-select>
          <div class="text-muted form-tip">调用端点跟随模型：选好格式后，接口调用的 URL/鉴权/响应路径都按此格式处理。</div>
        </el-form-item>
        <el-form-item label="模型标识" prop="model_name">
          <el-input v-model="form.model_name" placeholder="例如：gpt-4o、gpt-image-2" />
        </el-form-item>
        <el-form-item label="接口地址" prop="base_url">
          <el-input v-model="form.base_url" placeholder="https://api.openai.com 或中转站地址" />
        </el-form-item>
        <el-form-item label="API Token" prop="api_key">
          <el-input v-model="form.api_key" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="中转站">
          <el-switch v-model="form.is_relay" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" />
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
import { modelApi } from '@/api';
import { MODEL_TYPES, PROVIDERS, FORMAT_TYPES, labelOf } from '@/utils/constants';

function emptyForm() {
  return {
    id: null,
    name: '',
    provider: 'openai',
    model_type: 'text',
    format_type: 'openai_chat',
    model_name: '',
    base_url: '',
    api_key: '',
    is_relay: false,
    is_active: true,
    remark: '',
  };
}

export default {
  name: 'ModelsView',
  components: { PageTableCard },
  data() {
    return {
      modelTypes: MODEL_TYPES,
      providers: PROVIDERS,
      rows: [],
      total: 0,
      loading: false,
      saving: false,
      query: { name: '', model_type: '', page_num: 1, page_size: 20 },
      dialogVisible: false,
      form: emptyForm(),
      rules: {
        name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
        model_name: [{ required: true, message: '请输入模型标识', trigger: 'blur' }],
        base_url: [{ required: true, message: '请输入接口地址', trigger: 'blur' }],
      },
    };
  },
  computed: {
    visibleFormats() {
      if (this.form.model_type === 'image') return FORMAT_TYPES.filter((f) => f.kind === 'image');
      return FORMAT_TYPES.filter((f) => f.kind === 'text');
    },
  },
  created() {
    this.load();
  },
  methods: {
    labelOf,
    async load() {
      this.loading = true;
      try {
        const res = await modelApi.listPage(this.query);
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
    applyProvider(provider) {
      if (provider === 'anthropic') this.form.format_type = 'anthropic';
      else if (provider === 'gemini') this.form.format_type = 'gemini';
      else if (!this.form.format_type) this.form.format_type = 'openai_chat';
    },
    applyModelType(type) {
      if (type === 'image') this.form.format_type = 'openai_image';
      else if (this.form.format_type === 'openai_image') this.form.format_type = 'openai_chat';
    },
    openDialog(row) {
      // 白名单赋值，避免把 id/created_at 等一起提交
      if (row) {
        this.form = {
          id: row.id,
          name: row.name,
          provider: row.provider,
          model_type: row.model_type,
          format_type: row.format_type,
          model_name: row.model_name,
          base_url: row.base_url,
          api_key: row.api_key,
          is_relay: !!row.is_relay,
          is_active: !!row.is_active,
          remark: row.remark || '',
        };
      } else {
        this.form = emptyForm();
      }
      this.dialogVisible = true;
    },
    save() {
      this.$refs.form.validate(async (valid) => {
        if (!valid) return;
        this.saving = true;
        try {
          if (this.form.id) await modelApi.update(this.form.id, this.form);
          else await modelApi.create(this.form);
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
        await this.$confirm(`确认删除模型「${row.name}」？`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await modelApi.remove(row.id);
      this.$message.success('已删除');
      this.load();
    },
  },
};
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  line-height: 1.6;
  margin-top: 2px;
}
</style>
