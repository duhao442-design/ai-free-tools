<template>
  <el-alert :title="text" :type="type || 'info'" :closable="closable" show-icon :description="description" />
</template>

<script>
export default {
  name: 'NoticeBlock',
  props: {
    text: { type: String, default: '' },
    description: { type: String, default: '' },
    type: { type: String, default: 'info' },
    closable: { type: Boolean, default: false },
  },
};
</script>
