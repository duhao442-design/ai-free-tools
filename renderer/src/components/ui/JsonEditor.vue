<template>
  <div class="json-editor">
    <el-input
      :value="innerValue"
      type="textarea"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      spellcheck="false"
      class="mono"
      @input="onInput"
    />
    <div class="json-editor-foot">
      <span v-if="error" class="text-danger">{{ error }}</span>
      <span v-else class="text-muted">{{ hint }}</span>
      <span class="json-editor-ops">
        <el-button type="text" size="mini" @click="format">格式化</el-button>
        <el-button type="text" size="mini" @click="clear">清空</el-button>
      </span>
    </div>
  </div>
</template>

<script>
import { formatJson } from '@/utils/format';

export default {
  name: 'JsonEditor',
  props: {
    value: { type: [String, Object, Array], default: '' },
    rows: { type: Number, default: 8 },
    placeholder: { type: String, default: '请输入 JSON' },
    disabled: { type: Boolean, default: false },
    emptyAsNull: { type: Boolean, default: true },
  },
  data() {
    return {
      innerValue: typeof this.value === 'string' ? this.value : formatJson(this.value),
      error: '',
    };
  },
  computed: {
    hint() {
      return this.emptyAsNull ? '留空表示 null；支持 JSON 对象/数组' : '支持 JSON 对象/数组';
    },
  },
  watch: {
    value: {
      handler(v) {
        const next = typeof v === 'string' ? v : formatJson(v);
        if (next !== this.innerValue) this.innerValue = next;
      },
    },
  },
  methods: {
    onInput(text) {
      this.innerValue = text;
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        this.error = '';
        this.$emit('input', this.emptyAsNull ? null : '');
        this.$emit('change', this.emptyAsNull ? null : '');
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        this.error = '';
        this.$emit('input', parsed);
        this.$emit('change', parsed);
      } catch (e) {
        this.error = `JSON 解析失败: ${e.message}`;
      }
    },
    format() {
      try {
        const parsed = JSON.parse(this.innerValue || '');
        this.innerValue = JSON.stringify(parsed, null, 2);
        this.error = '';
      } catch (e) {
        this.error = `JSON 解析失败: ${e.message}`;
      }
    },
    clear() {
      this.innerValue = '';
      this.error = '';
      this.$emit('input', this.emptyAsNull ? null : '');
      this.$emit('change', this.emptyAsNull ? null : '');
    },
  },
};
</script>

<style scoped>
.json-editor ::v-deep textarea {
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.json-editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 2px;
}
</style>
