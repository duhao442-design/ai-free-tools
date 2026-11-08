<template>
  <div class="request-preview">
    <div class="rp-head">
      <span class="rp-label">请求报文预览</span>
      <span v-if="request && request.url" class="rp-url mono ellipsis">{{ request.url }}</span>
    </div>
    <div v-if="!request" class="text-muted rp-empty">暂无请求报文（执行步骤或点击「解析预览」后展示）</div>
    <template v-else>
      <el-tabs v-model="tab" type="border-card" class="rp-tabs">
        <el-tab-pane label="Body" name="body">
          <json-viewer :value="request.body" :max-height="300" />
        </el-tab-pane>
        <el-tab-pane v-if="showHeaders" label="Headers" name="headers">
          <json-viewer :value="request.headers" :max-height="240" />
        </el-tab-pane>
        <el-tab-pane v-if="request.query && Object.keys(request.query).length" label="Query" name="query">
          <json-viewer :value="request.query" :max-height="240" />
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script>
import JsonViewer from '@/components/ui/JsonViewer.vue';

export default {
  name: 'RequestPreview',
  components: { JsonViewer },
  props: {
    request: { type: [Object, String], default: null },
    showHeaders: { type: Boolean, default: true },
  },
  data() {
    return { tab: 'body' };
  },
};
</script>

<style scoped>
.rp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  min-width: 0;
}

.rp-label {
  font-weight: 600;
  color: #1f2d3d;
  flex: none;
}

.rp-url {
  font-size: 12px;
  color: #409eff;
  min-width: 0;
}

.rp-empty {
  font-size: 12px;
  padding: 10px 0;
}

.rp-tabs ::v-deep .el-tabs__content {
  padding: 10px;
}
</style>
