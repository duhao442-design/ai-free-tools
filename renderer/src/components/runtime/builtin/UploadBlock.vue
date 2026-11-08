<template>
  <div class="upload-block">
    <div class="ub-head">
      <span class="ub-label">{{ label }}</span>
      <span v-if="bindTo" class="text-muted">回填变量：{{ bindTo }}</span>
    </div>
    <div class="ub-body">
      <image-upload :label="label" :accept="accept" :sub-dir="subDir" @uploaded="onUploaded" />
      <div v-if="last" class="ub-result">
        <image-viewer v-if="isImage" :src="last.url" :size="72" />
        <div class="ub-meta">
          <div class="mono ellipsis">{{ last.url }}</div>
          <div class="text-muted">{{ formatSize(last.size) }}</div>
        </div>
        <el-button type="text" size="mini" @click="copyUrl">复制链接</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';
import ImageUpload from '@/components/ui/ImageUpload.vue';
import ImageViewer from '@/components/ui/ImageViewer.vue';
import { copyText } from '@/utils/format';

export default {
  name: 'UploadBlock',
  components: { ImageUpload, ImageViewer },
  mixins: [runtimeMixin],
  props: {
    label: { type: String, default: '上传文件' },
    accept: { type: String, default: 'image/*' },
    subDir: { type: String, default: 'uploads' },
    bindTo: { type: String, default: '' },
  },
  data() {
    return { last: null };
  },
  computed: {
    isImage() {
      return this.last && /^image\//.test(this.last.contentType || '') && this.last.url;
    },
  },
  methods: {
    onUploaded(file) {
      this.last = file;
      this.$emit('uploaded', file);
      if (this.bindTo && this.context.gb) this.$set(this.context.gb, this.bindTo, file.url);
    },
    copyUrl() {
      if (this.last) copyText(this.last.url).then(() => this.notify('已复制'));
    },
    formatSize(size) {
      if (!size) return '';
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    },
  },
};
</script>

<style scoped>
.ub-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ub-label {
  font-weight: 600;
  color: #1f2d3d;
}

.ub-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.ub-meta {
  font-size: 12px;
  min-width: 0;
}
</style>
