<template>
  <div class="context-config">
    <div class="cc-desc text-muted">
      页面加载时，后端按下列数据源构建「全局上下文」，组件里用
      <code>${gb.xxx}</code> / <code>${stepList[0].rsp.xxx}</code> 取值。
    </div>

    <el-divider content-position="left">内置数据源</el-divider>
    <div class="cc-builtins">
      <div v-for="b in builtinDefs" :key="b.kind" class="cc-builtin">
        <el-switch :value="isEnabled(b.kind)" size="mini" @change="(v) => toggleBuiltin(b.kind, v)" />
        <div class="cc-builtin-text">
          <div class="cc-builtin-name">{{ b.label }}</div>
          <div class="text-muted cc-builtin-desc">{{ b.desc }}</div>
        </div>
      </div>
    </div>

    <el-divider content-position="left">HTTP 数据源</el-divider>
    <div v-for="(p, i) in httpProviders" :key="p._key" class="cc-http">
      <div class="cc-http-head">
        <span class="mono">{{ p.id || 'provider' }}</span>
        <el-button type="text" size="mini" @click="removeHttp(i)">删除</el-button>
      </div>
      <json-editor :value="stripPrivate(p)" :rows="8" @change="(v) => updateHttp(i, v)" />
    </div>
    <el-button size="mini" icon="el-icon-plus" @click="addHttp">添加 HTTP 数据源</el-button>

    <el-divider content-position="left">变量别名（variable_mapping）</el-divider>
    <json-editor :value="variableMapping" :rows="4" placeholder='{"content":"作品内容"}' @change="onMappingChange" />
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';

const BUILTIN_DEFS = [
  { kind: 'work', label: '作品信息', desc: '注入 gb 作品字段与 gb.work' },
  { kind: 'assets', label: '资产（预设变量）', desc: '把资产 key 平铺进 gb' },
  { kind: 'params', label: '作品参数', desc: '把作品 params 平铺进 gb' },
  { kind: 'stepList', label: '前置步骤产出', desc: '已完成步骤的 req/rsp，注入 stepList' },
  { kind: 'artifacts', label: '产物清单', desc: '该作品的图片/文件产物' },
];

export default {
  name: 'ContextConfigPanel',
  components: { JsonEditor },
  props: {
    value: { type: Object, default: () => ({ providers: [], variableMapping: {} }) },
  },
  data() {
    return { builtinDefs: BUILTIN_DEFS };
  },
  computed: {
    providers() {
      return (this.value && this.value.providers) || [];
    },
    builtinMap() {
      const map = {};
      for (const p of this.providers) {
        if (p.type === 'builtin') map[p.kind] = p;
      }
      return map;
    },
    httpProviders() {
      return this.providers
        .filter((p) => p.type === 'http')
        .map((p, i) => ({ ...p, _key: `${p.id || 'http'}-${i}` }));
    },
    variableMapping() {
      return (this.value && this.value.variableMapping) || {};
    },
  },
  methods: {
    isEnabled(kind) {
      const hit = this.builtinMap[kind];
      return hit ? hit.enabled !== false : false;
    },
    toggleBuiltin(kind, enabled) {
      const providers = this.providers.map((p) => {
        if (p.type === 'builtin' && p.kind === kind) return { ...p, enabled };
        return p;
      });
      const exists = providers.some((p) => p.type === 'builtin' && p.kind === kind);
      if (!exists) providers.push({ id: kind, type: 'builtin', kind, enabled });
      this.emit({ providers });
    },
    stripPrivate(p) {
      const { _key, ...rest } = p;
      return rest;
    },
    updateHttp(index, provider) {
      const httpList = this.providers.filter((p) => p.type === 'http');
      const target = httpList[index];
      if (!target) return;
      const next = this.providers.map((p) => (p === target ? provider : p));
      this.emit({ providers: next });
    },
    removeHttp(index) {
      const httpList = this.providers.filter((p) => p.type === 'http');
      const target = httpList[index];
      const next = this.providers.filter((p) => p !== target);
      this.emit({ providers: next });
    },
    addHttp() {
      const providers = [
        ...this.providers,
        {
          id: `http_${this.providers.filter((p) => p.type === 'http').length + 1}`,
          type: 'http',
          enabled: true,
          request: { method: 'GET', url: 'https://example.com/api', headers: {}, query: {}, body: null },
          extract: { data: '${resp.data}' },
        },
      ];
      this.emit({ providers });
    },
    onMappingChange(v) {
      this.emit({ variableMapping: v || {} });
    },
    emit(patch) {
      this.$emit('change', { ...this.value, ...patch });
    },
  },
};
</script>

<style scoped>
.context-config {
  font-size: 12px;
}

.cc-desc {
  line-height: 1.7;
  margin-bottom: 4px;
}

.cc-desc code {
  background: #f0f2f5;
  padding: 0 4px;
  border-radius: 3px;
}

.cc-builtins {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-builtin {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.cc-builtin-name {
  font-size: 12px;
  color: #303133;
}

.cc-builtin-desc {
  font-size: 11px;
}

.cc-http {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
}

.cc-http-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}
</style>
