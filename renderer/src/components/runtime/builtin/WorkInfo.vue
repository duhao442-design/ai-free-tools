<template>
  <div class="work-info">
    <el-descriptions :column="2" size="small" border>
      <el-descriptions-item v-for="f in fields" :key="f" :label="labels[f] || f" :span="f === 'content' || f === 'remark' ? 2 : 1">
        <template v-if="f === 'status'">
          <el-tag :type="statusType" size="mini">{{ statusLabel }}</el-tag>
        </template>
        <template v-else-if="f === 'content'">
          <div class="content-preview" :style="{ maxHeight: (contentRows || 4) * 22 + 'px' }">{{ value(f) }}</div>
        </template>
        <template v-else-if="f === 'source_url' && value(f)">
          <a :href="value(f)" target="_blank" class="link">{{ value(f) }}</a>
        </template>
        <template v-else-if="f === 'type'">
          <el-tag size="mini">{{ typeLabel }}</el-tag>
        </template>
        <template v-else>{{ value(f) || '-' }}</template>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import { WORK_STATUS, WORK_TYPES, labelOf, typeOf } from '@/utils/constants';

export default {
  name: 'WorkInfo',
  mixins: [runtimeMixin],
  props: {
    fields: { type: Array, default: () => ['name', 'type', 'status', 'keywords', 'source_url', 'content'] },
    contentRows: { type: Number, default: 4 },
  },
  data() {
    return {
      labels: {
        name: '作品名称',
        type: '作品类型',
        status: '状态',
        keywords: '关键词',
        source_url: '原文链接',
        content: '作品内容',
        remark: '备注',
      },
    };
  },
  computed: {
    work() {
      return this.rt.work || this.gb.work || {};
    },
    statusLabel() {
      return labelOf(WORK_STATUS, this.work.status || this.gb.status);
    },
    statusType() {
      return typeOf(WORK_STATUS, this.work.status || this.gb.status);
    },
    typeLabel() {
      return labelOf(WORK_TYPES, this.work.type || this.gb.type);
    },
  },
  methods: {
    value(field) {
      const w = this.work || {};
      const v = w[field] !== undefined && w[field] !== null ? w[field] : this.gb[field];
      if (v === null || v === undefined) return '';
      return String(v);
    },
  },
};
</script>

<style scoped>
.content-preview {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  line-height: 22px;
  color: #606266;
}

.link {
  color: #409eff;
  word-break: break-all;
}
</style>
