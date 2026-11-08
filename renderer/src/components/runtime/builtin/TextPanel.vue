<template>
  <div class="text-panel">
    <div class="tp-head">
      <span class="tp-label">{{ label }}</span>
      <div class="tp-ops">
        <el-radio-group v-if="editable" v-model="editing" size="mini">
          <el-radio-button :label="false">预览</el-radio-button>
          <el-radio-button :label="true">编辑</el-radio-button>
        </el-radio-group>
        <el-button size="mini" type="text" @click="copy">复制</el-button>
      </div>
    </div>
    <el-input
      v-if="editing"
      v-model="draft"
      type="textarea"
      :rows="10"
      class="mono"
      @change="$emit('change', draft)"
    />
    <div v-else class="preview-box" :style="{ maxHeight: maxHeight + 'px' }">
      <template v-if="format === 'markdown'">{{ textValue || '（空）' }}</template>
      <template v-else>{{ textValue || '（空）' }}</template>
    </div>
  </div>
</template>

<script>
import { copyText } from '@/utils/format';

export default {
  name: 'TextPanel',
  props: {
    text: { type: [String, Number, Object, Array], default: '' },
    label: { type: String, default: '文本产出' },
    format: { type: String, default: 'text' },
    maxHeight: { type: Number, default: 400 },
    editable: { type: Boolean, default: false },
  },
  data() {
    return { editing: false, draft: '' };
  },
  computed: {
    textValue() {
      const t = this.text;
      if (t === null || t === undefined) return '';
      if (typeof t === 'object') return JSON.stringify(t, null, 2);
      return String(t);
    },
  },
  watch: {
    textValue: {
      immediate: true,
      handler(v) {
        this.draft = v;
      },
    },
  },
  methods: {
    copy() {
      copyText(this.textValue).then(() => this.$message.success('已复制'));
    },
  },
};
</script>

<style scoped>
.tp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tp-label {
  font-weight: 600;
  color: #1f2d3d;
}

.tp-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
