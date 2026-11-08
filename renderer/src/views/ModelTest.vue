<template>
  <div class="aift-page model-test" v-loading="loading">
    <div class="aift-card mt-head">
      <div>
        <div class="mt-title">{{ model.name || '模型测试' }}</div>
        <div class="mt-meta text-muted">
          <span>{{ model.model_name }}</span>
          <span>{{ model.base_url }}</span>
          <span class="format-chip">{{ model.format_type || '未指定格式' }}</span>
        </div>
      </div>
      <div class="aift-toolbar">
        <el-button size="small" @click="$router.push('/models')">返回列表</el-button>
      </div>
    </div>

    <div class="mt-body">
      <div class="aift-card mt-form">
        <el-tabs v-model="mode">
          <el-tab-pane label="文本测试" name="text">
            <el-form label-position="top" size="small">
              <el-form-item label="System Prompt">
                <el-input v-model="textForm.system_prompt" type="textarea" :rows="3" placeholder="可选" />
              </el-form-item>
              <el-form-item label="Prompt">
                <el-input v-model="textForm.prompt" type="textarea" :rows="8" />
              </el-form-item>
              <el-row :gutter="10">
                <el-col :span="12">
                  <el-form-item label="max_tokens">
                    <el-input-number v-model="textForm.max_tokens" :min="1" :max="32768" :step="256" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="temperature">
                    <el-slider v-model="textForm.temperature" :min="0" :max="2" :step="0.1" show-input />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-button type="primary" size="small" :loading="running" @click="runText">发送文本测试</el-button>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="图像测试" name="image">
            <el-form label-position="top" size="small">
              <el-form-item label="Prompt">
                <el-input v-model="imageForm.prompt" type="textarea" :rows="5" />
              </el-form-item>
              <el-row :gutter="10">
                <el-col :span="8">
                  <el-form-item label="size">
                    <el-select v-model="imageForm.size" style="width: 100%">
                      <el-option v-for="s in sizes" :key="s" :label="s" :value="s" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="n">
                    <el-input-number v-model="imageForm.n" :min="1" :max="4" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="quality">
                    <el-select v-model="imageForm.quality" clearable style="width: 100%">
                      <el-option label="standard" value="standard" />
                      <el-option label="hd" value="hd" />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-button type="primary" size="small" :loading="running" @click="runImage">发送图像测试</el-button>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </div>

      <div class="aift-card mt-result">
        <div class="mt-result-head">
          <span class="mt-result-title">测试结果</span>
          <span v-if="result" class="text-muted">
            {{ result.success ? '成功' : '失败' }} · {{ result.elapsed }} ms
          </span>
        </div>
        <el-alert
          v-if="result && !result.success"
          type="error"
          :title="result.message"
          :closable="false"
          show-icon
        />
        <div v-if="result && result.success" class="mt-images">
          <el-image
            v-for="(img, i) in resultImages"
            :key="i"
            :src="img"
            :preview-src-list="resultImages"
            fit="cover"
            class="mt-image"
          />
        </div>
        <pre v-if="result && result.response" class="mt-text">{{ result.response }}</pre>
        <pre v-if="result && result.raw_text" class="mt-raw">{{ result.raw_text }}</pre>
        <div v-if="!result" class="text-muted mt-empty">还没有测试结果</div>
      </div>
    </div>
  </div>
</template>

<script>
import { modelApi } from '@/api';

export default {
  name: 'ModelTest',
  data() {
    return {
      loading: false,
      running: false,
      modelId: Number(this.$route.params.id),
      model: {},
      mode: 'text',
      textForm: {
        system_prompt: '',
        prompt: '你好，请用一句话介绍你自己。',
        max_tokens: 1024,
        temperature: 0.7,
      },
      imageForm: {
        prompt: '一只坐在云端的橘猫，扁平插画风格',
        size: '1024x1024',
        n: 1,
        quality: '',
      },
      sizes: ['1024x1024', '1792x1024', '1024x1792', '512x512'],
      result: null,
    };
  },
  computed: {
    resultImages() {
      if (!this.result) return [];
      if (Array.isArray(this.result.images) && this.result.images.length) return this.result.images;
      return [];
    },
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        this.model = await modelApi.detail(this.modelId);
        if (this.model.model_type === 'image' || this.model.format_type === 'openai_image') this.mode = 'image';
      } finally {
        this.loading = false;
      }
    },
    async runText() {
      this.running = true;
      this.result = null;
      try {
        this.result = await modelApi.testChat(this.modelId, this.textForm);
      } catch (e) {
        this.result = { success: false, message: e.message, response: '', raw_text: '' };
      } finally {
        this.running = false;
      }
    },
    async runImage() {
      this.running = true;
      this.result = null;
      try {
        this.result = await modelApi.testImage(this.modelId, this.imageForm);
      } catch (e) {
        this.result = { success: false, message: e.message, response: '', raw_text: '' };
      } finally {
        this.running = false;
      }
    },
  },
};
</script>

<style scoped>
.model-test {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
}

.mt-title {
  font-size: 16px;
  font-weight: 600;
}

.mt-meta {
  margin-top: 4px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  flex-wrap: wrap;
}

.mt-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.mt-form {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
}

.mt-result {
  width: 46%;
  flex: none;
  padding: 12px 16px;
  min-height: 320px;
}

.mt-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.mt-result-title {
  font-weight: 600;
}

.mt-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.mt-image {
  width: 160px;
  height: 160px;
  border-radius: 6px;
}

.mt-text,
.mt-raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.7;
  padding: 8px 10px;
  border-radius: 6px;
  max-height: 280px;
  overflow: auto;
}

.mt-text {
  background: #f7f8fa;
}

.mt-raw {
  background: #1e2430;
  color: #d6e2f0;
  margin-top: 8px;
}

.mt-empty {
  font-size: 12px;
  padding: 20px 0;
}
</style>
