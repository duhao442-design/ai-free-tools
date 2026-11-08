<template>
  <div class="aift-page settings" v-loading="loading">
    <div class="aift-card st-block">
      <div class="st-title">存储配置（项目级）</div>
      <div class="st-desc text-muted">
        接口输出中的文件（file / url / base64）会统一转存到这里的存储，并以本地链接形式返回；后续步骤按需再转成 url / base64 / file。
      </div>

      <el-radio-group v-model="config.type" size="small" class="st-types">
        <el-radio-button v-for="t in types" :key="t.value" :label="t.value">{{ t.label }}</el-radio-button>
      </el-radio-group>
      <div class="text-muted st-type-desc">{{ currentTypeDesc }}</div>

      <el-form v-if="config.type === 'local'" label-width="130px" size="small" class="st-form">
        <el-form-item label="存储目录">
          <el-input v-model="config.local.dir" placeholder="留空则使用应用数据目录/files" />
        </el-form-item>
        <el-form-item label="访问前缀">
          <el-input v-model="config.local.baseUrl" placeholder="留空则使用本地服务地址" />
        </el-form-item>
      </el-form>

      <el-form v-else-if="config.type === 'minio'" label-width="130px" size="small" class="st-form">
        <el-form-item label="Endpoint">
          <el-input v-model="config.minio.endpoint" placeholder="http://127.0.0.1:9000" />
        </el-form-item>
        <el-form-item label="Region">
          <el-input v-model="config.minio.region" placeholder="us-east-1" />
        </el-form-item>
        <el-form-item label="Bucket">
          <el-input v-model="config.minio.bucket" />
        </el-form-item>
        <el-form-item label="AccessKey">
          <el-input v-model="config.minio.accessKey" />
        </el-form-item>
        <el-form-item label="SecretKey">
          <el-input v-model="config.minio.secretKey" show-password />
        </el-form-item>
        <el-form-item label="访问域名">
          <el-input v-model="config.minio.publicBase" placeholder="https://cdn.example.com/aift" />
        </el-form-item>
      </el-form>

      <el-form v-else label-width="130px" size="small" class="st-form">
        <el-form-item label="AccessKey">
          <el-input v-model="config.qiniu.accessKey" />
        </el-form-item>
        <el-form-item label="SecretKey">
          <el-input v-model="config.qiniu.secretKey" show-password />
        </el-form-item>
        <el-form-item label="Bucket">
          <el-input v-model="config.qiniu.bucket" />
        </el-form-item>
        <el-form-item label="绑定域名">
          <el-input v-model="config.qiniu.publicBase" placeholder="https://cdn.example.com" />
        </el-form-item>
        <el-form-item label="上传域名">
          <el-input v-model="config.qiniu.uploadHost" placeholder="https://up.qiniup.com" />
        </el-form-item>
      </el-form>

      <div class="aift-toolbar">
        <el-button size="small" :loading="testing" @click="testStorage">测试连接</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveStorage">保存存储配置</el-button>
      </div>
      <div v-if="testResult" class="st-test">
        <el-alert
          :type="testResult.ok ? 'success' : 'error'"
          :title="testResult.ok ? `连接成功：${testResult.saved ? testResult.saved.url : ''}` : testResult.message"
          :closable="false"
          show-icon
        />
      </div>
    </div>

    <div class="aift-card st-block">
      <div class="st-title">运行信息</div>
      <el-descriptions :column="2" size="small" border>
        <el-descriptions-item label="本地服务">{{ apiBase || '未连接（浏览器调试模式）' }}</el-descriptions-item>
        <el-descriptions-item label="平台">{{ platform }}</el-descriptions-item>
        <el-descriptions-item label="Electron">{{ versions.electron || '-' }}</el-descriptions-item>
        <el-descriptions-item label="Node">{{ versions.node || '-' }}</el-descriptions-item>
        <el-descriptions-item label="数据目录" :span="2">
          <span class="mono">{{ dataDir || '-' }}</span>
          <el-button v-if="dataDir" type="text" size="mini" @click="openDataDir">打开</el-button>
        </el-descriptions-item>
      </el-descriptions>
      <div class="text-muted st-note">
        数据与上传文件都保存在本地数据目录，应用退出后不会丢失；数据库是单文件 SQLite（ai-free-tools.db）。
      </div>
    </div>
  </div>
</template>

<script>
import { settingApi, apiBase } from '@/api';

const DEFAULT_CONFIG = () => ({
  type: 'local',
  local: { dir: '', baseUrl: '' },
  minio: { endpoint: 'http://127.0.0.1:9000', region: 'us-east-1', bucket: 'aift', accessKey: '', secretKey: '', publicBase: '' },
  qiniu: { accessKey: '', secretKey: '', bucket: '', publicBase: '', uploadHost: 'https://up.qiniup.com' },
});

export default {
  name: 'SettingsView',
  data() {
    return {
      loading: false,
      saving: false,
      testing: false,
      config: DEFAULT_CONFIG(),
      types: [],
      testResult: null,
      apiBase,
      platform: (window.aift && window.aift.platform) || 'browser',
      versions: (window.aift && window.aift.versions) || {},
      dataDir: '',
    };
  },
  computed: {
    currentTypeDesc() {
      const hit = this.types.find((t) => t.value === this.config.type);
      return hit ? hit.description : '';
    },
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await settingApi.storage();
        this.config = { ...DEFAULT_CONFIG(), ...data.config };
        this.types = data.types || [];
        if (window.aift && window.aift.dataDir) this.dataDir = await window.aift.dataDir();
      } finally {
        this.loading = false;
      }
    },
    async saveStorage() {
      this.saving = true;
      try {
        await settingApi.saveStorage(this.config);
        this.$message.success('存储配置已保存');
      } catch (e) {
        /* ignore */
      } finally {
        this.saving = false;
      }
    },
    async testStorage() {
      this.testing = true;
      this.testResult = null;
      try {
        this.testResult = await settingApi.testStorage(this.config);
        if (this.testResult.ok) this.$message.success('存储连接正常');
      } catch (e) {
        this.testResult = { ok: false, message: e.message };
      } finally {
        this.testing = false;
      }
    },
    openDataDir() {
      if (window.aift && window.aift.showItemInFolder) window.aift.showItemInFolder(this.dataDir);
    },
  },
};
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 980px;
}

.st-block {
  padding: 16px 18px;
}

.st-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.st-desc {
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.7;
}

.st-types {
  margin-top: 12px;
}

.st-type-desc {
  font-size: 12px;
  margin: 6px 0 10px;
}

.st-form {
  max-width: 640px;
}

.st-test {
  margin-top: 10px;
}

.st-note {
  font-size: 12px;
  margin-top: 10px;
  line-height: 1.7;
}
</style>
