<template>
  <div class="response-panel">
    <div class="rsp-head">
      <span class="rsp-label">执行结果</span>
      <el-tag v-if="step && step.status" size="mini" :type="statusType">{{ statusLabel }}</el-tag>
      <span v-if="step && step.message" class="text-muted rsp-msg ellipsis">{{ step.message }}</span>
    </div>

    <el-tabs v-model="tab" type="border-card" class="rsp-tabs">
      <el-tab-pane label="提取结果" name="rsp">
        <json-viewer :value="rspData" :max-height="320" />
      </el-tab-pane>
      <el-tab-pane label="请求报文" name="req">
        <json-viewer :value="reqData" :max-height="320" />
      </el-tab-pane>
      <el-tab-pane label="文本产出" name="output">
        <div class="preview-box" :style="{ maxHeight: '320px' }">{{ output || '（空）' }}</div>
      </el-tab-pane>
      <el-tab-pane label="原始响应" name="raw">
        <div class="preview-box mono" :style="{ maxHeight: '320px' }">{{ rawRsp || '（空）' }}</div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import JsonViewer from '@/components/ui/JsonViewer.vue';
import { STEP_STATUS, labelOf, typeOf } from '@/utils/constants';

export default {
  name: 'ResponsePanel',
  components: { JsonViewer },
  mixins: [runtimeMixin],
  props: {
    reqData: { type: [Object, Array, String], default: null },
    rspData: { type: [Object, Array, String], default: null },
    rawRsp: { type: String, default: '' },
    output: { type: [String, Number], default: '' },
  },
  data() {
    return { tab: 'rsp' };
  },
  computed: {
    step() {
      return this.rt.step || {};
    },
    statusLabel() {
      return labelOf(STEP_STATUS, this.step.status);
    },
    statusType() {
      return typeOf(STEP_STATUS, this.step.status);
    },
  },
};
</script>

<style scoped>
.rsp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  min-width: 0;
}

.rsp-label {
  font-weight: 600;
  color: #1f2d3d;
}

.rsp-msg {
  font-size: 12px;
  min-width: 0;
}

.rsp-tabs ::v-deep .el-tabs__content {
  padding: 10px;
}
</style>
