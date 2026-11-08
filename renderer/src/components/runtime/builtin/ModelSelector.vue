<template>
  <div class="model-selector">
    <span v-if="label" class="ms-label">{{ label }}</span>
    <el-select
      :value="inner"
      :placeholder="placeholder"
      :filterable="filterable"
      :clearable="clearable"
      size="small"
      style="width: 100%"
      @change="onChange"
    >
      <el-option
        v-for="m in options"
        :key="m.id"
        :label="optionLabel(m)"
        :value="m.id"
      >
        <span class="ms-name">{{ m.name }}</span>
        <span class="ms-meta">{{ m.model_name }}<template v-if="showFormat"> · {{ m.format_type }}</template></span>
      </el-option>
    </el-select>
    <div v-if="current && current.model_type" class="ms-tip text-muted">
      类型：{{ current.model_type }}<template v-if="current.base_url"> · {{ current.base_url }}</template>
    </div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import { modelApi } from '@/api';

export default {
  name: 'ModelSelector',
  mixins: [runtimeMixin],
  props: {
    modelValue: { type: [Number, String], default: null },
    filterModelType: { type: String, default: '' },
    placeholder: { type: String, default: '请选择模型' },
    showFormat: { type: Boolean, default: false },
    label: { type: String, default: '' },
    filterable: { type: Boolean, default: true },
    clearable: { type: Boolean, default: false },
  },
  data() {
    return { models: [], inner: this.modelValue };
  },
  computed: {
    options() {
      if (!this.filterModelType) return this.models;
      return this.models.filter((m) => m.model_type === this.filterModelType);
    },
    current() {
      return this.models.find((m) => m.id === this.inner) || null;
    },
  },
  watch: {
    modelValue(v) {
      this.inner = v;
    },
  },
  created() {
    this.fetch();
  },
  methods: {
    async fetch() {
      try {
        this.models = await modelApi.all();
      } catch (e) {
        /* ignore */
      }
    },
    optionLabel(m) {
      return `${m.name}（${m.model_name}）`;
    },
    onChange(v) {
      this.inner = v;
      this.$emit('change', v);
      this.$emit('update:modelValue', v);
    },
  },
};
</script>

<style scoped>
.ms-label {
  font-size: 12px;
  color: #606266;
  margin-right: 6px;
}

.ms-name {
  font-size: 13px;
}

.ms-meta {
  float: right;
  color: #909399;
  font-size: 12px;
}

.ms-tip {
  margin-top: 4px;
  font-size: 12px;
}
</style>
