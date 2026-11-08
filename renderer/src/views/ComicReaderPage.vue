<template>
  <div class="crp" v-loading="loading">
    <div class="crp-bar">
      <el-button size="small" icon="el-icon-back" @click="goBack">返回作品</el-button>
      <span class="crp-title">{{ work ? work.name : '' }} · 漫画成品页</span>
      <span class="crp-tip text-muted">{{ pageName ? `页面：${pageName}` : '' }}</span>
    </div>

    <runtime-page
      v-if="data"
      :key="`reader-${workId}`"
      :layout="data.layout"
      :context="data.context"
      :resolved="data.resolved"
      :work="work"
      :steps="steps"
      :work-id="workId"
      :step-index="steps.length"
      mode="reader"
    />

    <el-empty v-else-if="!loading" :description="error" class="crp-empty" />
  </div>
</template>

<script>
import RuntimePage from '@/components/runtime/RuntimePage.vue';
import { workApi, pageApi } from '@/api';

/** 作品成品页：找到带「漫画成品页」组件的页面，用该作品上下文解析后渲染 */
export default {
  name: 'ComicReaderPage',
  components: { RuntimePage },
  data() {
    return {
      workId: Number(this.$route.params.id),
      loading: false,
      error: '',
      work: null,
      steps: [],
      pageName: '',
      data: null,
    };
  },
  created() {
    this.load();
  },
  methods: {
    goBack() {
      this.$router.push(`/works/${this.workId}`);
    },
    async load() {
      this.loading = true;
      this.error = '';
      try {
        const detail = await workApi.detailFull(this.workId);
        this.work = detail.work;
        this.steps = detail.steps || [];

        const pages = await pageApi.page({ page_num: 1, page_size: 100 });
        const rows = pages.data || [];
        const target = rows.find((p) => (p.layout || []).some((b) => b.component === 'comic-reader'));
        if (!target) {
          this.error = '还没有成品页：请到「页面管理」新建一个页面，拖入「漫画成品页」组件。';
          return;
        }
        this.pageName = target.name;
        this.data = await pageApi.resolve({
          page_id: target.id,
          work_id: this.workId,
          // stepOrder = 步骤数+1 → stepList 里包含前 4 步（分镜 + 最终成图）
          step: this.steps.length + 1,
        });
      } catch (e) {
        this.error = e.message || '加载失败';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.crp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.crp-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
}

.crp-title {
  font-weight: 600;
  color: #1f2d3d;
}

.crp-tip {
  font-size: 12px;
}

.crp-empty {
  background: #fff;
  border-radius: 8px;
  padding: 40px 0;
}
</style>
