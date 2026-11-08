<template>
  <div class="runtime-canvas">
    <div
      v-for="blk in layout"
      :key="blk.id"
      class="runtime-block"
      :class="{ 'no-card': blk.noCard === true }"
      :style="blockStyle(blk)"
    >
      <runtime-block
        :block="blk"
        :resolved="resolvedMap"
        @refresh="$emit('refresh')"
        @switch-step="(i) => $emit('switch-step', i)"
        @action="(p) => $emit('action', p)"
      />
    </div>
    <div v-if="!layout.length" class="runtime-empty text-muted">
      该页面还没有组件，请到「页面管理 → 设计」里拖拽搭建。
    </div>
  </div>
</template>

<script>
import RuntimeBlock from './RuntimeBlock.vue';
import { workApi } from '@/api';

export default {
  name: 'RuntimePage',
  components: { RuntimeBlock },
  props: {
    layout: { type: Array, default: () => [] },
    context: { type: Object, default: () => ({ gb: {}, stepList: [] }) },
    work: { type: Object, default: null },
    step: { type: Object, default: null },
    steps: { type: Array, default: () => [] },
    workId: { type: [Number, String], default: null },
    stepIndex: { type: Number, default: 0 },
    resolved: { type: Array, default: () => [] },
    mode: { type: String, default: 'runtime' },
  },
  provide() {
    // 用 getter 暴露：步进/刷新后 prop 会整体替换，直接存值会拿到创建时的旧对象（列表一直是空的）
    const self = this;
    return {
      aiftRuntime: {
        get mode() {
          return self.mode;
        },
        get workId() {
          return self.workId;
        },
        get stepIndex() {
          return self.stepIndex;
        },
        get work() {
          return self.work;
        },
        get step() {
          return self.step;
        },
        get steps() {
          return self.steps;
        },
        get context() {
          return self.context;
        },
        inputs: this.pageInputs,
        setInput: (key, value) => {
          this.$set(this.pageInputs, key, value);
        },
        getInputs: () => ({ ...this.pageInputs }),
        refresh: () => this.$emit('refresh'),
        run: (inputs) => this.run(inputs),
        reset: () => this.reset(),
        savePrompt: (prompt, scope) => this.savePrompt(prompt, scope),
      },
    };
  },
  data() {
    return {
      pageInputs: {},
    };
  },
  computed: {
    resolvedMap() {
      const map = {};
      for (const item of this.resolved || []) map[item.id] = item;
      return map;
    },
  },
  methods: {
    blockStyle(blk) {
      const span = Number(blk.span) > 0 ? Number(blk.span) : 24;
      return { gridColumn: `span ${Math.min(24, span)}` };
    },
    async run(inputs) {
      if (this.workId === null || this.workId === undefined) throw new Error('缺少作品上下文');
      try {
        const result = await workApi.run(this.workId, this.stepIndex + 1, inputs || {});
        this.$emit('ran', result);
        this.$emit('refresh');
        return result;
      } catch (e) {
        // 请求中断/超时：后台可能还在跑，通知父级刷新并拉进度
        this.$emit('refresh');
        throw e;
      }
    },
    async reset() {
      const rows = await workApi.reset(this.workId, this.stepIndex + 1);
      this.$emit('reset', rows);
      this.$emit('refresh');
      return rows;
    },
    async savePrompt(prompt, scope = 'workflow') {
      const result = await workApi.savePrompt(this.workId, this.stepIndex + 1, prompt, scope);
      this.$emit('refresh');
      return result;
    },
  },
};
</script>

<style scoped>
.runtime-canvas {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 12px;
}

.runtime-empty {
  grid-column: span 24;
  text-align: center;
  padding: 60px 0;
  background: #fff;
  border-radius: 8px;
}
</style>
