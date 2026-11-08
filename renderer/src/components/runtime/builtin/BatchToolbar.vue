<template>
  <div class="batch-toolbar">
    <el-button type="primary" size="small" :loading="running" @click="run">
      <i class="el-icon-magic-stick" /> {{ label }}
    </el-button>
    <span class="text-muted bt-hint">{{ hintText }}</span>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';

export default {
  name: 'BatchToolbar',
  mixins: [runtimeMixin],
  props: {
    selected: { type: Array, default: () => [] },
    label: { type: String, default: '批量生成' },
    hint: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  data() {
    return { running: false };
  },
  computed: {
    hintText() {
      if (this.hint) return this.hint;
      const n = Array.isArray(this.selected) ? this.selected.length : 0;
      if (!n) return '请先在列表中勾选数据行';
      return `已选择 ${n} 行`;
    },
  },
  methods: {
    async run() {
      if (!this.rt.run) {
        this.notify('设计模式：不执行', 'warning');
        return;
      }
      if (!this.selected || !this.selected.length) {
        this.notify('请先勾选数据行', 'warning');
        return;
      }
      this.running = true;
      try {
        const result = await this.rt.run({ selected: this.selected });
        if (result.status === 'success') this.notify('执行成功');
        else this.notify(result.message || '执行失败', 'error');
      } catch (e) {
        /* ignore */
      } finally {
        this.running = false;
      }
    },
  },
};
</script>

<style scoped>
.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bt-hint {
  font-size: 12px;
}
</style>
