<template>
  <div class="run-button">
    <el-button
      type="primary"
      size="small"
      :loading="running"
      :disabled="disabled || running || !!blockedStep || stepRunning"
      @click="run"
    >
      <i class="el-icon-video-play" /> {{ label }}
    </el-button>
    <el-button v-if="showCancel" size="small" :disabled="!running" @click="cancel">中止</el-button>
    <el-button v-if="showReset" size="small" @click="reset">重置</el-button>
    <span v-if="hintText" class="text-muted rb-hint">{{ hintText }}</span>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';

export default {
  name: 'RunButton',
  mixins: [runtimeMixin],
  props: {
    label: { type: String, default: '执行本步骤' },
    showReset: { type: Boolean, default: true },
    showCancel: { type: Boolean, default: false },
    // true = 每次确认；数字 = 行数达到该值时确认
    confirm: { type: [Boolean, Number], default: false },
    disabled: { type: Boolean, default: false },
    hint: { type: String, default: '' },
  },
  data() {
    return { running: false };
  },
  computed: {
    blockedStep() {
      const steps = this.rt.steps || [];
      const idx = Number(this.rt.stepIndex || 0);
      return steps.find((s) => Number(s.order || s.index + 1) <= idx && s.status !== 'success') || null;
    },
    stepRunning() {
      return Boolean(this.rt.step && this.rt.step.status === 'running');
    },
    hintText() {
      if (!this.rt.workId && this.rt.workId !== 0) return '设计模式：不会真正执行';
      if (this.blockedStep) return `请先完成第 ${this.blockedStep.order || this.blockedStep.index + 1} 步`;
      if (this.stepRunning) return '本步骤正在执行中，请等待完成（避免重复扣费）…';
      if (this.running) {
        const n = this.selectedCount;
        return n > 0 ? `执行中：共 ${n} 行，逐行调用，请不要关闭应用…` : '执行中，请不要关闭应用…';
      }
      if (this.hint) return this.hint;
      if (this.selectedCount > 1) return `本次将逐行处理 ${this.selectedCount} 行（每行一次请求）`;
      return '';
    },
    selectedCount() {
      const inputs = this.rt.getInputs ? this.rt.getInputs() : {};
      return Array.isArray(inputs.rows) ? inputs.rows.length : 0;
    },
  },
  methods: {
    async run() {
      if (!this.rt.run) {
        this.notify('设计模式：不执行', 'warning');
        return;
      }
      if (this.stepRunning) {
        this.notify('本步骤正在执行中，请等待完成（避免重复扣费）', 'warning');
        return;
      }
      const inputs = this.rt.getInputs ? this.rt.getInputs() : {};
      // 只有「当前页面的勾选器」才拦截；切换步骤时残留的标记不算
      const pageId = this.rt.step ? this.rt.step.page_id : null;
      const selectorOnThisPage = inputs.row_select_active && inputs.row_select_page === pageId;
      if (selectorOnThisPage && (!Array.isArray(inputs.rows) || !inputs.rows.length)) {
        this.notify('请先在上方勾选要处理的行（或点「全选」）', 'warning');
        return;
      }

      const rowsCount = Array.isArray(inputs.rows) ? inputs.rows.length : 0;
      const needConfirm = this.confirm === true
        || (typeof this.confirm === 'number' && this.confirm > 0 && rowsCount >= this.confirm);
      if (needConfirm) {
        try {
          const msg = rowsCount > 0
            ? `本次将逐行处理 ${rowsCount} 行，每行一次接口调用，耗时和费用会相应增加；执行中请不要关闭应用。确认继续？`
            : '确认执行本步骤？';
          await this.$confirm(msg, '执行确认', {
            type: 'warning',
            confirmButtonText: '开始执行',
            cancelButtonText: '取消',
          });
        } catch (e) {
          return;
        }
      }

      this.running = true;
      try {
        const result = await this.rt.run(inputs);
        if (result.status === 'success') this.notify('执行成功');
        else this.notify(result.message || '执行失败', 'error');
      } catch (e) {
        this.notify('执行请求中断（可能超时）；后台任务可能仍在执行，页面会自动刷新进度', 'warning');
      } finally {
        this.running = false;
      }
    },
    cancel() {
      this.running = false;
      this.notify('已请求中止（后端调用不可中断，请等待当前请求结束）', 'warning');
    },
    async reset() {
      try {
        await this.$confirm('重置将从本步骤开始清空后续所有结果，确认？', '提示', { type: 'warning' });
      } catch (e) {
        return;
      }
      try {
        if (this.rt.reset) await this.rt.reset();
        this.notify('已重置');
      } catch (e) {
        /* ignore */
      }
    },
  },
};
</script>

<style scoped>
.run-button {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rb-hint {
  font-size: 12px;
}
</style>
