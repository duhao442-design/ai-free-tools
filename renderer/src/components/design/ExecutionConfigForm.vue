<template>
  <div class="exec-form">
    <el-form label-width="96px" size="mini">
      <el-row :gutter="10">
        <el-col :span="24">
          <el-form-item label="执行模型">
            <el-select
              :value="value.model_id"
              clearable
              filterable
              placeholder="选择模型"
              style="width: 100%"
              @change="(v) => patch({ model_id: v === undefined ? null : v })"
            >
              <el-option
                v-for="m in models"
                :key="m.id"
                :label="`${m.name}（${m.model_name}）`"
                :value="m.id"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="执行接口">
            <el-select
              :value="value.interface_id"
              clearable
              placeholder="选择接口配置"
              style="width: 100%"
              @change="(v) => patch({ interface_id: v === undefined ? null : v })"
            >
              <el-option
                v-for="it in interfaces"
                :key="it.id"
                :label="`${it.name}（${it.format_type || '未指定格式'}）`"
                :value="it.id"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="输入类型">
            <el-select :value="value.input_type" style="width: 100%" @change="(v) => patch({ input_type: v })">
              <el-option v-for="t in inputTypes" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="输出类型">
            <el-select :value="value.output_type" style="width: 100%" @change="(v) => patch({ output_type: v })">
              <el-option v-for="t in outputTypes" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="提示词模版">
        <el-input
          :value="value.prompt"
          type="textarea"
          :rows="6"
          class="mono"
          placeholder="支持 ${gb.xxx} / ${item.xxx} / ${stepList[0].rsp.xxx}"
          @input="(v) => patch({ prompt: v })"
        />
      </el-form-item>

      <el-form-item label="输入取值">
        <el-input
          :value="value.input_value"
          size="mini"
          class="mono"
          placeholder="list 输入填 ${stepList[2].rsp.items}；image 输入填图片表达式"
          @input="(v) => patch({ input_value: v })"
        />
      </el-form-item>

      <el-form-item label="模型输入取值">
        <div class="map-row">
          <span class="map-summary" :class="{ 'is-empty': !hasMap(value.model_input_value) }">
            {{ summarize(value.model_input_value) }}
          </span>
          <el-button size="mini" type="primary" plain icon="el-icon-edit" @click="openMap('model_input_value')">
            {{ hasMap(value.model_input_value) ? '查看 / 修改' : '设置' }}
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="模型输出取值">
        <div class="map-row">
          <span class="map-summary" :class="{ 'is-empty': !hasMap(value.model_output_value) }">
            {{ summarize(value.model_output_value) }}
          </span>
          <el-button size="mini" type="primary" plain icon="el-icon-edit" @click="openMap('model_output_value')">
            {{ hasMap(value.model_output_value) ? '查看 / 修改' : '设置' }}
          </el-button>
        </div>
      </el-form-item>

      <el-form-item v-if="value.input_type === 'list' || value.output_type === 'list'" label="列表表头">
        <div class="col-editor">
          <div v-for="(col, ci) in value.settings.columns" :key="ci" class="col-row">
            <el-input :value="col.key" size="mini" placeholder="字段名" class="col-key mono" @input="(v) => updateColumn(ci, 'key', v)" />
            <el-input :value="col.title" size="mini" placeholder="显示名" class="col-title" @input="(v) => updateColumn(ci, 'title', v)" />
            <el-button type="text" size="mini" class="text-danger" @click="removeColumn(ci)">删除</el-button>
          </div>
          <el-button size="mini" icon="el-icon-plus" @click="addColumn">添加列</el-button>
        </div>
      </el-form-item>

      <template v-if="value.output_type === 'image'">
        <el-row :gutter="10">
          <el-col :span="24">
            <el-form-item label="已有图片">
              <el-select
                :value="value.settings.existing_image_mode || 'overwrite'"
                style="width: 100%"
                @change="(v) => patchSettings({ existing_image_mode: v })"
              >
                <el-option label="覆盖（重新生成）" value="overwrite" />
                <el-option label="保留（已有图的行不调接口）" value="keep" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="行标识字段">
              <el-input
                :value="value.settings.row_key"
                size="mini"
                class="mono"
                placeholder="留空自动：name；分镜用 page,panel"
                @input="(v) => patchSettings({ row_key: v })"
              />
              <div class="text-muted tip">「保留已有图」时用它把本次的行和上次结果对上</div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="试跑行数">
              <el-input-number
                :value="value.settings.maxRows"
                :min="0"
                :max="200"
                size="mini"
                controls-position="right"
                style="width: 100%"
                @change="(v) => patchSettings({ maxRows: v })"
              />
              <div class="text-muted tip">0 = 全部</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="起始行">
              <el-input-number
                :value="value.settings.rowOffset"
                :min="0"
                :max="200"
                size="mini"
                controls-position="right"
                style="width: 100%"
                @change="(v) => patchSettings({ rowOffset: v })"
              />
              <div class="text-muted tip">跳过前 N 行</div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="参考图来源">
              <el-input
                :value="value.settings.image_ref.from"
                size="mini"
                class="mono"
                placeholder="如 ${stepList[1].rsp.items}"
                @input="(v) => patchImageRef({ from: v })"
              />
              <div class="text-muted tip">有匹配走图生图（/images/edits），否则文生图（/images/generations）</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row v-if="value.settings.image_ref.from" :gutter="10">
          <el-col :span="12">
            <el-form-item label="匹配字段">
              <el-input
                :value="value.settings.image_ref.matchField"
                size="mini"
                placeholder="role"
                @input="(v) => patchImageRef({ matchField: v })"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称字段">
              <el-input
                :value="value.settings.image_ref.nameField"
                size="mini"
                placeholder="name"
                @input="(v) => patchImageRef({ nameField: v })"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </template>
    </el-form>

    <el-dialog
      :title="dialog.field === 'model_output_value' ? '模型输出取值' : '模型输入取值'"
      :visible.sync="dialog.visible"
      width="760px"
      append-to-body
      custom-class="map-dialog"
    >
      <div class="map-dialog-tip">
        <template v-if="dialog.field === 'model_output_value'">
          从接口响应里取值并保存到步骤结果，例如 <code>{ "image": "${resp.data[0].url}", "content": "${resp.choices[0].message.content}" }</code>；
          `file` 类参数会自动转存为本地文件链接。
        </template>
        <template v-else>
          覆盖接口参数的默认值，例如 <code>{ "prompt": "${gb.prompt}", "size": "1024x1024" }</code>；
          值支持 <code>${gb.xxx}</code> / <code>${item.xxx}</code> / <code>${stepList[0].rsp.xxx}</code>。
        </template>
      </div>

      <el-row :gutter="14">
        <el-col :span="15">
          <json-editor :value="dialog.draft" :rows="16" @change="(v) => (dialog.draft = v)" />
        </el-col>
        <el-col :span="9">
          <div class="map-ref">
            <div class="map-ref-title">当前接口参数</div>
            <div v-if="!interfaceParams.length" class="text-muted map-ref-empty">
              还没有选执行接口，或接口没有参数
            </div>
            <div v-for="p in interfaceParams" :key="p.name" class="map-ref-item">
              <div class="map-ref-name">
                {{ p.name }}
                <el-tag v-if="p.param_type" size="mini" type="info">{{ p.param_type }}</el-tag>
              </div>
              <div class="map-ref-meta text-muted">
                {{ p.value_type || 'string' }}
                <span v-if="p.file_type && p.file_type !== 'none'"> · 文件:{{ p.file_type }}</span>
                <span v-if="p.required"> · 必填</span>
              </div>
              <div v-if="p.description" class="map-ref-desc">{{ p.description }}</div>
            </div>
          </div>
        </el-col>
      </el-row>

      <span slot="footer">
        <el-button size="small" type="text" class="text-danger" @click="clearMap">清空</el-button>
        <el-button size="small" @click="dialog.visible = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveMap">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';
import { STEP_INPUT_TYPES, STEP_OUTPUT_TYPES } from '@/utils/constants';

/**
 * 页面执行配置表单：模型 / 接口 / 输入输出类型 / 提示词 / 取值 / 试跑参数。
 * 只发 patch，不直接改传入对象，便于父组件用 $set 保证响应式。
 */
export default {
  name: 'ExecutionConfigForm',
  components: { JsonEditor },
  props: {
    value: { type: Object, required: true },
    models: { type: Array, default: () => [] },
    interfaces: { type: Array, default: () => [] },
  },
  data() {
    return {
      inputTypes: STEP_INPUT_TYPES,
      outputTypes: STEP_OUTPUT_TYPES,
      dialog: { visible: false, field: 'model_input_value', draft: null },
    };
  },
  computed: {
    selectedInterface() {
      return this.interfaces.find((it) => it.id === this.value.interface_id) || null;
    },
    interfaceParams() {
      const it = this.selectedInterface;
      return it && Array.isArray(it.params) ? it.params : [];
    },
  },
  methods: {
    emit(next) {
      this.$emit('input', next);
    },
    patch(patch) {
      this.emit({ ...this.value, ...patch });
    },
    hasMap(value) {
      return Boolean(value && typeof value === 'object' && Object.keys(value).length);
    },
    summarize(value) {
      if (!this.hasMap(value)) return '未配置（点击右侧按钮设置）';
      const keys = Object.keys(value);
      const shown = keys.slice(0, 4).join('、');
      return keys.length > 4 ? `已配置 ${keys.length} 个字段：${shown} …` : `已配置：${shown}`;
    },
    openMap(field) {
      const current = this.value[field];
      this.dialog = {
        visible: true,
        field,
        draft: current && typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {},
      };
    },
    saveMap() {
      this.patch({ [this.dialog.field]: this.dialog.draft });
      this.dialog.visible = false;
    },
    clearMap() {
      this.dialog.draft = {};
    },
    patchSettings(patch) {
      this.emit({ ...this.value, settings: { ...this.value.settings, ...patch } });
    },
    patchImageRef(patch) {
      this.patchSettings({ image_ref: { ...this.value.settings.image_ref, ...patch } });
    },
    addColumn() {
      const columns = [...(this.value.settings.columns || []), { key: '', title: '' }];
      this.patchSettings({ columns });
    },
    removeColumn(index) {
      const columns = [...(this.value.settings.columns || [])];
      columns.splice(index, 1);
      this.patchSettings({ columns });
    },
    updateColumn(index, key, value) {
      const columns = [...(this.value.settings.columns || [])];
      columns[index] = { ...columns[index], [key]: value };
      this.patchSettings({ columns });
    },
  },
};
</script>

<style scoped>
.exec-form ::v-deep .el-form-item {
  margin-bottom: 12px;
}

.tip {
  font-size: 11px;
  line-height: 1.5;
  margin-top: 2px;
}

.col-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.col-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.col-key,
.col-title {
  width: 150px;
}

.map-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.exec-form ::v-deep .el-form-item__content {
  min-width: 0;
}

.map-row ::v-deep .el-button {
  flex: none;
  padding: 5px 8px;
}

.map-summary {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #303133;
  background: #f7f8fa;
  border-radius: 4px;
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-summary.is-empty {
  color: #a8abb2;
}

.map-dialog-tip {
  font-size: 12px;
  line-height: 1.8;
  color: #606266;
  background: #f7f8fa;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
}

.map-dialog-tip code {
  background: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: Consolas, Monaco, monospace;
  color: #c7254e;
}

.map-ref {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
  max-height: 360px;
  overflow: auto;
}

.map-ref-title {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.map-ref-empty {
  font-size: 12px;
}

.map-ref-item {
  padding: 6px 0;
  border-top: 1px dashed #ebeef5;
}

.map-ref-name {
  font-size: 12px;
  font-family: Consolas, Monaco, monospace;
  color: #303133;
}

.map-ref-meta {
  font-size: 11px;
  margin-top: 2px;
}

.map-ref-desc {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  line-height: 1.5;
}
</style>
