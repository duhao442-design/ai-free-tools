<template>
  <div class="aift-page work-detail" v-loading="loading">
    <div class="wd-head aift-card">
      <div class="wd-head-main">
        <div class="wd-title-row">
          <span class="wd-title">{{ work.name }}</span>
          <el-tag size="mini">{{ labelOf(workTypes, work.type) }}</el-tag>
          <el-tag size="mini" :type="statusType">{{ statusLabel }}</el-tag>
          <span v-if="workflow" class="text-muted">工作流：{{ workflow.name }}</span>
        </div>
        <div class="wd-meta text-muted">
          <span v-if="work.keywords">关键词：{{ work.keywords }}</span>
          <span v-if="work.source_url">来源：{{ work.source_url }}</span>
          <span>创建于 {{ formatDate(work.created_at) }}</span>
        </div>
      </div>
      <div class="aift-toolbar">
        <el-button
          size="small"
          type="primary"
          :loading="running"
          :disabled="!canRun"
          @click="runStep"
        >
          <i class="el-icon-video-play" /> 执行本步骤
        </el-button>
        <el-button size="small" :disabled="running" @click="resetStep">重置本步骤</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="reloadAll">刷新</el-button>
        <el-button size="small" icon="el-icon-reading" @click="openReader">成品页</el-button>
        <el-button size="small" icon="el-icon-data-line" @click="contextVisible = true">页面上下文</el-button>
        <el-button size="small" icon="el-icon-edit" @click="editVisible = true">作品参数</el-button>
        <el-button size="small" @click="$router.push('/works')">返回列表</el-button>
      </div>
    </div>

    <div v-if="!workflow" class="aift-card wd-empty">
      <el-empty description="该作品还没有绑定工作流">
        <el-button type="primary" size="small" @click="$router.push('/works')">去列表编辑作品</el-button>
      </el-empty>
    </div>

    <template v-else>
      <div class="aift-card wd-steps">
        <el-steps :active="currentIndex" finish-status="success" simple>
          <el-step
            v-for="(s, i) in steps"
            :key="i"
            :title="s.name"
            :status="stepStatus(s)"
            @click.native="switchStep(i)"
          />
        </el-steps>
      </div>

      <div v-if="pageData" class="wd-body">
        <runtime-page
          :key="`page-${currentIndex}-${pageData.page ? pageData.page.id : 0}`"
          :layout="pageData.page.layout"
          :context="pageData.context"
          :resolved="pageData.resolved"
          :work="pageData.work"
          :step="pageData.step"
          :steps="pageData.steps"
          :work-id="workId"
          :step-index="currentIndex"
          @refresh="refreshCurrent"
          @switch-step="switchStep"
        />
      </div>

      <div v-else-if="pageError" class="aift-card wd-empty">
        <el-empty :description="pageError" />
      </div>

      <div class="wd-nav">
        <el-button size="small" :disabled="currentIndex <= 0" @click="switchStep(currentIndex - 1)">
          <i class="el-icon-arrow-left" /> 上一步
        </el-button>
        <span class="text-muted wd-nav-tip">
          第 {{ currentIndex + 1 }} / {{ steps.length }} 步 ·
          {{ currentStep ? currentStep.name : '' }} ·
          状态：{{ currentStep ? stepStatusText(currentStep) : '-' }}
        </span>
        <el-button size="small" :disabled="currentIndex >= steps.length - 1" @click="switchStep(currentIndex + 1)">
          下一步 <i class="el-icon-arrow-right" />
        </el-button>
      </div>
    </template>

    <el-drawer :visible.sync="contextVisible" title="页面上下文（后端产出）" size="46%" append-to-body>
      <div class="drawer-body">
        <el-alert
          type="info"
          :closable="false"
          title="页面之间不共享前端传参：每一步的上下文都由后端按作品与已执行步骤重新构建。"
          show-icon
        />
        <div class="drawer-sub-title">gb（全局对象）</div>
        <json-viewer :value="pageData && pageData.context ? pageData.context.gb : {}" :max-height="360" />
        <div class="drawer-sub-title">stepList（已完成步骤）</div>
        <json-viewer :value="pageData && pageData.context ? pageData.context.stepList : []" :max-height="360" />
      </div>
    </el-drawer>

    <el-dialog :visible.sync="editVisible" title="作品参数" width="560px">
      <el-form label-width="90px" size="small">
        <el-form-item label="作品内容">
          <el-input v-model="editForm.content" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="editForm.keywords" />
        </el-form-item>
        <el-form-item label="输入参数">
          <json-editor v-model="editForm.params" :rows="5" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="editVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveParams">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import RuntimePage from '@/components/runtime/RuntimePage.vue';
import JsonViewer from '@/components/ui/JsonViewer.vue';
import JsonEditor from '@/components/ui/JsonEditor.vue';
import { workApi } from '@/api';
import { WORK_TYPES, WORK_STATUS, labelOf, typeOf } from '@/utils/constants';
import { formatDate } from '@/utils/format';

export default {
  name: 'WorkDetail',
  components: { RuntimePage, JsonViewer, JsonEditor },
  data() {
    return {
      workId: Number(this.$route.params.id),
      workTypes: WORK_TYPES,
      loading: false,
      work: {},
      workflow: null,
      steps: [],
      currentIndex: 0,
      pageData: null,
      pageError: '',
      contextVisible: false,
      editVisible: false,
      running: false,
      pollTimer: null,
      editForm: { content: '', keywords: '', params: {} },
    };
  },
  computed: {
    statusLabel() {
      return labelOf(WORK_STATUS, this.work.status);
    },
    statusType() {
      return typeOf(WORK_STATUS, this.work.status);
    },
    currentStep() {
      return this.steps[this.currentIndex] || null;
    },
    canRun() {
      if (this.running) return false;
      if (this.currentStep && this.currentStep.status === 'running') return false;
      return (this.steps || [])
        .filter((s) => Number(s.order || s.index + 1) < this.currentIndex + 1)
        .every((s) => s.status === 'success');
    },
  },
  created() {
    this.loadDetail();
  },
  beforeDestroy() {
    this.stopPolling();
  },
  methods: {
    labelOf,
    formatDate,
    /** 步骤在跑时轮询进度（其它入口触发的长任务也能看到图和进度） */
    startPolling() {
      this.stopPolling();
      this.pollTimer = setInterval(async () => {
        try {
          const detail = await workApi.detailFull(this.workId);
          this.work = detail.work;
          this.steps = detail.steps || [];
          if (!this.steps.some((s) => s.status === 'running')) {
            this.stopPolling();
            await this.loadPage();
          }
        } catch (e) {
          /* 忽略轮询错误 */
        }
      }, 5000);
    },
    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },
    async loadDetail() {
      this.loading = true;
      try {
        const data = await workApi.detailFull(this.workId);
        this.work = data.work;
        this.workflow = data.workflow;
        this.steps = data.steps || [];
        this.currentIndex = Number(data.current || 0);
        this.editForm = {
          content: data.work.content || '',
          keywords: data.work.keywords || '',
          params: data.work.params || {},
        };
        if (this.workflow) await this.loadPage();
        if (this.steps.some((s) => s.status === 'running')) this.startPolling();
      } finally {
        this.loading = false;
      }
    },
    async loadPage() {
      this.pageError = '';
      try {
        this.pageData = await workApi.pageData(this.workId, this.currentIndex);
        this.steps = (this.pageData.steps || []).map((s, i) => ({ ...this.steps[i], ...s }));
      } catch (e) {
        this.pageData = null;
        this.pageError = e.message || '页面加载失败';
      }
    },
    async switchStep(i) {
      if (i < 0 || i >= this.steps.length || i === this.currentIndex) return;
      this.currentIndex = i;
      await this.loadPage();
    },
    openReader() {
      this.$router.push(`/works/${this.workId}/reader`);
    },
    async refreshCurrent() {
      await this.loadPage();
      const detail = await workApi.detailFull(this.workId);
      this.work = detail.work;
      this.steps = detail.steps || [];
      this.currentIndex = Math.min(this.currentIndex, Math.max(0, this.steps.length - 1));
      if (this.steps.some((s) => s.status === 'running')) this.startPolling();
    },
    async reloadAll() {
      await this.loadDetail();
    },
    async runStep() {
      if (this.currentStep && this.currentStep.status === 'running') {
        this.$message.warning('本步骤正在执行中，请等待完成（避免重复扣费）');
        return;
      }
      this.running = true;
      try {
        const result = await workApi.run(this.workId, this.currentIndex + 1, {});
        if (result.status === 'success') this.$message.success(`执行成功：${result.message || ''}`);
        else this.$message.error(`执行失败：${result.message || ''}`);
        await this.reloadAll();
      } catch (e) {
        // 请求中断/超时：后台可能还在跑，转为轮询进度
        this.$message.warning('执行请求中断（可能超时）；后台任务可能仍在执行，正在刷新进度');
        this.startPolling();
      } finally {
        this.running = false;
      }
    },
    async resetStep() {
      try {
        await this.$confirm('重置将从本步骤开始清空后续所有结果，确认？', '提示', { type: 'warning' });
      } catch (e) {
        return;
      }
      await workApi.reset(this.workId, this.currentIndex + 1);
      this.$message.success('已重置');
      await this.reloadAll();
    },
    stepStatus(s) {
      if (s.status === 'failed') return 'error';
      if (s.status === 'success') return 'success';
      if (s.status === 'running') return 'process';
      return 'wait';
    },
    stepStatusText(s) {
      return { pending: '待执行', running: '执行中', success: '成功', failed: '失败' }[s.status] || s.status;
    },
    async saveParams() {
      try {
        await workApi.saveParams(this.workId, this.editForm.params);
        await workApi.update(this.workId, {
          content: this.editForm.content,
          keywords: this.editForm.keywords,
        });
        this.$message.success('已保存');
        this.editVisible = false;
        await this.reloadAll();
      } catch (e) {
        /* ignore */
      }
    },
  },
};
</script>

<style scoped>
.work-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wd-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.wd-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wd-title {
  font-size: 17px;
  font-weight: 600;
  color: #1f2d3d;
}

.wd-meta {
  margin-top: 6px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  flex-wrap: wrap;
}

.wd-steps {
  padding: 10px 14px;
}

.wd-steps ::v-deep .el-step__title {
  cursor: pointer;
}

.wd-body {
  min-height: 200px;
}

.wd-empty {
  padding: 40px 0;
}

.wd-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 0;
}

.wd-nav-tip {
  font-size: 12px;
}

.drawer-body {
  padding: 0 16px 20px;
}

.drawer-sub-title {
  font-weight: 600;
  margin: 14px 0 6px;
  font-size: 13px;
}
</style>
