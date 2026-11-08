<template>
  <div class="aift-page iface-page">
    <div class="iface-top aift-card">
      <div>
        <div class="aift-page-title">接口管理</div>
        <div class="aift-page-desc">
          参照 Apifox 的两栏布局：左侧接口列表、右侧参数表；每个参数在类型后可声明文件类型，输入按实际值动态转换，输出统一转存到项目存储。
        </div>
      </div>
      <div class="aift-toolbar">
        <el-button type="primary" size="small" icon="el-icon-plus" @click="openCreate">新建接口</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="loadList">刷新</el-button>
      </div>
    </div>

    <div class="iface-body">
      <!-- 左：接口列表 -->
      <div class="iface-list aift-card">
        <div class="iface-list-head">
          <el-input v-model="keyword" size="small" placeholder="搜索接口名称" prefix-icon="el-icon-search" clearable />
        </div>
        <div class="iface-list-body" v-loading="listLoading">
          <div
            v-for="item in filteredList"
            :key="item.id"
            class="iface-item"
            :class="{ active: current && current.id === item.id }"
            @click="select(item)"
          >
            <div class="ii-name ellipsis">{{ item.name }}</div>
            <div class="ii-meta">
              <span class="format-chip">{{ item.format_type || '未指定格式' }}</span>
              <span class="text-muted">入 {{ countOf(item).input }} · 出 {{ countOf(item).output }}</span>
            </div>
          </div>
          <div v-if="!filteredList.length && !listLoading" class="text-muted iface-empty">暂无接口</div>
        </div>
      </div>

      <!-- 右：接口详情 -->
      <div class="iface-detail aift-card">
        <div v-if="!current" class="text-muted detail-empty">
          <i class="el-icon-connection" />
          <div>选择左侧接口，或新建一个接口</div>
        </div>
        <template v-else>
          <div class="detail-head">
            <div class="detail-head-main">
              <el-input v-model="form.name" size="small" class="detail-name" placeholder="接口名称" />
              <el-select v-model="form.format_type" size="small" style="width: 220px" clearable placeholder="端点格式">
                <el-option v-for="p in presets" :key="p.key" :label="p.label" :value="p.key" />
              </el-select>
              <el-switch v-model="form.is_active" active-text="启用" />
            </div>
            <div class="aift-toolbar">
              <el-button size="small" @click="applyPreset">套用格式预设</el-button>
              <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
              <el-button size="small" class="text-danger" @click="removeCurrent">删除</el-button>
            </div>
          </div>
          <el-input
            v-model="form.description"
            size="small"
            class="detail-desc"
            placeholder="接口说明"
          />

          <el-tabs v-model="tab" class="detail-tabs">
            <el-tab-pane label="输入参数" name="input">
              <div class="param-toolbar">
                <el-button size="mini" icon="el-icon-plus" @click="addParam('input')">添加输入参数</el-button>
                <span class="text-muted param-tip">
                  文件类型：输入时会探测实际值（file/url/base64），再转换成这里声明的类型。
                </span>
              </div>
              <el-table
                :data="inputParams"
                row-key="__key"
                :tree-props="{ children: 'children' }"
                default-expand-all
                size="mini"
                border
                class="param-table"
                :max-height="tableHeight"
              >
                <el-table-column label="参数名" width="200">
                  <template slot-scope="{ row }">
                    <el-input v-model="row.param_name" size="mini" placeholder="参数名" />
                  </template>
                </el-table-column>
                <el-table-column label="参数值 / 取值" min-width="300">
                  <template slot-scope="{ row }">
                    <div class="pv-cell">
                      <el-select v-model="row._kind" size="mini" style="width: 92px">
                        <el-option label="变量" value="variable" />
                        <el-option label="常量" value="constant" />
                      </el-select>
                      <el-input
                        v-model="row._expr"
                        size="mini"
                        class="mono"
                        :placeholder="row._kind === 'constant' ? '常量值' : '${gb.prompt}'"
                      />
                    </div>
                    <div v-if="isContainer(row)" class="pv-hint text-muted">
                      容器参数：整值覆盖可填 ${...}，否则用子变量构造结构
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="112">
                  <template slot-scope="{ row }">
                    <el-select v-model="row.value_type" size="mini" @change="onTypeChange(row)">
                      <el-option v-for="t in valueTypes" :key="t.value" :label="t.label" :value="t.value" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="文件类型" width="120">
                  <template slot-scope="{ row }">
                    <el-select v-model="row.file_type" size="mini" class="file-type-select">
                      <el-option v-for="f in fileTypes" :key="f.value" :label="f.label" :value="f.value" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="说明" min-width="160">
                  <template slot-scope="{ row }">
                    <el-input v-model="row.description" size="mini" placeholder="说明" />
                  </template>
                </el-table-column>
                <el-table-column label="必填" width="64" align="center">
                  <template slot-scope="{ row }">
                    <el-checkbox
                      :value="row.validate_rule === 'required'"
                      @change="(v) => setRequired(row, v)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="132" align="center">
                  <template slot-scope="{ row }">
                    <el-button
                      v-if="isContainer(row)"
                      type="text"
                      size="mini"
                      @click="addChild(row)"
                    >子变量</el-button>
                    <el-button type="text" size="mini" class="text-danger" @click="deleteParam(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="输出参数" name="output">
              <div class="param-toolbar">
                <el-button size="mini" icon="el-icon-plus" @click="addParam('output')">添加输出参数</el-button>
                <span class="text-muted param-tip">
                  取值填响应路径 <span class="mono">${resp.data[0].url}</span>；声明了文件类型的输出会统一转存到项目存储并返回本地链接。
                </span>
              </div>
              <el-table
                :data="outputParams"
                row-key="__key"
                :tree-props="{ children: 'children' }"
                default-expand-all
                size="mini"
                border
                class="param-table"
                :max-height="tableHeight"
              >
                <el-table-column label="参数名" width="200">
                  <template slot-scope="{ row }">
                    <el-input v-model="row.param_name" size="mini" placeholder="输出变量名" />
                  </template>
                </el-table-column>
                <el-table-column label="响应路径" min-width="300">
                  <template slot-scope="{ row }">
                    <el-input
                      v-model="row._expr"
                      size="mini"
                      class="mono"
                      placeholder="${resp.choices[0].message.content}"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="112">
                  <template slot-scope="{ row }">
                    <el-select v-model="row.value_type" size="mini" @change="onTypeChange(row)">
                      <el-option v-for="t in valueTypes" :key="t.value" :label="t.label" :value="t.value" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="文件类型" width="120">
                  <template slot-scope="{ row }">
                    <el-select v-model="row.file_type" size="mini" class="file-type-select">
                      <el-option v-for="f in fileTypes" :key="f.value" :label="f.label" :value="f.value" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="说明" min-width="160">
                  <template slot-scope="{ row }">
                    <el-input v-model="row.description" size="mini" placeholder="说明" />
                  </template>
                </el-table-column>
                <el-table-column label="必填" width="64" align="center">
                  <template slot-scope="{ row }">
                    <el-checkbox
                      :value="row.validate_rule === 'required'"
                      @change="(v) => setRequired(row, v)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="132" align="center">
                  <template slot-scope="{ row }">
                    <el-button
                      v-if="isContainer(row)"
                      type="text"
                      size="mini"
                      @click="addChild(row)"
                    >子变量</el-button>
                    <el-button type="text" size="mini" class="text-danger" @click="deleteParam(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="调试" name="debug">
              <el-form label-width="100px" size="mini" class="debug-form">
                <el-form-item label="调试模型">
                  <el-select v-model="debugModelId" clearable placeholder="选择模型（真实调试必选）" style="width: 320px">
                    <el-option v-for="m in models" :key="m.id" :label="`${m.name}（${m.model_name}）`" :value="m.id" />
                  </el-select>
                </el-form-item>
                <el-form-item label="示例上下文">
                  <json-editor v-model="debugContext" :rows="8" placeholder='{"prompt":"画一只猫"}' />
                </el-form-item>
                <el-form-item>
                  <el-button size="mini" :loading="previewing" @click="previewRequest">预览报文</el-button>
                  <el-button size="mini" type="primary" :loading="debugging" @click="runDebug">真实调试</el-button>
                </el-form-item>
              </el-form>

              <div v-if="previewResult" class="debug-block">
                <div class="debug-title">解析后的报文</div>
                <json-viewer :value="previewResult.payload" :max-height="220" />
                <div v-if="previewResult.request" class="debug-title">请求</div>
                <json-viewer v-if="previewResult.request" :value="previewResult.request" :max-height="220" />
                <div v-if="previewResult.errors && previewResult.errors.length" class="debug-errors">
                  <el-alert v-for="(e, i) in previewResult.errors" :key="i" :title="e" type="warning" :closable="false" show-icon />
                </div>
              </div>

              <div v-if="debugResult" class="debug-block">
                <div class="debug-title">
                  调试结果
                  <el-tag size="mini" :type="debugResult.success ? 'success' : 'danger'">
                    {{ debugResult.success ? '成功' : '失败' }} · {{ debugResult.elapsed }} ms
                  </el-tag>
                </div>
                <el-alert v-if="!debugResult.success" :title="debugResult.message" type="error" :closable="false" show-icon />
                <pre v-if="debugResult.response" class="debug-text">{{ debugResult.response }}</pre>
                <div v-if="debugResult.images && debugResult.images.length" class="debug-images">
                  <el-image v-for="(img, i) in debugResult.images" :key="i" :src="img" fit="cover" class="debug-image" :preview-src-list="debugResult.images" />
                </div>
                <pre v-if="debugResult.raw_text" class="debug-raw">{{ debugResult.raw_text }}</pre>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </div>
    </div>

    <el-dialog :visible.sync="createVisible" title="新建接口" width="520px">
      <el-form label-width="88px" size="small">
        <el-form-item label="接口名称">
          <el-input v-model="createForm.name" placeholder="例如：OpenAI 对话补全" />
        </el-form-item>
        <el-form-item label="端点格式">
          <el-select v-model="createForm.format_type" style="width: 100%" @change="onCreateFormat">
            <el-option v-for="p in presets" :key="p.key" :label="p.label" :value="p.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="自动填充">
          <el-checkbox v-model="createForm.fillPreset">按格式填入输入/输出参数模板</el-checkbox>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="createVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="createInterface">创建</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';
import JsonViewer from '@/components/ui/JsonViewer.vue';
import { interfaceApi, modelApi } from '@/api';
import { VALUE_TYPES, FILE_TYPES } from '@/utils/constants';
import {
  normalizeParams, serializeParams, newParam, removeParam, findParam,
  countParams, validateParams, isContainerType, paramsFromPreset,
} from '@/utils/paramTree';

export default {
  name: 'InterfacesView',
  components: { JsonEditor, JsonViewer },
  data() {
    return {
      listLoading: false,
      saving: false,
      previewing: false,
      debugging: false,
      keyword: '',
      rows: [],
      presets: [],
      models: [],
      current: null,
      form: { id: null, name: '', description: '', format_type: '', is_active: true },
      params: [],
      tab: 'input',
      valueTypes: VALUE_TYPES,
      fileTypes: FILE_TYPES,
      createVisible: false,
      createForm: { name: '', description: '', format_type: 'openai_chat', fillPreset: true },
      debugModelId: null,
      debugContext: { prompt: '请回复“连接成功”' },
      previewResult: null,
      debugResult: null,
      tableHeight: Math.max(320, window.innerHeight - 340),
    };
  },
  computed: {
    filteredList() {
      const kw = this.keyword.trim().toLowerCase();
      if (!kw) return this.rows;
      return this.rows.filter((it) => it.name.toLowerCase().includes(kw));
    },
    inputParams() {
      return this.params.filter((p) => (p.param_type || 'input') === 'input');
    },
    outputParams() {
      return this.params.filter((p) => (p.param_type || 'input') === 'output');
    },
  },
  created() {
    this.loadList();
    this.loadPresets();
    this.loadModels();
  },
  methods: {
    countOf(item) {
      return countParams(item.params || []);
    },
    isContainer(row) {
      return isContainerType(row.value_type);
    },
    async loadList() {
      this.listLoading = true;
      try {
        const res = await interfaceApi.page({ page_num: 1, page_size: 200 });
        this.rows = res.data || [];
        if (!this.current && this.rows.length) this.select(this.rows[0]);
      } finally {
        this.listLoading = false;
      }
    },
    async loadPresets() {
      try {
        this.presets = await interfaceApi.presets();
      } catch (e) {
        /* ignore */
      }
    },
    async loadModels() {
      try {
        this.models = await modelApi.all();
      } catch (e) {
        /* ignore */
      }
    },
    select(item) {
      this.current = item;
      this.form = {
        id: item.id,
        name: item.name,
        description: item.description || '',
        format_type: item.format_type || '',
        is_active: item.is_active,
      };
      this.params = normalizeParams(item.params || []);
      this.previewResult = null;
      this.debugResult = null;
    },
    openCreate() {
      this.createForm = { name: '', description: '', format_type: 'openai_chat', fillPreset: true };
      this.createVisible = true;
    },
    onCreateFormat() {
      /* 仅切换格式，创建时按 fillPreset 决定是否填充 */
    },
    async createInterface() {
      if (!this.createForm.name) {
        this.$message.warning('请填写接口名称');
        return;
      }
      const preset = this.presets.find((p) => p.key === this.createForm.format_type);
      let params = [];
      if (this.createForm.fillPreset && preset) {
        params = [
          ...paramsFromPreset(preset.params, 'input'),
          ...paramsFromPreset(preset.params, 'output'),
        ];
      }
      const created = await interfaceApi.create({
        name: this.createForm.name,
        description: this.createForm.description,
        format_type: this.createForm.format_type,
        params: serializeParams(params),
      });
      this.createVisible = false;
      this.$message.success('已创建');
      await this.loadList();
      const hit = this.rows.find((r) => r.id === created.id);
      if (hit) this.select(hit);
    },
    addParam(direction) {
      const p = newParam(direction);
      if (direction === 'output') p._expr = '${resp.';
      this.params.push(p);
    },
    addChild(row) {
      if (!row.children) this.$set(row, 'children', []);
      const child = newParam(row.param_type || 'input');
      row.children.push(child);
      if (row.value_type === 'array') {
        // 数组容器默认用 children 表达结构，不需要整值
      }
    },
    onTypeChange(row) {
      if (!isContainerType(row.value_type) && row.children && row.children.length) {
        this.$confirm('切换为非容器类型会清空已配置的子变量，确认？', '提示', { type: 'warning' })
          .then(() => this.$set(row, 'children', []))
          .catch(() => {});
      }
    },
    setRequired(row, v) {
      this.$set(row, 'validate_rule', v ? 'required' : null);
    },
    async deleteParam(row) {
      const hasChildren = row.children && row.children.length;
      if (hasChildren) {
        try {
          await this.$confirm('该参数包含子变量，删除会一并移除，确认？', '删除确认', { type: 'warning' });
        } catch (e) {
          return;
        }
      }
      removeParam(this.params, row.__key);
    },
    async applyPreset() {
      if (!this.form.format_type) {
        this.$message.warning('请先选择端点格式');
        return;
      }
      const preset = this.presets.find((p) => p.key === this.form.format_type);
      if (!preset) return;
      try {
        await this.$confirm('将用该格式的默认参数模板覆盖当前参数，确认？', '套用预设', { type: 'warning' });
      } catch (e) {
        return;
      }
      this.params = [
        ...paramsFromPreset(preset.params, 'input'),
        ...paramsFromPreset(preset.params, 'output'),
      ];
      this.$message.success('已套用预设，记得保存');
    },
    async save() {
      if (!this.current) return;
      const errors = validateParams(this.params);
      if (errors.length) {
        this.$message.warning(errors[0]);
        return;
      }
      this.saving = true;
      try {
        const payload = {
          name: this.form.name,
          description: this.form.description,
          format_type: this.form.format_type,
          is_active: this.form.is_active,
          params: serializeParams(this.params),
        };
        await interfaceApi.update(this.current.id, payload);
        this.$message.success('已保存');
        await this.loadList();
        const hit = this.rows.find((r) => r.id === this.current.id);
        if (hit) this.select(hit);
      } catch (e) {
        /* 拦截器已提示 */
      } finally {
        this.saving = false;
      }
    },
    async removeCurrent() {
      try {
        await this.$confirm(`确认删除接口「${this.form.name}」？`, '删除确认', { type: 'warning' });
      } catch (e) {
        return;
      }
      await interfaceApi.remove(this.current.id);
      this.$message.success('已删除');
      this.current = null;
      this.params = [];
      await this.loadList();
    },
    buildDebugContext() {
      const gb = this.debugContext && typeof this.debugContext === 'object' ? this.debugContext : {};
      return { gb: { model_name: 'demo-model', ...gb }, stepList: [] };
    },
    async previewRequest() {
      this.previewing = true;
      try {
        this.previewResult = await interfaceApi.preview({
          params: serializeParams(this.params),
          model_id: this.debugModelId || (this.models[0] && this.models[0].id) || null,
          format_type: this.form.format_type,
          context: this.buildDebugContext(),
        });
      } catch (e) {
        /* ignore */
      } finally {
        this.previewing = false;
      }
    },
    async runDebug() {
      if (!this.debugModelId) {
        this.$message.warning('请选择调试模型');
        return;
      }
      this.debugging = true;
      this.debugResult = null;
      try {
        this.debugResult = await interfaceApi.debug({
          params: serializeParams(this.params),
          model_id: this.debugModelId,
          format_type: this.form.format_type,
          context: this.buildDebugContext(),
        });
      } catch (e) {
        /* ignore */
      } finally {
        this.debugging = false;
      }
    },
  },
};
</script>

<style scoped>
.iface-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.iface-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.iface-body {
  display: flex;
  gap: 12px;
  align-items: stretch;
  min-height: 620px;
}

.iface-list {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.iface-list-head {
  padding: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.iface-list-body {
  flex: 1;
  overflow: auto;
  padding: 6px;
}

.iface-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
}

.iface-item:hover {
  background: #f5f7fa;
}

.iface-item.active {
  background: #ecf5ff;
}

.ii-name {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

.ii-meta {
  margin-top: 3px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.iface-empty {
  text-align: center;
  padding: 24px 0;
  font-size: 12px;
}

.iface-detail {
  flex: 1;
  min-width: 0;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  font-size: 13px;
}

.detail-empty i {
  font-size: 26px;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-name {
  width: 220px;
}

.detail-desc {
  margin-top: 8px;
}

.detail-tabs {
  margin-top: 6px;
}

.param-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.param-tip {
  font-size: 12px;
}

.pv-cell {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pv-hint {
  font-size: 11px;
  margin-top: 2px;
}

.debug-form {
  max-width: 720px;
}

.debug-block {
  margin-top: 12px;
}

.debug-title {
  font-weight: 600;
  font-size: 13px;
  margin: 10px 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.debug-errors .el-alert {
  margin-bottom: 4px;
}

.debug-text,
.debug-raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.7;
  padding: 8px 10px;
  border-radius: 6px;
  max-height: 260px;
  overflow: auto;
}

.debug-text {
  background: #f7f8fa;
}

.debug-raw {
  background: #1e2430;
  color: #d6e2f0;
  margin-top: 8px;
}

.debug-images {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.debug-image {
  width: 140px;
  height: 140px;
  border-radius: 6px;
}
</style>
