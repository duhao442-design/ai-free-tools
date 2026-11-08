<template>
  <div class="json-viewer">
    <div v-if="label" class="json-viewer-head">
      <span class="text-secondary">{{ label }}</span>
      <el-button type="text" size="mini" @click="copy">复制</el-button>
    </div>
    <pre v-if="text" class="json-pre" :style="{ maxHeight: maxHeight + 'px' }">{{ text }}</pre>
    <div v-else class="text-muted json-empty">（空）</div>
  </div>
</template>

<script>
import { formatJson, copyText } from '@/utils/format';

export default {
  name: 'JsonViewer',
  props: {
    value: { type: [Object, Array, String, Number, Boolean], default: null },
    label: { type: String, default: '' },
    maxHeight: { type: Number, default: 320 },
  },
  computed: {
    text() {
      if (this.value === null || this.value === undefined || this.value === '') return '';
      if (typeof this.value === 'string') {
        const trimmed = this.value.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) return formatJson(trimmed);
        return this.value;
      }
      return formatJson(this.value);
    },
  },
  methods: {
    copy() {
      copyText(this.text).then(() => this.$message.success('已复制'));
    },
  },
};
</script>

<style scoped>
.json-viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.json-empty {
  padding: 8px 0;
  font-size: 12px;
}
</style>
