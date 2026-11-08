<template>
  <div class="json-viewer-block">
    <json-viewer :value="value" :label="label" :max-height="maxHeight" />
  </div>
</template>

<script>
import JsonViewer from '@/components/ui/JsonViewer.vue';

export default {
  name: 'JsonViewerBlock',
  components: { JsonViewer },
  props: {
    value: { type: [Object, Array, String, Number, Boolean], default: null },
    label: { type: String, default: '' },
    maxHeight: { type: Number, default: 320 },
  },
};
</script>
