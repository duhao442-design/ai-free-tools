# 旧页面 → 内置组件映射

旧项目 `aitools/frontend/src` 的页面功能区块，被拆成 20 个内置组件（`server/core/componentRegistry.js`
声明元数据，`renderer/src/components/runtime/builtin/` 实现）。页面搭建时在左侧拖拽使用。

| 内置组件 (key) | 旧项目来源 | 作用 | 主要传参 |
|---|---|---|---|
| `page-title` | 各页面页头 | 标题/副标题 | `text`、`subtitle`、`size` |
| `divider` | 通用 | 分割线 | `text`、`position` |
| `notice` | 通用提示 | 提示条 | `text`、`type` |
| `work-info` | `Works.vue` 详情头部 | 作品字段展示 | `fields`、`contentRows` |
| `step-flow` | `WorkDetail.vue` el-steps | 步骤流程条（可切换） | `clickable`、`direction` |
| `prompt-template` | `ConfigStepPanel.vue` ①提示词模版 | 编辑提示词、显示可用变量、保存 | `value`、`rows`、`editable`、`showVars` |
| `prompt-preview` | `ConfigStepPanel.vue` ②解析结果 | 展示解析后的提示词（列表逐行） | `prompt`、`resolveApi`、`columns`、`maxHeight` |
| `model-selector` | `TemplateEdit.vue` 模型下拉 | 模型选择（名称+标识） | `modelValue`、`filterModelType`、`showFormat` |
| `step-item-table` | `ConfigStepPanel.vue` ③执行结果表 / `LegacyComicPanels` 角色表·分镜表 | 表头驱动的列表表格，图片列、可编辑、可勾选 | `items`、`columns`、`editable`、`selectable`、`showRaw` |
| `image-grid` | `LegacyComicPanels` 图片网格 | 图片网格展示 | `images`、`columns`、`size`、`showIndex` |
| `image-upload` | `ImageViewer.vue` + 上传逻辑 | 上传到项目存储并回填链接 | `label`、`accept`、`subDir`、`bindTo` |
| `json-viewer` | `ConfigStepPanel` 报文弹窗 / `formatJson` | 只读 JSON | `value`、`maxHeight` |
| `json-editor` | `Interfaces.vue` / `TemplateEdit.vue` / `LegacyComicPanels` 的 JSON 编辑 | 编辑 JSON（带校验/格式化） | `value`、`rows` |
| `text-panel` | `LegacyComicPanels` 文本产出 | 长文本展示 / 编辑 | `text`、`format`、`maxHeight` |
| `request-preview` | `ConfigStepPanel` 请求报文 | 展示 method/url/headers/query/body | `request`、`showHeaders` |
| `response-panel` | `ConfigStepPanel` ④执行详情 | 请求/提取结果/原始响应折叠 | `reqData`、`rspData`、`rawRsp`、`output` |
| `run-button` | `WorkDetail.vue` 执行/重置 | 执行当前步骤、重置、运行状态 | `label`、`showReset`、`confirm` |
| `batch-toolbar` | `LegacyComicPanels` 批量生图工具条 | 勾选行批量执行 | `selected`、`label`、`hint` |
| `interface-param-tree` | `Interfaces.vue` 参数树 | 参数树只读展示（含文件类型） | `params`、`direction` |
| `asset-list` | `Assets.vue` | 资产（预设变量）列表 | `keyword`、`maxHeight` |
| `step-images` | `LegacyComicPanels` 角色图/分镜图网格 | 展示**当前步骤**产出的图片（直接读该步执行结果，不依赖页面上下文） | `label`、`columns`、`size`、`showIndex` |
| `step-items` | `ConfigStepPanel` 执行结果表 | 展示**当前步骤**解析出的列表（角色/分镜），列留空按首行自动推导 | `label`、`columns`、`maxHeight`、`showRaw` |
| `row-selector` | `ConfigStepPanel` 角色勾选 | 从**前置步骤的列表输出**里勾选要处理的行，勾选结果作为本次执行的输入行（后端按行循环调用） | `source`、`nameField`、`descField`、`imageField`、`defaultSelectAll`、`maxHeight` |

## 旧页面到新结构的对应

| 旧项目 | 新项目 |
|---|---|
| 作品列表 `Works.vue` | 「作品管理」列表（进入/编辑/删除） |
| 作品详情 `WorkDetail.vue` | 「作品详情」= 步骤条 + **页面运行时**（页面按工作流步骤绑定） |
| 模板 `Templates.vue` / `TemplateEdit.vue` | 「工作流管理」（步骤 + 页面 + 模型 + 接口 + 提示词，支持 JSON 模式） |
| 步骤配置 `Steps.vue`（input/output type + columns） | 工作流步骤的输入/输出类型 + 列表表头（`settings.columns`） |
| 接口管理 `Interfaces.vue` | 「接口管理」两栏布局 + 输入/输出分 Tab + 文件类型列 |
| 模型管理 `Models.vue` / `ModelTest.vue` | 「模型管理」+「模型测试」（字段保持一致） |
| 资产 `Assets.vue` | 「资产管理」 |
| 技能 `Skills.vue` | 暂不迁移（新架构以组件与接口承载工具调用场景） |
| `ConfigStepPanel` / `LegacyComicPanels` | 被拆成上面 8 个流程组件，通过页面拖拽自由组合 |

## 设计器里的组件传参

- 每个组件参数都可以填**常量**或**表达式**（`${...}`），表达式在页面加载后由后端解析；
- 参数面板提供「可用上下文变量」快捷复制；
- 自定义组件的 `props_schema` 决定出现哪些参数；`render_spec` 决定怎么渲染。
