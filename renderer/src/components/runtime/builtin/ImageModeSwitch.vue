<template>
  <div class="image-mode-switch">
    <span class="ims-label">{{ label }}</span>
    <el-radio-group :value="mode" size="mini" @input="setMode">
      <el-radio-button label="overwrite">覆盖（重新生成）</el-radio-button>
      <el-radio-button label="keep">保留（跳过已有图）</el-radio-button>
    </el-radio-group>
    <span class="text-muted ims-tip">{{ tip }}</span>
  </div>
</template>

<script>
import runtimeMixin from '../runtimeMixin';

/**
 * 图片步骤的「已有图片」处理方式：
 *  - overwrite：无论是否已有图都重新调用接口
 *  - keep：已有图的行直接复用，只为缺图的行调用接口（省钱省时间）
 */
export default {
  name: 'ImageModeSwitch',
  mixins: [runtimeMixin],
  props: {
    label: { type: String, default: '已有图片处理' },
    defaultMode: { type: String, default: 'overwrite' },
    configurable: { type: Boolean, default: true },
  },
  data() {
    return { mode: this.defaultMode === 'keep' ? 'keep' : 'overwrite' };
  },
  computed: {
    tip() {
      return this.mode === 'keep'
        ? '已有图片的行不调接口，只为缺图的行生成'
        : '已有图片的行也会重新生成（覆盖旧结果）';
    },
  },
  mounted() {
    this.publish();
  },
  methods: {
    publish() {
      if (!this.rt.setInput) return;
      this.rt.setInput('existing_image_mode', this.mode);
    },
    setMode(value) {
      if (!this.configurable) return;
      this.mode = value;
      this.publish();
    },
  },
};
</script>

<style scoped>
.image-mode-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ims-label {
  font-weight: 600;
  color: #1f2d3d;
  font-size: 13px;
}

.ims-tip {
  font-size: 11px;
}
</style>
