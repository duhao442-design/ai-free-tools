<template>
  <div class="step-items">
    <step-item-table
      :items="items"
      :columns="columns"
      :label="label"
      :max-height="maxHeight"
      :editable="false"
      :selectable="false"
      :show-index="true"
      :show-raw="showRaw"
    />
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import StepItemTable from './StepItemTable.vue';

/** 展示「当前步骤」解析出的列表（rsp_data.items），列留空时按首行自动推导 */
export default {
  name: 'StepItems',
  components: { StepItemTable },
  mixins: [runtimeMixin],
  props: {
    label: { type: String, default: '本步列表产出' },
    columns: { type: Array, default: () => [] },
    maxHeight: { type: Number, default: 420 },
    showRaw: { type: Boolean, default: false },
  },
  computed: {
    items() {
      const rsp = (this.rt.step && this.rt.step.rsp_data) || {};
      return Array.isArray(rsp.items) ? rsp.items : [];
    },
  },
};
</script>
