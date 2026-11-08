/** 数据库结构（SQLite）：工作流、页面、作品、组件、接口、资产与文件。 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_setting (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS model_config (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  provider    TEXT DEFAULT 'openai',
  model_type  TEXT DEFAULT 'text',
  format_type TEXT,
  model_name  TEXT NOT NULL DEFAULT '',
  base_url    TEXT NOT NULL DEFAULT '',
  api_key     TEXT NOT NULL DEFAULT '',
  is_relay    INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  remark      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interface_config (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  format_type TEXT,
  params      TEXT,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  value       TEXT,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS component (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  group_name   TEXT DEFAULT '通用',
  icon         TEXT,
  description  TEXT,
  source       TEXT NOT NULL DEFAULT 'user',
  builtin_key  TEXT,
  props_schema TEXT,
  render_spec  TEXT,
  is_active    INTEGER DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS page (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  description    TEXT,
  layout         TEXT,
  context_config TEXT,
  execution      TEXT,
  is_active      INTEGER DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT,
  type          TEXT DEFAULT 'comic',
  steps         TEXT,
  variable_mapping TEXT,
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  type         TEXT DEFAULT 'comic',
  workflow_id  INTEGER,
  status       TEXT DEFAULT 'draft',
  params       TEXT,
  content      TEXT,
  source_url   TEXT,
  keywords     TEXT,
  remark       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_step (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id     INTEGER NOT NULL,
  step_order  INTEGER NOT NULL,
  page_id     INTEGER,
  name        TEXT,
  status      TEXT DEFAULT 'pending',
  inputs      TEXT,
  context     TEXT,
  req_data    TEXT,
  rsp_data    TEXT,
  raw_rsp     TEXT,
  output      TEXT,
  images      TEXT,
  message     TEXT,
  started_at  TEXT,
  finished_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_artifact (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id     INTEGER NOT NULL,
  step_order  INTEGER,
  name        TEXT,
  type        TEXT,
  url         TEXT,
  storage     TEXT,
  storage_key TEXT,
  mime        TEXT,
  size        INTEGER,
  meta        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_object (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  storage    TEXT NOT NULL,
  key        TEXT NOT NULL,
  url        TEXT,
  path       TEXT,
  mime       TEXT,
  size       INTEGER,
  sha1       TEXT,
  origin     TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_status      ON work(status);
CREATE INDEX IF NOT EXISTS idx_work_workflow    ON work(workflow_id);
CREATE INDEX IF NOT EXISTS idx_work_step_work   ON work_step(work_id, step_order);
CREATE INDEX IF NOT EXISTS idx_artifact_work    ON work_artifact(work_id);
CREATE INDEX IF NOT EXISTS idx_file_sha         ON file_object(sha1);
`;
