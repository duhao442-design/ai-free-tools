<template>
  <div class="json-editor-block">
    <div v-if="label" class="jeb-head">
      <span class="jeb-label">{{ label }}</span>
      <span class="text-muted">编辑后可用于执行参数</span>
    </div>
    <json-editor
      :value="value"
      :rows="rows"
      :placeholder="placeholder"
      @change="onChange"
    />
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';

export default {
  name: 'JsonEditorBlock',
  components: { JsonEditor },
  props: {
    value: { type: [Object, Array, String], default: '' },
    label: { type: String, default: '' },
    rows: { type: Number, default: 8 },
    placeholder: { type: String, default: '请输入 JSON' },
  },
  methods: {
    onChange(value) {
      this.$emit('change', value);
    },
  },
};
</script>

<style scoped>
.jeb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.jeb-label {
  font-weight: 600;
  color: #1f2d3d;
}
</style>
