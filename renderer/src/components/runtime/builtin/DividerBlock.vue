<template>
  <el-divider :content-position="position">{{ text }}</el-divider>
</template>

<script>
export default {
  name: 'DividerBlock',
  props: {
    text: { type: String, default: '' },
    position: { type: String, default: 'left' },
  },
};
</script>
