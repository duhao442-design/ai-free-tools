<template>
  <div class="page-title-block">
    <div class="pt-text" :class="'size-' + (size || 'medium')">{{ text || '未命名页面' }}</div>
    <div v-if="subtitle" class="pt-sub">{{ subtitle }}</div>
  </div>
</template>

<script>
export default {
  name: 'PageTitle',
  props: {
    text: { type: [String, Number], default: '' },
    subtitle: { type: [String, Number], default: '' },
    size: { type: String, default: 'medium' },
  },
};
</script>

<style scoped>
.pt-text {
  font-weight: 600;
  color: #1f2d3d;
}

.pt-text.size-small {
  font-size: 15px;
}

.pt-text.size-medium {
  font-size: 18px;
}

.pt-text.size-large {
  font-size: 22px;
}

.pt-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
