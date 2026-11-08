<template>
  <div class="prompt-template">
    <div class="pt-head">
      <div>
        <span class="pt-label">{{ label }}</span>
        <span class="text-muted pt-hint">支持 ${...} 变量，保存后重新解析</span>
      </div>
      <div class="pt-ops">
        <el-radio-group v-model="scope" size="mini">
          <el-radio-button label="workflow">改工作流</el-radio-button>
          <el-radio-button label="work">仅本作品</el-radio-button>
        </el-radio-group>
        <el-button size="mini" type="primary" :loading="saving" :disabled="!editable" @click="save">保存</el-button>
        <el-button size="mini" :disabled="!editable" @click="reset">还原</el-button>
      </div>
    </div>
    <el-input
      v-model="text"
      type="textarea"
      :rows="rows"
      :disabled="!editable"
      class="mono"
      placeholder="在这里编写提示词，支持 ${gb.xxx} / ${stepList[0].rsp.xxx} 等变量"
    />
    <div v-if="showVars" class="pt-vars">
      <span class="text-muted">可用变量：</span>
      <el-tag
        v-for="v in variables"
        :key="v"
        size="mini"
        type="info"
        class="var-tag"
        @click="appendVar(v)"
      >{{ wrap(v) }}</el-tag>
    </div>
    <div v-if="tips" class="pt-tips text-muted">{{ tips }}</div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';

const PLACEHOLDER = /\$\{\s*([A-Za-z_][\w.[\]]*)\s*\}/g;

const SUGGESTED_VARS = [
  'gb.name', 'gb.content', 'gb.keywords', 'gb.source_url',
  'gb.prompt', 'gb.model_name', 'gb.item',
  'stepList[0].rsp.content', 'stepList[0].rsp.items', 'stepList[0].rsp.images',
  'prev_output', 'prev_image',
];

export default {
  name: 'PromptTemplate',
  mixins: [runtimeMixin],
  props: {
    value: { type: [String, Number], default: '' },
    label: { type: String, default: '提示词模版' },
    rows: { type: Number, default: 6 },
    editable: { type: Boolean, default: true },
    showVars: { type: Boolean, default: true },
    tips: { type: String, default: '' },
  },
  data() {
    return {
      text: String(this.value || ''),
      scope: 'workflow',
      saving: false,
    };
  },
  computed: {
    variables() {
      const found = [];
      let m;
      const re = new RegExp(PLACEHOLDER.source, 'g');
      while ((m = re.exec(this.text))) found.push(m[1]);
      const all = [...new Set([...found, ...SUGGESTED_VARS])];
      return all.slice(0, 18);
    },
  },
  watch: {
    value(v) {
      const next = String(v || '');
      if (next && next !== this.text) this.text = next;
    },
    text(v) {
      // 把编辑中的提示词同步到页面运行时，执行时可直接使用（无需先保存）
      if (this.rt && this.rt.setInput) this.rt.setInput('prompt', v);
    },
  },
  mounted() {
    if (this.rt && this.rt.setInput) this.rt.setInput('prompt', this.text);
  },
  methods: {
    wrap(v) {
      return '${' + v + '}';
    },
    appendVar(v) {
      const token = '${' + v + '}';
      this.text = `${this.text || ''}${this.text && !/\s$/.test(this.text) ? ' ' : ''}${token}`;
    },
    reset() {
      this.text = String(this.value || '');
    },
    async save() {
      if (!this.editable) return;
      this.saving = true;
      try {
        if (this.rt.savePrompt) {
          await this.rt.savePrompt(this.text, this.scope);
          this.notify('提示词已保存');
        } else {
          this.notify('设计模式下仅预览，不保存', 'warning');
        }
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
.pt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.pt-label {
  font-weight: 600;
  color: #1f2d3d;
}

.pt-hint {
  font-size: 12px;
  margin-left: 8px;
}

.pt-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-template ::v-deep textarea {
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.7;
}

.pt-vars {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.var-tag {
  cursor: pointer;
}

.pt-tips {
  margin-top: 6px;
  font-size: 12px;
}
</style>
