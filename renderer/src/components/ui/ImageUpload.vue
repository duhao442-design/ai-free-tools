<template>
  <div class="image-upload">
    <el-button :loading="uploading" size="mini" @click="pick">
      <i class="el-icon-upload2" /> {{ label }}
    </el-button>
    <span v-if="tip" class="text-muted tip">{{ tip }}</span>
    <input ref="input" type="file" :accept="accept" :multiple="multiple" hidden @change="onChange" />
  </div>
</template>

<script>
import { fileApi, fileToBase64 } from '@/api';

export default {
  name: 'ImageUpload',
  props: {
    label: { type: String, default: '上传文件' },
    accept: { type: String, default: 'image/*' },
    multiple: { type: Boolean, default: false },
    subDir: { type: String, default: 'uploads' },
    tip: { type: String, default: '' },
  },
  data() {
    return { uploading: false };
  },
  methods: {
    pick() {
      this.$refs.input.click();
    },
    async onChange(e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      this.uploading = true;
      const results = [];
      try {
        for (const file of files) {
          const content_base64 = await fileToBase64(file);
          const saved = await fileApi.upload({
            filename: file.name,
            content_base64,
            sub_dir: this.subDir,
          });
          results.push({ ...saved, name: file.name });
        }
        this.$emit('uploaded', this.multiple ? results : results[0]);
        this.$message.success('上传成功');
      } catch (err) {
        /* 拦截器已提示 */
      } finally {
        this.uploading = false;
      }
    },
  },
};
</script>

<style scoped>
.image-upload {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tip {
  font-size: 12px;
}
</style>
