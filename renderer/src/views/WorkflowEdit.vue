<template>
  <div class="aift-page wf-edit" v-loading="loading">
    <div class="aift-card wf-head">
      <div class="wf-head-main">
        <el-input v-model="form.name" size="small" class="wf-name" placeholder="工作流名称" />
        <div class="wf-head-meta">
          <el-select v-model="form.type" size="small" style="width: 120px">
            <el-option v-for="t in workTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-input v-model="form.description" size="small" placeholder="工作流说明" class="wf-desc" />
        </div>
      </div>
      <div class="aift-toolbar">
        <el-switch v-model="jsonMode" active-text="JSON 模式" inactive-text="表单模式" />
        <el-button size="small" icon="el-icon-plus" @click="addStep">添加步骤</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button size="small" @click="$router.push('/workflows')">返回</el-button>
      </div>
    </div>

    <div v-if="jsonMode" class="aift-card wf-json">
      <json-editor :value="jsonText" :rows="26" @change="onJsonChange" />
      <div class="text-muted wf-json-tip">
        JSON 模式直接编辑 steps 数组：id / name / page_id / model_id / interface_id / input_type / output_type /
        prompt / input_value / model_input_value / model_output_value。
      </div>
    </div>

    <div v-else class="wf-steps">
      <div v-for="(step, i) in form.steps" :key="step.id" class="aift-card wf-step">
        <div class="wf-step-head">
          <div class="wf-step-title">
            <span class="wf-step-index">{{ i + 1 }}</span>
            <el-input v-model="step.name" size="mini" class="wf-step-name" placeholder="步骤名称" />
            <el-tag v-if="step.page_id && pageMap[step.page_id]" size="mini" type="success">
              页面：{{ pageMap[step.page_id] }}
            </el-tag>
            <el-tag v-else size="mini" type="warning">未绑定页面</el-tag>
          </div>
          <div class="aift-toolbar">
            <el-button type="text" size="mini" :disabled="i === 0" @click="move(i, -1)">上移</el-button>
            <el-button type="text" size="mini" :disabled="i === form.steps.length - 1" @click="move(i, 1)">下移</el-button>
            <el-button type="text" size="mini" @click="insertAfter(i)">插入</el-button>
            <el-button type="text" size="mini" class="text-danger" @click="removeStep(i)">删除</el-button>
          </div>
        </div>

        <el-collapse v-model="opened">
          <el-collapse-item :name="step.id">
            <template slot="title">
              <span class="text-muted wf-collapse-tip">
                {{ step.page_id ? '执行配置来自页面 · 点击查看 / 切换页面' : '尚未绑定页面' }}
              </span>
            </template>
            <el-form label-width="100px" size="mini" class="wf-step-form">
              <el-form-item label="绑定页面">
                <el-select
                  v-model="step.page_id"
                  clearable
                  placeholder="选择页面（模型、接口、提示词都跟页面走）"
                  style="width: 100%"
                  @change="onPageChange(step)"
                >
                  <el-option v-for="p in pages" :key="p.id" :label="pageOptionLabel(p)" :value="p.id" />
                </el-select>
                <div v-if="step.page_id" class="wf-exec-summary">
                  <div>模型：<b>{{ summaryOf(step).model || '未配置' }}</b></div>
                  <div>
                    接口：<b>{{ summaryOf(step).interface || '未配置' }}</b>
                    <span v-if="summaryOf(step).format_type" class="text-muted">（{{ summaryOf(step).format_type }}）</span>
                  </div>
                  <div>输入 → 输出：<b>{{ summaryOf(step).input_type || 'none' }} → {{ summaryOf(step).output_type || 'none' }}</b></div>
                  <div class="wf-exec-prompt ellipsis">提示词：{{ promptOf(step) || '（空）' }}</div>
                </div>
                <div class="wf-exec-ops">
                  <el-button v-if="step.page_id" type="text" size="mini" @click="openDesigner(step)">
                    去页面设计器配置模型 / 提示词
                  </el-button>
                  <span v-else class="text-muted">先选一个页面，再到页面设计器的「执行配置」里选模型</span>
                </div>
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div v-if="!form.steps.length" class="aift-card wf-empty">
        <el-empty description="还没有步骤，先添加一个步骤并绑定页面" />
      </div>
    </div>
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';
import { workflowApi, pageApi } from '@/api';
import { WORK_TYPES } from '@/utils/constants';

const uid = () => `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function emptyStep(index) {
  return {
    id: uid(),
    name: `步骤 ${index + 1}`,
    page_id: null,
    model_id: null,
    interface_id: null,
    prompt: '',
    input_type: 'none',
    output_type: 'none',
    input_value: '',
    model_input_value: null,
    model_output_value: null,
    settings: { columns: [], maxRows: 0, rowOffset: 0, image_ref: { from: '', matchField: 'role', nameField: 'name' } },
  };
}

export default {
  name: 'WorkflowEdit',
  components: { JsonEditor },
  data() {
    return {
      workTypes: WORK_TYPES,
      loading: false,
      saving: false,
      jsonMode: false,
      jsonText: '',
      opened: [],
      form: { id: null, name: '', description: '', type: 'comic', steps: [], variable_mapping: {} },
      pages: [],
      pageMap: {},
      pageInfo: {},
    };
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const pages = await pageApi.all();
        this.pages = pages;
        this.pageMap = Object.fromEntries(pages.map((p) => [p.id, p.name]));
        this.pageInfo = Object.fromEntries(pages.map((p) => [p.id, p]));

        const id = this.$route.params.id;
        if (id && id !== 'new') {
          const wf = await workflowApi.detail(id);
          this.form = {
            id: wf.id,
            name: wf.name,
            description: wf.description || '',
            type: wf.type,
            steps: (wf.steps || []).map((s) => {
              const st = { ...emptyStep(0), ...s };
              if (!st.settings || typeof st.settings !== 'object') st.settings = { columns: [] };
              if (!Array.isArray(st.settings.columns)) st.settings.columns = [];
              if (st.settings.maxRows === undefined) st.settings.maxRows = 0;
              if (st.settings.rowOffset === undefined) st.settings.rowOffset = 0;
              if (!st.settings.image_ref || typeof st.settings.image_ref !== 'object') {
                st.settings.image_ref = { from: '', matchField: 'role', nameField: 'name' };
              }
              return st;
            }),
            variable_mapping: wf.variable_mapping || {},
          };
        } else {
          this.form = { id: null, name: '新工作流', description: '', type: 'comic', steps: [emptyStep(0)], variable_mapping: {} };
        }
        this.jsonText = JSON.stringify(this.form.steps, null, 2);
      } finally {
        this.loading = false;
      }
    },
    addStep() {
      this.form.steps.push(emptyStep(this.form.steps.length));
    },
    insertAfter(i) {
      this.form.steps.splice(i + 1, 0, emptyStep(i + 1));
    },
    removeStep(i) {
      this.form.steps.splice(i, 1);
    },
    move(i, delta) {
      const j = i + delta;
      if (j < 0 || j >= this.form.steps.length) return;
      const list = [...this.form.steps];
      [list[i], list[j]] = [list[j], list[i]];
      this.form.steps = list;
    },
    onPageChange(step) {
      if (!step.name || /^步骤 \d+$/.test(step.name)) {
        const page = this.pages.find((p) => p.id === step.page_id);
        if (page) step.name = page.name;
      }
    },
    pageOptionLabel(page) {
      const model = page.execution_summary && page.execution_summary.model;
      return model ? `${page.name} · ${model}` : page.name;
    },
    summaryOf(step) {
      const page = step.page_id ? this.pageInfo[step.page_id] : null;
      return (page && page.execution_summary) || {};
    },
    promptOf(step) {
      const page = step.page_id ? this.pageInfo[step.page_id] : null;
      return (page && page.execution && page.execution.prompt) || step.prompt || '';
    },
    openDesigner(step) {
      if (step.page_id) this.$router.push(`/pages/${step.page_id}/design?tab=execution`);
    },
    onJsonChange(value) {
      if (Array.isArray(value)) {
        this.form.steps = value.map((s) => ({ ...emptyStep(0), ...s }));
      }
    },
    async save() {
      const steps = this.form.steps.map((s, i) => ({ ...s, id: s.id || uid(), name: s.name || `步骤 ${i + 1}` }));
      if (!this.form.name) {
        this.$message.warning('请填写工作流名称');
        return;
      }
      this.saving = true;
      try {
        const payload = {
          name: this.form.name,
          description: this.form.description,
          type: this.form.type,
          steps,
          variable_mapping: this.form.variable_mapping,
        };
        if (this.form.id) await workflowApi.update(this.form.id, payload);
        else {
          const created = await workflowApi.create(payload);
          this.form.id = created.id;
          this.$router.replace(`/workflows/${created.id}`);
        }
        this.jsonText = JSON.stringify(steps, null, 2);
        this.$message.success('已保存');
      } catch (e) {
        /* 拦截器已提示 */
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.wf-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.wf-name {
  width: 320px;
  margin-bottom: 8px;
}

.wf-head-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.wf-desc {
  width: 420px;
}

.wf-json {
  padding: 14px 16px;
}

.wf-json-tip {
  font-size: 12px;
  margin-top: 6px;
}

.wf-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wf-step {
  padding: 10px 14px;
}

.wf-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wf-step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.wf-step-index {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ecf5ff;
  color: #409eff;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.wf-step-name {
  width: 220px;
}

.wf-collapse-tip {
  font-size: 12px;
}

.wf-step-form {
  padding-top: 6px;
}

.wf-empty {
  padding: 30px 0;
}

.col-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.col-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.col-key {
  width: 150px;
}

.col-title {
  width: 150px;
}

.col-tip {
  font-size: 11px;
}

.step-tip {
  font-size: 11px;
  line-height: 1.5;
  margin-top: 2px;
}

.wf-exec-summary {
  margin-top: 8px;
  padding: 8px 10px;
  background: #f7f8fa;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.9;
  color: #606266;
}

.wf-exec-summary b {
  color: #303133;
  font-weight: 600;
}

.wf-exec-prompt {
  color: #909399;
}

.wf-exec-ops {
  margin-top: 4px;
}
</style>
