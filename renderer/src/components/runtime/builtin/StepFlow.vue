<template>
  <div class="step-flow-block">
    <el-steps :active="active" :direction="direction" :simple="direction === 'horizontal'" finish-status="success">
      <el-step
        v-for="(s, i) in stepList"
        :key="i"
        :title="s.name"
        :status="stepStatus(s)"
        @click.native="onClick(i)"
      />
    </el-steps>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';

export default {
  name: 'StepFlow',
  mixins: [runtimeMixin],
  props: {
    clickable: { type: Boolean, default: true },
    direction: { type: String, default: 'horizontal' },
  },
  computed: {
    stepList() {
      return this.rt.steps || [];
    },
    active() {
      const idx = Number(this.rt.stepIndex || 0);
      return Math.min(idx, Math.max(0, this.stepList.length - 1));
    },
  },
  methods: {
    stepStatus(s) {
      if (s.status === 'failed') return 'error';
      if (s.status === 'success') return 'success';
      if (s.status === 'running') return 'process';
      return 'wait';
    },
    onClick(i) {
      if (!this.clickable) return;
      if (i === Number(this.rt.stepIndex)) return;
      this.$emit('switch-step', i);
    },
  },
};
</script>

<style scoped>
.step-flow-block ::v-deep .el-step__title {
  cursor: pointer;
  font-size: 13px;
}
</style>
