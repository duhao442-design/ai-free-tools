<template>
  <div class="image-viewer" :style="{ width: size + 'px', height: size + 'px' }">
    <el-image
      v-if="src"
      :src="normalized"
      fit="cover"
      class="img"
      :preview-src-list="[normalized]"
      @click.native="handleClick"
    >
      <div slot="error" class="img-error"><i class="el-icon-picture-outline" /></div>
    </el-image>
    <div v-else class="img-empty" @click="$emit('pick')">
      <i class="el-icon-plus" />
      <span>选择图片</span>
    </div>
    <div v-if="allowUpdate" class="img-mask" @click="$emit('pick')">
      <i class="el-icon-upload2" /> 替换
    </div>
  </div>
</template>

<script>
export default {
  name: 'ImageViewer',
  props: {
    src: { type: String, default: '' },
    size: { type: Number, default: 96 },
    allowUpdate: { type: Boolean, default: false },
  },
  computed: {
    normalized() {
      if (!this.src) return '';
      const s = String(this.src);
      if (/^(https?:|data:|file:|blob:)/i.test(s)) return s;
      if (s.startsWith('/files/')) {
        const base = (window.aift && window.aift.apiBase) || '';
        return `${base}${s}`;
      }
      return s;
    },
  },
  methods: {
    handleClick() {
      this.$emit('click', this.src);
    },
  },
};
</script>

<style scoped>
.image-viewer {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  flex: none;
}

.img {
  width: 100%;
  height: 100%;
  display: block;
}

.img-error,
.img-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #b1b6bf;
  font-size: 12px;
  gap: 4px;
  cursor: pointer;
}

.img-empty i {
  font-size: 18px;
}

.img-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}

.image-viewer:hover .img-mask {
  display: flex;
}
</style>
