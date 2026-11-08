<template>
  <div :class="nodeClass">
    <div v-if="title" class="un-title">{{ title }}</div>
    <template v-for="(child, i) in node.children || []">
      <user-node :key="i" :node="child" :props-data="propsData" @action="$emit('action', $event)" />
    </template>
    <div v-if="node.type === 'text'" class="un-text">{{ value }}</div>
    <div v-else-if="node.type === 'field'" class="un-field">
      <span class="un-field-label">{{ label }}</span>
      <span class="un-field-value">{{ value }}</span>
    </div>
    <img v-else-if="node.type === 'image' && value" :src="value" class="un-img" :style="imgStyle" />
    <pre v-else-if="node.type === 'json'" class="json-pre un-json">{{ jsonText }}</pre>
    <div v-else-if="node.type === 'input'" class="un-input">
      <div v-if="label" class="un-input-label">{{ label }}</div>
      <el-input
        v-model="modelValue"
        :type="node.rows ? 'textarea' : 'text'"
        :rows="node.rows || 3"
        size="small"
        @change="onChange"
      />
    </div>
    <el-button
      v-else-if="node.type === 'button'"
      size="small"
      :type="node.primary === false ? '' : 'primary'"
      @click="$emit('action', { action: node.action, bind: node.bind })"
    >{{ label }}</el-button>
    <el-divider v-else-if="node.type === 'divider'" />
  </div>
</template>

<script>
import { formatJson } from '@/utils/format';

/** 把 ${props.xxx} 替换成页面解析后的组件传参 */
function interpolate(text, propsData) {
  if (typeof text !== 'string') return text;
  return text.replace(/\$\{\s*props\.([A-Za-z_][\w.]*)\s*\}/g, (whole, key) => {
    const value = String(key)
      .split('.')
      .reduce((acc, k) => (acc === null || acc === undefined ? undefined : acc[k]), propsData);
    if (value === undefined || value === null) return whole;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

export default {
  name: 'UserNode',
  props: {
    node: { type: Object, required: true },
    propsData: { type: Object, default: () => ({}) },
  },
  data() {
    return { modelValue: this.node.boundValue || '' };
  },
  computed: {
    nodeClass() {
      return ['un-node', `un-${this.node.type}`];
    },
    title() {
      return interpolate(this.node.title, this.propsData);
    },
    label() {
      return interpolate(this.node.label, this.propsData);
    },
    value() {
      const raw = interpolate(this.node.value, this.propsData);
      return raw;
    },
    jsonText() {
      return formatJson(this.node.value);
    },
    imgStyle() {
      return { width: `${Number(this.node.width) || 160}px` };
    },
  },
  methods: {
    onChange(v) {
      this.$emit('action', { action: 'input-change', bind: this.node.bind, value: v });
    },
  },
};
</script>

<style scoped>
.un-node {
  margin-bottom: 8px;
}

.un-title {
  font-weight: 600;
  color: #1f2d3d;
  margin-bottom: 6px;
}

.un-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.7;
  color: #303133;
}

.un-field {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 2px 0;
}

.un-field-label {
  color: #909399;
  flex: none;
  min-width: 70px;
}

.un-field-value {
  color: #303133;
  word-break: break-word;
}

.un-img {
  border-radius: 6px;
  border: 1px solid #ebeef5;
  display: block;
}

.un-json {
  max-height: 260px;
}

.un-input-label {
  font-size: 12px;
  color: #606266;
  margin-bottom: 4px;
}
</style>
