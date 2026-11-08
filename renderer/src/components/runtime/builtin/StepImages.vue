<template>
  <div class="step-images">
    <image-grid
      :images="images"
      :labels="labels"
      :columns="columns"
      :size="size"
      :show-index="showIndex"
      :label="label"
    />
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import ImageGrid from './ImageGrid.vue';

/**
 * 展示「当前步骤」产出的图片。
 * 当前步骤的结果不在页面上下文（stepList 只有已完成的前置步骤），所以直接从运行时 step 里取。
 */
export default {
  name: 'StepImages',
  components: { ImageGrid },
  mixins: [runtimeMixin],
  props: {
    label: { type: String, default: '本步产出图片' },
    columns: { type: Number, default: 4 },
    size: { type: Number, default: 180 },
    showIndex: { type: Boolean, default: true },
    nameField: { type: String, default: 'name' },
    labelFields: { type: Array, default: () => [] },
  },
  computed: {
    images() {
      const step = this.rt.step || {};
      if (Array.isArray(step.images) && step.images.length) return step.images;
      const rsp = step.rsp_data || {};
      if (Array.isArray(rsp.images) && rsp.images.length) return rsp.images;
      if (Array.isArray(rsp.items)) {
        return rsp.items.map((it) => it && (it.image_url || it.image)).filter(Boolean);
      }
      return [];
    },
    labels() {
      const step = this.rt.step || {};
      const items = (step.rsp_data && Array.isArray(step.rsp_data.items)) ? step.rsp_data.items : [];
      const byUrl = {};
      for (const it of items) {
        if (!it) continue;
        const url = it.image_url || it.image;
        if (!url) continue;
        const name = it[this.nameField] || it.name || it.title || '';
        const fromFields = (this.labelFields || [])
          .map((f) => it[f])
          .filter((v) => v !== undefined && v !== null && v !== '')
          .join('-');
        byUrl[url] = fromFields || name;
      }
      return this.images.map((img) => byUrl[img] || '');
    },
  },
};
</script>
