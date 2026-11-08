# AI Free Tools

基于 **Electron + Vue 2 + Node + SQLite** 的低代码 AI 工作流桌面应用。

它是旧项目 `aitools`（Python FastAPI + Vue3 + MySQL）的重构版：保留模型配置与「AI 漫剧」目标，重构为
**组件 → 页面 → 工作流 → 作品** 四层结构，页面由组件拖拽搭建，步骤页面可通过表单或 JSON 低代码配置，
接口管理支持 `file / url / base64 / 非文件` 四类参数并在输入输出两端自动转换。

---

## 界面预览

![漫画成品页：作品《碧华迢迢》生成漫画后的页面](docs/images/comic-reader.png)

> 漫画成品页：作品《碧华迢迢》完成「最终成图」后，把画面与「分镜生成」的台词按页组装成漫画，
> 支持切换排版、拖动气泡微调，并可「下载 ZIP」按页导出。

---

## 1. 初始化与启动

### 1.1 环境要求

- Node.js **22+**
- npm 10+
- Windows / macOS / Linux 桌面环境（Electron 需要图形界面）

### 1.2 安装依赖

```bash
npm install
```

首次安装会下载 Electron 二进制，耗时取决于网络。

### 1.3 初始化项目数据

```bash
npm run init
```

初始化脚本（[`scripts/init-project.js`](scripts/init-project.js)）会：

- 创建数据目录与 `files/` 子目录，建立 SQLite 库（`ai-free-tools.db`）；
- 写入默认设置，以及示例页面 / 工作流（用 `--no-demo` 可跳过）；
- **不初始化模型，也不初始化作品**——模型需要你填写自己的 API Key，作品属于生成内容，
  都不随项目分发。

常用参数：

```bash
npm run init                              # 初始化默认数据目录
npm run init -- --data-dir D:\aift-data   # 指定数据目录（相对路径按当前目录解析）
npm run init -- --no-demo                 # 只写默认设置，不建示例页面 / 工作流
npm run init -- --json                    # 以 JSON 输出初始化结果
```

脚本是幂等的：重复执行只补默认设置，不会删除或覆盖已有的页面、工作流、模型和作品。
执行前请先退出桌面应用（数据库有独占锁）。

初始化完成后，在应用里到「模型管理」添加模型（Base URL、模型名、API Key），
再到「接口管理」核对接口参数模板，即可创建工作流和作品。

### 1.4 启动

```bash
# 桌面应用开发模式（Vite + Electron 热更新）
npm run dev

# 单独调试后端（不启动 Electron）
npm run server            # http://127.0.0.1:41700

# 仅调试前端（浏览器打开 http://127.0.0.1:5273）
AIFT_API_PROXY=http://127.0.0.1:41700 npm run dev:renderer

# 构建前端 + 打包安装包
npm run build             # 产物在 release/

# 用已构建的前端启动桌面应用
npm start
```

> Windows 下 `AIFT_API_PROXY` 用 PowerShell：`$env:AIFT_API_PROXY='http://127.0.0.1:41700'; npm run dev:renderer`

数据默认放在 `%APPDATA%\ai-free-tools\data`（Windows）、
`~/Library/Application Support/ai-free-tools/data`（macOS）、
`$XDG_DATA_HOME/ai-free-tools/data` 或 `~/.local/share/ai-free-tools/data`（Linux）——
**开发态与安装版共用同一份数据**，可用 `AIFT_DATA_DIR` 覆盖。
数据库是单文件 SQLite（`ai-free-tools.db`），文件产物在 `data/files/`。

> 版本库只保留源码：`node_modules/`、编译产物（`dist/`、`release/`）与数据目录
> （`data/`（含其中的 `files/`）、`*.db` 等）已在 [`.gitignore`](.gitignore) 中忽略，不会提交。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 桌面壳 | Electron 45 | 主进程内嵌 HTTP 服务，渲染进程无 Node 权限（contextIsolation） |
| 前端 | Vue 2.7 + Element UI 2 + Vite 5 | 组件化、可拖拽搭建 |
| 后端 | Node 22+ / Express | 运行在 Electron 主进程，也可用 `npm run server` 独立跑 |
| 数据库 | SQLite（sql.js / WASM） | 无原生依赖，Electron 与纯 Node 都能运行 |
| 存储 | 本地 / MinIO / 七牛 | 项目级配置，适配器可扩展 |

## 3. 四层核心概念

```
组件(Component)  ──拖拽──▶  页面(Page)  ──组装──▶  工作流(Workflow)  ──实例化──▶  作品(Work)
   传参表达式              页面上下文               步骤顺序（页面间不传参）        一步步流转
```

### 3.1 组件（组件管理）

- **内置组件**：由旧项目页面解析而来（提示词模版、解析后提示词、列表数据表格、图片网格、执行按钮、执行结果等），
  见 [docs/component-mapping.md](docs/component-mapping.md)。
- **自定义组件**：在「组件管理 → 新建自定义组件」里声明 `props_schema`（暴露给页面搭建的传参）和
  `render_spec`（用 panel/title/text/field/image/json/input/button/divider 节点描述渲染）。

每个参数可标记「支持表达式」；页面搭建时填的字符串会按 `${...}` 规则解析。

### 3.2 页面（页面管理）

- 页面 = 组件布局（`layout`）+ 上下文配置（`context_config`）+ **执行配置（`execution`）**。
- **执行配置属于页面**：这一页用哪个模型、哪个接口、提示词模版、输入/输出类型、取值映射、列表表头、
  试跑行数、参考图来源，都在页面的「执行配置」里设置；工作流不再单独配模型。
- **页面加载时由后端产出全局上下文**，组件通过 `${gb.xxx}` / `${stepList[n].rsp.xxx}` 取值。
- 上下文数据源（可开关、可加 HTTP 数据源）：
  - `work`：作品字段 → `gb.*`、`gb.work`
  - `assets`：资产表 key/value 平铺进 `gb`
  - `params`：作品 `params` 平铺进 `gb`
  - `stepList`：前置成功步骤的 `req/rsp`
  - `artifacts`：产物清单
  - `http`：任意 HTTP 请求 + 响应提取，结果挂在 `gb.<id>`
- 页面设计器支持**拖拽**（调色板 → 画布，可插入到任意位置；画布内拖拽排序）或点「＋」直接添加、
  整行/半行切换、传参配置、执行配置、上下文配置、整页 JSON 编辑、选择作品做「解析预览」。

### 3.3 工作流（工作流管理）

- 工作流 = **按顺序拼接页面**：每个步骤只选一个页面（模型/接口/提示词都在页面上），步骤名默认取页面名。
- **页面之间不共享前端传参**：每一步进入时，后端按「作品 + 已成功步骤」重建上下文；数据只在后端流转。
- 步骤配置支持表单（选页面 + 查看执行摘要）与 JSON 模式（直接改 `steps` 数组）。
- 图片类页面（`execution.output_type=image`）额外支持：
  - **已有图片处理（`image-mode-switch` 组件 / `settings.existing_image_mode`）**：
    `overwrite` 覆盖（重新生成）或 `keep` 保留（**已有图的行直接复用、不调接口**，只为缺图的行生成）。
    行匹配用 `settings.row_key`（默认 `name`，分镜用 `page,panel`）。保留模式下执行结果会写明「复用 N 张，重新生成 M 张」。
  - **`row-selector` 组件（选择列表行）**：从上游步骤的列表输出里勾选要处理的行（如角色列表），
    勾选结果通过 `inputs.rows` 传给后端，**后端按行循环调用接口（每行一次请求）**；不勾选时执行按钮会拦截并提示，
    步骤已执行成功时默认不自动全选，避免误重跑。`scripts/add-row-selector.js` 可批量给「列表→图片」的页面插入该组件。
  - `settings.maxRows` / `settings.rowOffset`：试跑时只跑第 N 行起的最多 M 行（0 = 全部）；
    **勾选行执行时不受这两个限制**（选了几行就跑几行）。
  - `settings.image_ref`：逐行参考图。`{ from: '${stepList[1].rsp.items}', matchField: 'roles', nameField: 'name' }`
    会用当前行的角色名（支持多个）去匹配来源列表，**命中的角色图会作为图生图输入（多张时按 `image[]` 一次上传，最多 4 张）**，
    匹配不到图片时自动退化为文生图（`/images/generations`）。命中的角色会注入当前行，提示词可用
    `${item.character_names}` / `${item.character_descs}` / `${item.characters}` / `${item.reference_images}`。
- **漫画成品页（`comic-reader` 组件）**：把「最终成图」的画面按页排版，并把「分镜生成」的台词按
  `dialogue[].bubblePosition`（左上/右上/左下/右下/中上/底部）叠加成气泡；右上角「下载 ZIP」用 Electron 截屏
  分段拼接成长图（`AIFT_SKIP_SINGLE_INSTANCE=1` 可跳过单实例锁做并行调试）。
  - 台词渲染会自动去掉「角色名：」前缀；对话气泡带指向说话人的小三角（上排气泡三角朝下、下排朝上）；
  - 气泡可**拖动微调**；**尾巴可拖动**（沿上/下边缘左右移动）；**拖右下角可改宽高**，
    只横向拖动时高度自适应、纵向拖动才固定高度，文字放不下会自动缩小字号（最小 10px）；
  - 位置/尺寸/尾巴位置按「作品 + 标题」存到 localStorage，工具栏可「重置气泡位置」；
  - 支持**切换排版**：`grid` 一页多格 / `single` 一页一格 / `strip` 拼接条漫 / `mosaic` 拼贴整页；
    「一页一格」固定单列，画面按 `page,panel` 排序；
  - **导出 ZIP**：一页一张 PNG（分段截屏拼接，支持超长页），按 `filePattern` 命名
    （默认 `{index:3}-{label}` → `001-第1页.png`，支持 `{index}`/`{index:3}`/`{page}`/`{label}`），
    打包成 `.zip` 保存（纯 JS store 模式，无第三方依赖）。
  - 分镜行会自动补齐 `${item.dialogue_text}` / `${item.bubble_positions}` / `${item.dialogue_types}` 供第四步提示词使用。
- **数据目录有独占锁**：应用运行时 `<数据目录>/ai-free-tools.db.lock` 存在，脚本/迁移会拒绝执行并提示先关闭应用，
  避免 sql.js（整库读入内存、整库写回）被两个进程互相覆盖。
- **执行健壮性**：
  - 请求超时：文本 180s、图片 300s（`AIFT_TEXT_TIMEOUT_MS` / `AIFT_IMAGE_TIMEOUT_MS` 可调），超时会失败并写清原因；
  - 图片步骤**逐行落库**：每生成一张就更新 `images / rsp_data / message`，中途关闭应用也不会丢掉已生成的图；
  - 应用启动时把遗留的 `running` 步骤标记为失败（「上次执行被中断」），并按步骤状态重算作品状态；
  - **禁止同一步骤并发执行**：步骤处于 `running` 时再次点击会被拒绝（避免重复扣费、结果互相覆盖）；
  - **图片结果按行合并**：只跑部分行不会清掉其它行（跑第 3、4 格不会再把 1、2 格弄丢），
    合并键与「保留已有图」一致（`name` 或 `page,panel`，可用 `settings.row_key` 指定）；
  - 勾选 ≥3 行时执行按钮会二次确认，并提示本次处理行数与耗时/费用。
  - **前端不受 5 分钟限制**：`run / reset` 请求不设 axios 超时（其它请求仍 300s），
    长任务期间页面每 5 秒轮询步骤状态与进度，结束自动刷新出结果；请求被中断也会继续轮询。
- 兼容老数据：页面 `execution` 为空时，执行配置回落到步骤字段（迁移过来的旧工作流仍可运行）。

### 3.4 作品（作品管理）

- 作品绑定一个工作流，进入后按步骤流转：步骤条可切换、每步展示对应页面、执行后落库。
- 支持重置（级联清空后续步骤）、作品参数编辑、页面上下文查看。

## 4. 数据解析规则（对齐旧项目）

占位符 `${...}` 在页面上下文 / 提示词 / 接口参数中通用，详见 [docs/expression.md](docs/expression.md)。

```text
${gb.name}                     → 作品名称（同时支持裸写 ${name}，回退到 gb）
${gb.item.name}                → 当前迭代项字段
${stepList[0].rsp.content}     → 第 1 个成功步骤的提取结果
${stepList[1].rsp.items[2].name}
${resp.choices[0].message.content}  → 接口输出提取（仅输出参数取值时）
${item.xxx} / ${scene.xxx}     → 等价 ${gb.item.xxx}
${prev_output} / ${prev_image} → 上一步文本 / 首图
${step_N_output} / ${step_N_image(s)} / ${step_N_all}
```

取值行为：

- 整串只有一个占位符 → 返回原始类型（数组/对象/数字/布尔不做字符串化）；
- 文本中嵌入占位符 → 字符串替换，对象/数组以 JSON 文本嵌入；
- 未命中的占位符**保留原样**（便于暴露配置问题）。

## 5. 接口管理（Apifox 风格）

- 左侧接口列表（搜索 + 格式标签 + 入/出参数数），右侧参数表；
- 输入/输出分成两个 Tab，避免同一张表混排；
- 参数列：`参数名 | 参数值/取值 | 类型 | 文件类型 | 说明 | 必填 | 操作`，容器参数可挂子变量；
- **文件类型**（`none / file / url / base64`）：
  - **输入**：先探测解析出来的值实际是哪种形态，再动态转换成参数声明的类型；
  - **输出**：只要声明了文件类型（或探测到文件），统一转存到项目级存储，并以本地链接形式返回；
- 端点格式（`openai_chat / openai_completion / openai_responses / anthropic / gemini / openai_image`）
  可一键套用参数模板；调试 Tab 可预览报文与真实调用。

存储适配器见 `server/core/storage/`：`local`（默认）/ `minio`（S3 SigV4）/ `qiniu`，
在「项目设置 → 存储配置」切换，接口统一走 `putFile`，新增存储只需注册一个适配器。

## 6. 目录结构

```
ai-free-tools/
├─ electron/
│  ├─ main.js              # 主进程：启动内嵌服务、创建窗口、菜单
│  └─ preload.cjs          # 暴露 window.aift.apiBase 等最小能力
├─ server/
│  ├─ index.js             # Express 服务（路由 / 静态 /files）
│  ├─ db/                  # sql.js 封装、schema、种子数据
│  ├─ core/
│  │  ├─ resolver.js       # 模板解析引擎（${...}）
│  │  ├─ endpointFormats.js# 端点格式注册表
│  │  ├─ interfaceRunner.js# 报文构造 / 调用 / 输出提取（含文件转换）
│  │  ├─ fileConvert.js    # file/url/base64 互转
│  │  ├─ storage/          # 存储适配器（local/minio/qiniu）
│  │  ├─ pageContext.js    # 页面上下文构建
│  │  ├─ workflowEngine.js # 步骤执行引擎
│  │  └─ componentRegistry.js # 内置组件元数据
│  └─ routes/              # works/workflows/pages/components/models/interfaces/assets/settings/files
├─ renderer/
│  ├─ index.html
│  └─ src/
│     ├─ views/            # 各管理页
│     ├─ components/
│     │  ├─ ui/            # 通用（JsonEditor/ImageViewer/...）
│     │  ├─ design/        # 页面设计器（调色板/画布/传参面板/上下文面板）
│     │  └─ runtime/       # 页面运行时 + 内置组件
│     └─ api/ utils/ styles/
├─ scripts/                # 初始化 / 迁移 / 自测 / 独立服务 / 数据体检
└─ docs/                   # 解析规则、组件映射、迁移说明、界面截图
```

## 7. 自测

```bash
npm run test        # 全部
npm run test:core   # 解析引擎 / 文件转换 / SQLite / 报文构造
npm run test:api    # HTTP 接口冒烟
npm run test:run    # 端到端：Mock 上游 → 执行三步 → 校验上下文与产物
npm run inspect -- --data-dir <dir>   # 打印某数据目录的模型/接口/工作流/作品概览
```

## 8. 从旧项目迁移

见 [docs/migration.md](docs/migration.md)：

```bash
node scripts/migrate-from-mysql.js --data-dir "<新数据目录>" \
  --mysql-host 127.0.0.1 --mysql-user root --mysql-password *** --mysql-database aitools
```

迁移前请先关闭桌面应用，避免 SQLite 文件被占用。
