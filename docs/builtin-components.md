# 内置组件说明

内置组件由 `server/core/componentRegistry.js` 声明元数据、`renderer/src/components/runtime/builtin/`
实现，页面搭建时从左侧调色板拖拽使用。每个组件的参数都可以填**常量**或**表达式**（`${...}`），
表达式在页面加载后由后端解析。

| 内置组件 (key) | 作用 | 主要传参 |
|---|---|---|
| `page-title` | 标题 / 副标题 | `text`、`subtitle`、`size` |
| `divider` | 分割线 | `text`、`position` |
| `notice` | 提示条 | `text`、`type` |
| `work-info` | 作品字段展示 | `fields`、`contentRows` |
| `step-flow` | 步骤流程条（可切换） | `clickable`、`direction` |
| `prompt-template` | 编辑提示词、显示可用变量、保存 | `value`、`rows`、`editable`、`showVars` |
| `prompt-preview` | 展示解析后的提示词（列表逐行） | `prompt`、`resolveApi`、`columns`、`maxHeight` |
| `model-selector` | 模型选择（名称 + 标识） | `modelValue`、`filterModelType`、`showFormat` |
| `step-item-table` | 表头驱动的列表表格，图片列、可编辑、可勾选 | `items`、`columns`、`editable`、`selectable`、`showRaw` |
| `image-grid` | 图片网格展示 | `images`、`columns`、`size`、`showIndex` |
| `image-upload` | 上传到项目存储并回填链接 | `label`、`accept`、`subDir`、`bindTo` |
| `json-viewer` | 只读 JSON | `value`、`maxHeight` |
| `json-editor` | 编辑 JSON（带校验 / 格式化） | `value`、`rows` |
| `text-panel` | 长文本展示 / 编辑 | `text`、`format`、`maxHeight` |
| `request-preview` | 展示 method / url / headers / query / body | `request`、`showHeaders` |
| `response-panel` | 请求 / 提取结果 / 原始响应折叠 | `reqData`、`rspData`、`rawRsp`、`output` |
| `run-button` | 执行当前步骤、重置、运行状态 | `label`、`showReset`、`confirm` |
| `batch-toolbar` | 勾选行批量执行 | `selected`、`label`、`hint` |
| `interface-param-tree` | 参数树只读展示（含文件类型） | `params`、`direction` |
| `asset-list` | 资产（预设变量）列表 | `keyword`、`maxHeight` |
| `step-images` | 展示**当前步骤**产出的图片（直接读该步执行结果，不依赖页面上下文） | `label`、`columns`、`size`、`showIndex` |
| `step-items` | 展示**当前步骤**解析出的列表（角色 / 分镜），列留空按首行自动推导 | `label`、`columns`、`maxHeight`、`showRaw` |
| `row-selector` | 从**前置步骤的列表输出**里勾选要处理的行，勾选结果作为本次执行的输入行（后端按行循环调用） | `source`、`nameField`、`descField`、`imageField`、`defaultSelectAll`、`maxHeight` |

## 设计器里的组件传参

- 每个组件参数都可以填**常量**或**表达式**（`${...}`），表达式在页面加载后由后端解析；
- 参数面板提供「可用上下文变量」快捷复制；
- 自定义组件的 `props_schema` 决定出现哪些参数；`render_spec` 决定怎么渲染。
