# 从旧项目迁移（MySQL → SQLite）

旧项目把配置存在 MySQL（默认库名 `aitools`）。新项目使用单文件 SQLite，因此提供一次性迁移脚本。

## 1. 准备

1. **关闭正在运行的新项目**（Electron 会持有 SQLite 文件）；
2. 确认旧 MySQL 可连接（旧项目 `.env` 里有 `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE`）；
3. 确认新项目数据目录（**开发态与安装版是同一个目录**）：
   - Windows：`%APPDATA%\ai-free-tools\data`；
   - 也可以用 `AIFT_DATA_DIR` 指定别处；
   - 想先演练，可指向一个空目录。

> `scripts/run-server.js`、`scripts/inspect.js` 默认也读写这个目录，迁移完直接 `npm run dev` 就能看到数据。

## 2. 执行

```bash
# 环境变量方式（读取 MYSQL_*）
node scripts/migrate-from-mysql.js --data-dir "<新数据目录>"

# 或全部显式传入
node scripts/migrate-from-mysql.js --data-dir "<新数据目录>" \
  --mysql-host 127.0.0.1 --mysql-port 3306 \
  --mysql-user root --mysql-password *** --mysql-database aitools

# 清空目标表后重新导入
node scripts/migrate-from-mysql.js --data-dir "<新数据目录>" --truncate
```

执行完成后会打印各类数据条数。

## 3. 字段映射

| 旧表 | 新表 | 说明 |
|---|---|---|
| `model_config` | `model_config` | 字段完全一致：provider / model_type / format_type / model_name / base_url / api_key / is_relay / is_active / remark |
| `interface_config` | `interface_config` | `params` 递归补 `file_type: "none"`（迁移后可按需改成 file/url/base64） |
| `asset` | `asset` | key/value/description |
| `template` + `template_step` | `workflow` + **每个步骤一个页面** | 每个旧步骤生成一个独立页面（按输出类型选择列表/图片布局），模型/接口/提示词/输入输出写入该页面的 `execution`；工作流步骤只保存 `page_id` |
| `step_config` | 页面 `execution.settings.columns` | `input_columns/output_columns` 写入对应页面的执行配置，供列表组件渲染 |
| `work` | `work` | `template_id` → `workflow_id`，状态与内容保留 |
| `work_step_result` | `work_step` | 按旧 `step_order` 对齐，保留 req/rsp/raw_rsp/output/images |
| `work_character` / `work_step_item` | `work_artifact` | 有图片的记录转为产物 |
| `backend/generated_images` | `<数据目录>/files/images/` | 图片文件一并复制，URL 改写成 `/files/images/...`（不依赖旧服务） |
| `skill` / `template_step_skill` | — | 跳过（新架构用组件与接口承载） |

## 4. 迁移后核对

```bash
node scripts/inspect.js
# 每个步骤会显示 页面# / 模型# / 接口# / 输入→输出（模型与接口来自页面 execution）
```

如果数据是从旧版本新项目迁过来的（一个页面被多个步骤共用），可以再执行一次拆分：

```bash
node scripts/split-workflow-pages.js --dry   # 先看会拆成什么样
node scripts/split-workflow-pages.js         # 真正拆分
```

## 5. 已知差异

- 旧模板的每个步骤都会生成独立页面（按输出类型选择布局），建议到「页面管理 → 设计」按需调整组件；
- 旧 `step_config` 的 `input_type=composite` 等语义保留在页面 `execution` 里，
  若旧配置为空则按 `none` 处理；
- 旧「技能（function calling）」不再迁移，如有需要可用接口 + 组件自行实现；
- 迁移完成后再配置「项目设置 → 存储配置」（默认本地存储，可切 MinIO / 七牛）。
