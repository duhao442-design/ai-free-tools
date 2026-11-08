<template>
  <div class="aift-page comp-edit" v-loading="loading">
    <div class="aift-card ce-head">
      <div class="ce-head-main">
        <el-input v-model="form.name" size="small" class="ce-name" placeholder="组件名称" />
        <el-input v-model="form.key" size="small" class="ce-key mono" placeholder="组件标识（小写字母/数字/中划线）" :disabled="!!form.id" />
        <el-select v-model="form.group_name" size="small" style="width: 130px" filterable allow-create placeholder="分组">
          <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
        </el-select>
      </div>
      <div class="aift-toolbar">
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button size="small" @click="$router.push('/components')">返回</el-button>
      </div>
    </div>

    <div class="ce-body">
      <div class="ce-left">
        <div class="aift-card ce-block">
          <div class="ce-block-title">基础信息</div>
          <el-form label-width="86px" size="mini">
            <el-form-item label="图标">
              <el-input v-model="form.icon" placeholder="el-icon-s-operation" />
            </el-form-item>
            <el-form-item label="说明">
              <el-input v-model="form.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="启用">
              <el-switch v-model="form.is_active" />
            </el-form-item>
          </el-form>
        </div>

        <div class="aift-card ce-block">
          <div class="ce-block-title">
            组件传参（props_schema）
            <el-button type="text" size="mini" icon="el-icon-plus" @click="addProp">添加参数</el-button>
          </div>
          <div class="text-muted ce-tip">
            这里声明的参数会出现在页面搭建器的「传参配置」里；勾选「支持表达式」后，搭建时可填 ${...} 从页面上下文取值。
          </div>
          <el-table :data="form.props_schema" size="mini" border>
            <el-table-column label="参数名" width="120">
              <template slot-scope="{ row, $index }">
                <el-input v-model="row.name" size="mini" />
              </template>
            </el-table-column>
            <el-table-column label="显示名" width="120">
              <template slot-scope="{ row }">
                <el-input v-model="row.label" size="mini" />
              </template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template slot-scope="{ row }">
                <el-select v-model="row.type" size="mini">
                  <el-option v-for="t in propTypes" :key="t" :label="t" :value="t" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="表达式" width="70" align="center">
              <template slot-scope="{ row }">
                <el-checkbox v-model="row.expr" />
              </template>
            </el-table-column>
            <el-table-column label="默认值" min-width="120">
              <template slot-scope="{ row }">
                <el-input v-model="row.default" size="mini" />
              </template>
            </el-table-column>
            <el-table-column width="50" align="center">
              <template slot-scope="{ $index }">
                <el-button type="text" size="mini" class="text-danger" @click="form.props_schema.splice($index, 1)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="aift-card ce-block">
          <div class="ce-block-title">渲染配置（render_spec）</div>
          <div class="text-muted ce-tip">
            支持节点类型：panel/title/text/field/image/json/input/button/divider。children 可嵌套。
          </div>
          <json-editor :value="form.render_spec" :rows="16" @change="(v) => (form.render_spec = v)" />
          <div class="ce-actions">
            <el-button size="mini" @click="insertSample">插入示例</el-button>
          </div>
        </div>
      </div>

      <div class="ce-right">
        <div class="aift-card ce-preview">
          <div class="ce-block-title">实时预览</div>
          <div class="text-muted ce-tip">用示例数据渲染当前 render_spec</div>
          <div class="ce-preview-box">
            <user-component :spec="form.render_spec" :component-key="form.key" :props-data="previewProps" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';
import UserComponent from '@/components/runtime/UserComponent.vue';
import { componentApi } from '@/api';

const SAMPLE_SPEC = {
  type: 'panel',
  title: '示例组件',
  children: [
    { type: 'text', value: '这里是一段文本，可用 ${gb.name} 取上下文。' },
    { type: 'field', label: '作品名称', value: '示例作品' },
    { type: 'image', value: 'https://picsum.photos/120', width: 120 },
    { type: 'json', value: { demo: true, count: 3 } },
    { type: 'input', label: '提示词', bind: 'prompt', rows: 3 },
    { type: 'button', label: '执行', action: 'run-step' },
  ],
};

const SAMPLE_PROPS = { text: '示例文本', image: 'https://picsum.photos/120', prompt: '示例提示词' };

export default {
  name: 'ComponentEdit',
  components: { JsonEditor, UserComponent },
  data() {
    return {
      loading: false,
      saving: false,
      groups: ['基础', '作品', '工作流', 'AI', '数据', '调试', '动作', '配置', '自定义'],
      propTypes: ['string', 'number', 'boolean', 'array', 'json', 'select'],
      form: {
        id: null,
        key: '',
        name: '',
        group_name: '自定义',
        icon: 'el-icon-s-operation',
        description: '',
        props_schema: [],
        render_spec: SAMPLE_SPEC,
        is_active: true,
      },
    };
  },
  computed: {
    previewProps() {
      return SAMPLE_PROPS;
    },
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      const id = this.$route.params.id;
      if (!id || id === 'new') return;
      this.loading = true;
      try {
        const c = await componentApi.detail(id);
        if (!c || c.source === 'builtin') {
          this.$message.warning('内置组件不可编辑');
          this.$router.push('/components');
          return;
        }
        this.form = {
          id: c.id,
          key: c.key,
          name: c.name,
          group_name: c.group_name,
          icon: c.icon,
          description: c.description,
          props_schema: (c.props_schema || []).map((p) => ({ ...p })),
          render_spec: c.render_spec || SAMPLE_SPEC,
          is_active: c.is_active,
        };
      } finally {
        this.loading = false;
      }
    },
    addProp() {
      this.form.props_schema.push({ name: '', label: '', type: 'string', expr: true, default: '' });
    },
    insertSample() {
      this.form.render_spec = JSON.parse(JSON.stringify(SAMPLE_SPEC));
    },
    async save() {
      if (!this.form.key && !this.form.id) {
        this.$message.warning('请填写组件标识');
        return;
      }
      if (!this.form.name) {
        this.$message.warning('请填写组件名称');
        return;
      }
      const invalid = this.form.props_schema.find((p) => !p.name);
      if (invalid) {
        this.$message.warning('存在未命名的参数');
        return;
      }
      this.saving = true;
      try {
        const payload = {
          key: this.form.key,
          name: this.form.name,
          group_name: this.form.group_name,
          icon: this.form.icon,
          description: this.form.description,
          props_schema: this.form.props_schema,
          render_spec: this.form.render_spec,
          is_active: this.form.is_active,
        };
        if (this.form.id) await componentApi.update(this.form.id, payload);
        else {
          const created = await componentApi.create(payload);
          this.form.id = created.id;
          this.$router.replace(`/components/${created.id}`);
        }
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
.comp-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ce-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
}

.ce-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.ce-name {
  width: 200px;
}

.ce-key {
  width: 240px;
}

.ce-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.ce-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ce-right {
  width: 380px;
  flex: none;
  position: sticky;
  top: 10px;
}

.ce-block,
.ce-preview {
  padding: 12px 14px;
}

.ce-block-title {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ce-tip {
  font-size: 12px;
  margin-bottom: 8px;
  line-height: 1.6;
}

.ce-actions {
  margin-top: 6px;
}

.ce-preview-box {
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  padding: 12px;
  min-height: 240px;
  background: #fafbfc;
}
</style>
