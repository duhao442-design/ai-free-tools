<template>
  <div class="aift-page page-designer" v-loading="loading">
    <div class="pd-head aift-card">
      <div class="pd-head-main">
        <el-input v-model="page.name" size="small" class="pd-name" @change="dirty = true" />
        <el-input v-model="page.description" size="small" placeholder="页面说明" class="pd-desc" @change="dirty = true" />
      </div>
      <div class="aift-toolbar">
        <span class="text-muted pd-count">{{ layout.length }} 个组件</span>
        <el-tooltip content="选择作品后，用真实上下文解析组件传参" placement="bottom">
          <el-select v-model="previewWorkId" size="small" clearable placeholder="预览用作品" style="width: 160px" @change="resolvePreview">
            <el-option v-for="w in works" :key="w.id" :label="w.name" :value="w.id" />
          </el-select>
        </el-tooltip>
        <el-button size="small" icon="el-icon-view" :loading="resolving" @click="resolvePreview">解析预览</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button size="small" @click="$router.push('/pages')">返回</el-button>
      </div>
    </div>

    <div class="designer-wrap">
      <div class="designer-palette">
        <component-palette :components="components" @pick="addComponent" />
      </div>

      <div class="designer-canvas">
        <div class="canvas-hint text-muted">
          画布为设计态：拖拽排序；点击组件在右侧配置传参。${...} 表达式在「解析预览」时用真实上下文展开。
        </div>
        <design-canvas
          :layout="layout"
          :components="components"
          :selected-id="selectedId"
          :resolved="resolved"
          :spec-map="specMap"
          @select="selectedId = $event"
          @remove="removeBlock"
          @duplicate="duplicateBlock"
          @move="moveBlock"
          @toggle-span="toggleSpan"
          @add="onAddFromCanvas"
          @reorder="onReorder"
        />
      </div>

      <div class="designer-inspector">
        <el-tabs v-model="inspectorTab" class="inspector-tabs">
          <el-tab-pane label="组件传参" name="props">
            <props-panel :block="selectedBlock" :meta="selectedMeta" @update="updateBlock" />
          </el-tab-pane>
          <el-tab-pane label="执行配置" name="execution">
            <div class="pd-exec-tip text-muted">
              页面的执行配置：这一页用哪个模型、哪个接口、提示词与输入输出。工作流只负责把页面按顺序拼起来。
            </div>
            <execution-config-form
              :value="execution"
              :models="models"
              :interfaces="interfaces"
              @input="onExecutionChange"
            />
          </el-tab-pane>
          <el-tab-pane label="上下文配置" name="context">
            <context-config-panel :value="contextConfig" @change="onContextChange" />
          </el-tab-pane>
          <el-tab-pane label="页面 JSON" name="json">
            <json-editor :value="pageJson" :rows="22" @change="onPageJsonChange" />
            <div class="text-muted pd-json-tip">可直接编辑整页 JSON（layout + context_config + execution）。</div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script>
import ComponentPalette from '@/components/design/ComponentPalette.vue';
import DesignCanvas from '@/components/design/DesignCanvas.vue';
import PropsPanel from '@/components/design/PropsPanel.vue';
import ContextConfigPanel from '@/components/design/ContextConfigPanel.vue';
import ExecutionConfigForm from '@/components/design/ExecutionConfigForm.vue';
import JsonEditor from '@/components/ui/JsonEditor.vue';
import { pageApi, componentApi, workApi, modelApi, interfaceApi } from '@/api';

const DEFAULT_CONTEXT = {
  providers: [
    { id: 'work', type: 'builtin', kind: 'work', enabled: true },
    { id: 'assets', type: 'builtin', kind: 'assets', enabled: true },
    { id: 'params', type: 'builtin', kind: 'params', enabled: true },
    { id: 'steps', type: 'builtin', kind: 'stepList', enabled: true },
  ],
  variableMapping: {},
};

const DEFAULT_EXECUTION = {
  model_id: null,
  interface_id: null,
  input_type: 'none',
  output_type: 'none',
  input_value: '',
  prompt: '',
  model_input_value: null,
  model_output_value: null,
  settings: {
    columns: [],
    maxRows: 0,
    rowOffset: 0,
    existing_image_mode: 'overwrite',
    row_key: '',
    image_ref: { from: '', matchField: 'role', nameField: 'name' },
  },
};

export default {
  name: 'PageDesigner',
  components: {
    ComponentPalette, DesignCanvas, PropsPanel, ContextConfigPanel, ExecutionConfigForm, JsonEditor,
  },
  data() {
    return {
      loading: false,
      saving: false,
      resolving: false,
      pageId: Number(this.$route.params.id),
      page: { id: null, name: '', description: '' },
      layout: [],
      contextConfig: JSON.parse(JSON.stringify(DEFAULT_CONTEXT)),
      execution: JSON.parse(JSON.stringify(DEFAULT_EXECUTION)),
      models: [],
      interfaces: [],
      components: [],
      selectedId: '',
      resolved: [],
      previewWorkId: null,
      works: [],
      inspectorTab: 'props',
      dirty: false,
    };
  },
  computed: {
    selectedBlock() {
      return this.layout.find((b) => b.id === this.selectedId) || null;
    },
    selectedMeta() {
      if (!this.selectedBlock) return null;
      return this.components.find((c) => c.key === this.selectedBlock.component) || null;
    },
    pageJson() {
      return {
        name: this.page.name,
        description: this.page.description,
        layout: this.layout,
        context_config: this.contextConfig,
        execution: this.execution,
      };
    },
    specMap() {
      const map = {};
      for (const c of this.components) {
        if (c.source === 'user' && c.render_spec) map[c.key] = c.render_spec;
      }
      return map;
    },
  },
  created() {
    const tab = this.$route.query && this.$route.query.tab;
    if (['props', 'execution', 'context', 'json'].includes(tab)) this.inspectorTab = tab;
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [page, comps, works, models, interfaces] = await Promise.all([
          pageApi.detail(this.pageId),
          componentApi.list(),
          workApi.page({ page_num: 1, page_size: 100 }),
          modelApi.all(),
          interfaceApi.all(),
        ]);
        this.page = { id: page.id, name: page.name, description: page.description };
        this.layout = page.layout || [];
        this.contextConfig = page.context_config || JSON.parse(JSON.stringify(DEFAULT_CONTEXT));
        this.execution = { ...JSON.parse(JSON.stringify(DEFAULT_EXECUTION)), ...(page.execution || {}) };
        this.components = comps.components || [];
        this.works = works.data || [];
        this.models = models || [];
        this.interfaces = interfaces || [];
        this.selectedId = this.layout.length ? this.layout[0].id : '';
      } finally {
        this.loading = false;
      }
    },
    /** 点击调色板「＋」或双击：把组件追加到画布（拖拽之外的无障碍入口） */
    addComponent(item) {
      this.insertComponent(item, this.layout.length);
    },
    onAddFromCanvas({ key, index }) {
      const item = this.components.find((c) => c.key === key);
      if (!item) return;
      this.insertComponent(item, index);
    },
    insertComponent(item, index) {
      const props = {};
      for (const p of item.props_schema || []) {
        props[p.name] = p.default !== undefined && p.default !== null && typeof p.default === 'object'
          ? JSON.parse(JSON.stringify(p.default))
          : p.default;
      }
      const block = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        component: item.key,
        props,
        span: 24,
      };
      const at = Math.min(Math.max(0, Number(index) || 0), this.layout.length);
      this.layout.splice(at, 0, block);
      this.selectedId = block.id;
      this.dirty = true;
    },
    onReorder({ from, to }) {
      if (from === to || from < 0 || from >= this.layout.length) return;
      const list = [...this.layout];
      const [moved] = list.splice(from, 1);
      list.splice(Math.min(Math.max(0, to), list.length), 0, moved);
      this.layout = list;
      this.dirty = true;
    },
    updateBlock({ id, patch }) {      const idx = this.layout.findIndex((b) => b.id === id);
      if (idx === -1) return;
      const next = { ...this.layout[idx], ...patch };
      this.$set(this.layout, idx, next);
      this.dirty = true;
      this.resolvePreview();
    },
    removeBlock(id) {
      this.layout = this.layout.filter((b) => b.id !== id);
      if (this.selectedId === id) this.selectedId = this.layout.length ? this.layout[0].id : '';
      this.dirty = true;
    },
    duplicateBlock(id) {
      const idx = this.layout.findIndex((b) => b.id === id);
      if (idx === -1) return;
      const src = this.layout[idx];
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      this.layout.splice(idx + 1, 0, copy);
      this.selectedId = copy.id;
      this.dirty = true;
    },
    moveBlock({ id, delta }) {
      const idx = this.layout.findIndex((b) => b.id === id);
      const j = idx + delta;
      if (idx === -1 || j < 0 || j >= this.layout.length) return;
      const list = [...this.layout];
      [list[idx], list[j]] = [list[j], list[idx]];
      this.layout = list;
      this.dirty = true;
    },
    toggleSpan(id) {
      const blk = this.layout.find((b) => b.id === id);
      if (!blk) return;
      blk.span = Number(blk.span) >= 24 ? 12 : 24;
      this.dirty = true;
    },
    onContextChange(cfg) {
      this.contextConfig = cfg;
      this.dirty = true;
    },
    onExecutionChange(execution) {
      this.execution = execution;
      this.dirty = true;
    },
    onPageJsonChange(value) {
      if (!value || typeof value !== 'object') return;
      if (value.name !== undefined) this.page.name = value.name;
      if (value.description !== undefined) this.page.description = value.description;
      if (Array.isArray(value.layout)) this.layout = value.layout;
      if (value.context_config) this.contextConfig = value.context_config;
      if (value.execution) this.execution = { ...JSON.parse(JSON.stringify(DEFAULT_EXECUTION)), ...value.execution };
      this.dirty = true;
    },
    async resolvePreview() {
      if (!this.previewWorkId) {
        this.resolved = [];
        return;
      }
      this.resolving = true;
      try {
        const data = await pageApi.resolve({
          page_id: this.pageId,
          work_id: this.previewWorkId,
          step: 1,
        });
        this.resolved = data.resolved || [];
      } catch (e) {
        this.resolved = [];
      } finally {
        this.resolving = false;
      }
    },
    async save() {
      this.saving = true;
      try {
        await pageApi.update(this.pageId, {
          name: this.page.name,
          description: this.page.description,
          layout: this.layout,
          context_config: this.contextConfig,
          execution: this.execution,
        });
        this.dirty = false;
        this.$message.success('页面已保存');
      } catch (e) {
        /* 拦截器已提示 */
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.page-designer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}

.pd-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.pd-name {
  width: 220px;
}

.pd-desc {
  width: 320px;
}

.pd-count {
  font-size: 12px;
}

.designer-wrap {
  display: flex;
  gap: 12px;
  min-height: 520px;
}

.designer-palette {
  width: 230px;
  flex: none;
  display: flex;
}

.designer-canvas {
  flex: 1;
  min-width: 0;
  background: #eef1f6;
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
  max-height: calc(100vh - 150px);
}

.canvas-hint {
  font-size: 12px;
  margin-bottom: 8px;
}

.designer-inspector {
  width: 420px;
  flex: none;
  background: #fff;
  border-radius: 8px;
  overflow: auto;
  max-height: calc(100vh - 150px);
}

.inspector-tabs ::v-deep .el-tabs__header {
  margin-bottom: 8px;
  padding: 0 12px;
}

.inspector-tabs ::v-deep .el-tabs__content {
  padding: 0 4px 10px;
}

.pd-json-tip {
  font-size: 12px;
  margin-top: 6px;
}

.pd-exec-tip {
  font-size: 12px;
  line-height: 1.7;
  margin: 4px 12px 10px;
  padding: 8px 10px;
  background: #f7f8fa;
  border-radius: 6px;
}

/* 窄窗口：右栏折到画布下方，保证三栏都能用 */
@media (max-width: 1360px) {
  .designer-wrap {
    flex-wrap: wrap;
    height: auto;
  }

  .designer-palette {
    width: 100%;
    max-height: 220px;
  }

  .designer-canvas {
    flex: 1 1 100%;
    min-width: 100%;
    max-height: none;
  }

  .designer-inspector {
    width: 100%;
    max-height: none;
  }
}
</style>
