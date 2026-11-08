<template>
  <div class="props-panel">
    <div v-if="!block" class="pp-empty text-muted">
      <i class="el-icon-mouse" />
      <div>选中画布中的组件后可配置传参</div>
    </div>
    <template v-else>
      <div class="pp-head">
        <div>
          <div class="pp-title">{{ meta ? meta.name : block.component }}</div>
          <div class="pp-key mono text-muted">{{ block.component }}</div>
        </div>
        <el-tag size="mini" type="info">{{ meta && meta.source === 'builtin' ? '内置' : '自定义' }}</el-tag>
      </div>

      <div v-if="meta && meta.description" class="pp-desc">{{ meta.description }}</div>

      <el-divider content-position="left">布局</el-divider>
      <el-form label-width="86px" size="mini" class="pp-form">
        <el-form-item label="宽度">
          <el-radio-group v-model="localSpan" size="mini">
            <el-radio-button :label="24">整行</el-radio-button>
            <el-radio-button :label="12">半行</el-radio-button>
            <el-radio-button :label="8">1/3</el-radio-button>
            <el-radio-button :label="16">2/3</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="透明背景">
          <el-switch v-model="localNoCard" />
        </el-form-item>
      </el-form>

      <el-divider content-position="left">传参配置</el-divider>
      <div v-if="!propsSchema.length" class="text-muted pp-noprops">该组件没有可配置参数</div>
      <el-form v-else label-position="top" size="mini" class="pp-form">
        <el-form-item v-for="prop in propsSchema" :key="prop.name">
          <template slot="label">
            {{ prop.label || prop.name }}
            <span class="mono text-muted">（{{ prop.name }}）</span>
            <el-tooltip v-if="isExpr(prop)" content="支持 ${...} 表达式，从页面上下文取值" placement="top">
              <span class="expr-flag">表达式</span>
            </el-tooltip>
          </template>

          <el-switch
            v-if="prop.type === 'boolean'"
            :value="boolValue(prop.name)"
            @change="(v) => setProp(prop.name, v)"
          />

          <el-select
            v-else-if="prop.type === 'select'"
            :value="valueOf(prop.name)"
            size="mini"
            style="width: 100%"
            @change="(v) => setProp(prop.name, v)"
          >
            <el-option v-for="opt in prop.options || []" :key="opt" :label="opt || '（不限）'" :value="opt" />
          </el-select>

          <json-editor
            v-else-if="prop.type === 'array' || prop.type === 'json'"
            :value="valueOf(prop.name)"
            :rows="5"
            @change="(v) => setProp(prop.name, v)"
          />

          <el-input-number
            v-else-if="prop.type === 'number' && !isExpr(prop)"
            :value="numberValue(prop.name)"
            :min="0"
            size="mini"
            style="width: 100%"
            @change="(v) => setProp(prop.name, v)"
          />

          <el-input
            v-else
            :value="valueOf(prop.name)"
            :type="prop.multiline || prop.type === 'textarea' ? 'textarea' : 'text'"
            :rows="prop.multiline || prop.type === 'textarea' ? 4 : undefined"
            size="mini"
            class="mono"
            :placeholder="placeholderOf(prop)"
            @input="(v) => setProp(prop.name, v)"
          />
          <div v-if="prop.description" class="prop-desc text-muted">{{ prop.description }}</div>
        </el-form-item>
      </el-form>

      <el-collapse v-model="activeHelp" class="pp-help">
        <el-collapse-item title="可用上下文变量" name="vars">
          <div class="pp-vars">
            <el-tag
              v-for="v in commonVars"
              :key="v"
              size="mini"
              type="info"
              class="pp-var"
              @click="copyVar(v)"
            >{{ '${' + v + '}' }}</el-tag>
          </div>
          <div class="text-muted pp-vars-tip">
            页面上下文由后端在页面加载时产出：gb（作品字段/资产/参数）、stepList（已完成步骤的 req/rsp）。
          </div>
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>

<script>
import JsonEditor from '@/components/ui/JsonEditor.vue';
import { copyText } from '@/utils/format';

export default {
  name: 'PropsPanel',
  components: { JsonEditor },
  props: {
    block: { type: Object, default: null },
    meta: { type: Object, default: null },
  },
  data() {
    return {
      activeHelp: [],
      commonVars: [
        'gb.name', 'gb.content', 'gb.keywords', 'gb.prompt', 'gb.model_name',
        'gb.item.name', 'gb.item.description',
        'stepList[0].rsp.content', 'stepList[0].rsp.items', 'stepList[0].rsp.images',
        'prev_output', 'prev_image',
      ],
    };
  },
  computed: {
    propsSchema() {
      return (this.meta && this.meta.props_schema) || [];
    },
    localSpan: {
      get() {
        return Number(this.block && this.block.span) || 24;
      },
      set(v) {
        this.patchBlock({ span: v });
      },
    },
    localNoCard: {
      get() {
        return Boolean(this.block && this.block.noCard);
      },
      set(v) {
        this.patchBlock({ noCard: v });
      },
    },
  },
  methods: {
    isExpr(prop) {
      return prop.expr !== false;
    },
    valueOf(name) {
      if (!this.block) return '';
      const v = (this.block.props || {})[name];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return v;
      return v;
    },
    boolValue(name) {
      return Boolean((this.block.props || {})[name]);
    },
    numberValue(name) {
      const v = Number((this.block.props || {})[name]);
      return Number.isFinite(v) ? v : 0;
    },
    placeholderOf(prop) {
      if (this.isExpr(prop)) return `常量，或表达式如 \${gb.${prop.name}}`;
      return prop.label || prop.name;
    },
    setProp(name, value) {
      const props = { ...(this.block.props || {}), [name]: value };
      this.patchBlock({ props });
    },
    patchBlock(patch) {
      this.$emit('update', { id: this.block.id, patch });
    },
    copyVar(v) {
      copyText(`\${${v}}`).then(() => this.$message.success('已复制表达式'));
    },
  },
};
</script>

<style scoped>
.props-panel {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  height: 100%;
  overflow: auto;
}

.pp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  font-size: 13px;
}

.pp-empty i {
  font-size: 24px;
}

.pp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.pp-title {
  font-weight: 600;
  font-size: 14px;
}

.pp-key {
  font-size: 11px;
}

.pp-desc {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.pp-form ::v-deep .el-form-item {
  margin-bottom: 12px;
}

.pp-form ::v-deep .el-form-item__label {
  line-height: 22px;
  padding-bottom: 2px;
  font-size: 12px;
  color: #606266;
}

.expr-flag {
  display: inline-block;
  margin-left: 4px;
  font-size: 10px;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 3px;
  padding: 0 4px;
}

.prop-desc {
  font-size: 11px;
  margin-top: 2px;
}

.pp-noprops {
  font-size: 12px;
  padding: 6px 0;
}

.pp-vars {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pp-var {
  cursor: pointer;
}

.pp-vars-tip {
  font-size: 11px;
  margin-top: 6px;
  line-height: 1.6;
}
</style>
