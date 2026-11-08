# 数据解析规则

解析引擎实现：`server/core/resolver.js`（对齐旧项目 `app/services/template_resolver.py`）。

## 1. 上下文结构

```json
{
  "gb": {
    "name": "作品名",
    "content": "作品内容",
    "keywords": "关键词",
    "source_url": "",
    "prompt": "当前步骤提示词模版",
    "model_name": "gpt-4o",
    "item": { "name": "分镜 1", "description": "雨夜" },
    "step_index": 2,
    "step_name": "分镜生成",
    "assets": { "art_style": "赛璐璐" },
    "art_style": "赛璐璐",
    "work": { "...": "作品整行" },
    "workflow": { "id": 1, "name": "示例工作流" },
    "page": { "id": 2, "name": "提示词与解析" }
  },
  "stepList": [
    { "step_id": 1, "step_order": 1, "name": "生成角色", "req": {}, "rsp": { "content": "..." } }
  ],
  "resp": { }
}
```

- `gb`：页面/步骤的全局对象，页面上下文构建时产出；
- `stepList`：前置**成功**步骤，按 `step_order` 升序；
- `resp`：仅接口输出提取（`param_type=output`）时存在，值为上游原始响应。

## 2. 路径语法

| 语法 | 说明 | 示例 |
|---|---|---|
| `.key` | 对象字段 | `${gb.name}` |
| `[n]` | 数组下标 | `${stepList[0].rsp.items[2].name}` |
| 组合 | 任意嵌套 | `${gb.list[0].cover}` |

根名别名（兼容旧模板）：

| 写法 | 等价 |
|---|---|
| `${item.xxx}` / `${scene.xxx}` | `${gb.item.xxx}` |
| `${character.xxx}` | `${gb.character.xxx}` |
| `${work.xxx}` / `${page.xxx}` | `${gb.xxx}` |
| `${resp.xxx}` | 上下文的 `resp` 根 |
| 裸变量 `${art_style}`、`${prev_output}` | 若根名不在上下文，则回退到 `gb.art_style` / `gb.prev_output` |

## 3. 取值行为

| 场景 | 行为 |
|---|---|
| 整串恰好是一个占位符 `"${gb.items}"` | 返回**原始类型**（数组/对象/数字/布尔不字符串化） |
| 文本中嵌入 `"共 ${gb.count} 条"` | 文本替换；对象/数组以 JSON 文本嵌入 |
| JSON 文本 + 声明为 array/object | 先 `JSON.parse` 再递归渲染（避免多行文本破坏 JSON） |
| 路径未命中 | 文本场景保留原占位符；单占位符无类型时保留原串 |

## 4. 兼容旧项目的根级变量

| 变量 | 说明 |
|---|---|
| `${prev_output}` | 上一步提取结果中的主文本 |
| `${prev_image}` | 上一步的第一张图片 |
| `${step_N_output}` | 第 N 步文本产出 |
| `${step_N_image}` / `${step_N_images}` / `${step_N_images_json}` | 第 N 步图片（首张 / 换行分隔 / JSON 数组） |
| `${step_N_all}` | 第 N 步文本 + 全部图片链接 |
| `${step_index}` / `${step_name}` | 当前步骤序号 / 名称 |
| `${work_name}` / `${work_id}` | 作品名称 / ID |

## 5. 值类型转换

参数声明 `value_type` 时按声明转型：

`string` / `number` / `boolean` / `object` / `array`

`number` 会尽量转数字（空串 → `null`），`boolean` 识别 `true/1/yes/y/是`，`object/array` 会尝试 `JSON.parse`。

## 6. 文件类型（接口参数专属）

接口参数在 `value_type` 之后还有一个 `file_type`：`none | file | url | base64`。

- **输入方向**：先 `detectKind(value)` 探测实际形态，再 `convertFile` 转成声明的 `file_type`；
  非文件值原样透传（不会把普通文本强行转成二进制）。
- **输出方向**：只要声明了文件类型或探测到文件，就 `putFile` 到项目级存储，返回值是**本地链接**。

探测规则：

| 值形态 | 判定 |
|---|---|
| `data:image/png;base64,...` | base64 |
| `http(s)://...` | url |
| `file://` / 存在的本地路径 / Buffer | file |
| `{ path }` / `{ url }` / `{ base64 }` | 按字段判定 |
| 其他 | none |

## 7. 页面上下文数据源（context_config）

```json
{
  "providers": [
    { "id": "work", "type": "builtin", "kind": "work", "enabled": true },
    { "id": "assets", "type": "builtin", "kind": "assets", "enabled": true },
    { "id": "params", "type": "builtin", "kind": "params", "enabled": true },
    { "id": "steps", "type": "builtin", "kind": "stepList", "enabled": true },
    { "id": "artifacts", "type": "builtin", "kind": "artifacts" },
    {
      "id": "user_api",
      "type": "http",
      "request": {
        "method": "GET",
        "url": "https://example.com/api/${gb.work_id}",
        "headers": { "Authorization": "Bearer xxx" },
        "query": {},
        "body": null
      },
      "extract": { "profile": "${resp.data.user}" }
    }
  ],
  "variableMapping": { "content": "作品内容", "kw": "关键词" }
}
```

- `type=http` 的数据源会把提取结果挂到 `gb.<id>`；请求失败时挂 `{ "__error": "..." }`，并写入 `gb.__contextErrors`。
- 所有数据源按数组顺序执行，后执行的可以引用先执行的结果。

## 逐行参考图与角色信息

页面 `execution.settings.image_ref` 配置后，每一行会先用它的角色字段去匹配来源列表：

```json
{ "from": "${stepList[1].rsp.items}", "matchField": "roles", "nameField": "name" }
```

匹配到的角色会补进当前行，提示词里可直接用：

| 变量 | 说明 |
|---|---|
| `${item.character_names}` | 命中角色名，`、` 连接 |
| `${item.character_descs}` | 命中角色的设定描述（多行） |
| `${item.characters}` | 命中角色对象数组 |
| `${item.reference_images}` | 命中角色的图片地址数组 |

- 命中多张参考图时，图片接口会按 `image[]` 一次上传（最多 4 张）；网关不支持时自动退回单图。
- 全部命中不到图片时退化为文生图（`/images/generations`）。


## 执行时的行（rows）

- 步骤是「列表输入」时，默认按 `input_value` 解析出的数组**逐行**执行（每行一次接口调用）。
- 页面里放了 `row-selector`（选择列表行）组件时，勾选结果以 `inputs.rows` 传给后端，**只执行勾选的行**；
  此时 `maxRows` / `rowOffset` 不生效（选了几行就跑几行）。
- 列表输出步骤会把每行结果写回 `rsp_data.items`；图片步骤会给每行补 `image_url`，
  供「本步产出图片 / 本步列表产出」展示（图片下方会带行名，如角色名）。

