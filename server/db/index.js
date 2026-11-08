/**
 * SQLite 访问层（sql.js / WASM 实现，无原生依赖，Electron 与纯 Node 均可运行）
 *
 * 用法：
 *   const db = await openDatabase({ dataDir });
 *   db.all('select * from work where status = ?', ['draft']);
 *   db.run('insert into work(...) values (?)', [1]);   // -> {changes, lastId}
 *
 * 写入后自动防抖落盘；close() 会强制 flush。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { SCHEMA } from './schema.js';

const require = createRequire(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

/** 进程是否存活（用于识别残留锁） */
function isProcessAlive(pid) {
  if (!pid || pid === process.pid) return pid === process.pid;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * 数据目录独占锁：sql.js 是「整库读入内存 + 整库写回」，两个进程同时开同一个库
 * 会互相覆盖。这里用 <db>.lock 文件互斥，进程崩溃后按 PID 判定为残留锁。
 */
function acquireLock(lockFile) {
  if (fs.existsSync(lockFile)) {
    let info = null;
    try {
      info = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    } catch (e) {
      info = null;
    }
    if (info && isProcessAlive(Number(info.pid))) {
      throw new Error(
        `数据目录正被进程 ${info.pid} 使用（AI Free Tools 可能正在运行）。请先关闭应用，再执行迁移或脚本。\n` +
          `如确认没有进程在用，可删除锁文件后重试：${lockFile}`,
      );
    }
    try {
      fs.unlinkSync(lockFile);
    } catch (e) {
      /* ignore */
    }
  }
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
}

function releaseLock(lockFile) {
  try {
    if (!fs.existsSync(lockFile)) return;
    const info = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (Number(info.pid) === process.pid) fs.unlinkSync(lockFile);
  } catch (e) {
    /* ignore */
  }
}

export async function openDatabase({ dataDir, file = 'ai-free-tools.db' }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.isAbsolute(file) ? file : path.join(dataDir, file);
  const lockFile = `${dbFile}.lock`;
  acquireLock(lockFile);

  let sqlite;
  try {
    // 显式传入 wasm 二进制，避免打包进 asar 后 locateFile 找不到文件
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
    const exists = fs.existsSync(dbFile);
    sqlite = exists ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();
    sqlite.run('PRAGMA foreign_keys = ON;');
    sqlite.run(SCHEMA);
  } catch (e) {
    releaseLock(lockFile);
    throw e;
  }

  let timer = null;
  let dirty = false;

  // 轻量迁移：老库缺列时补上（page.execution 用于「执行配置属于页面」）
  try {
    const cols = sqlite.exec("PRAGMA table_info('page')");
    const names = cols.length ? cols[0].values.map((row) => row[1]) : [];
    if (names.length && !names.includes('execution')) sqlite.run('ALTER TABLE page ADD COLUMN execution TEXT');
  } catch (e) {
    /* 建表语句已含该列或表尚不存在时忽略 */
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const data = Buffer.from(sqlite.export());
    const tmp = `${dbFile}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, dbFile);
    dirty = false;
  }

  function scheduleSave() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        flush();
      } catch (e) {
        console.error('[db] 落盘失败:', e);
      }
    }, 250);
  }

  function all(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    try {
      if (params && params.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function get(sql, params = []) {
    return all(sql, params)[0];
  }

  function run(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    try {
      if (params && params.length) stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = sqlite.getRowsModified();
    const lastId = all('SELECT last_insert_rowid() AS id')[0]?.id ?? null;
    scheduleSave();
    return { changes, lastId };
  }

  function exec(sql) {
    sqlite.run(sql);
    scheduleSave();
  }

  function transaction(fn) {
    sqlite.run('BEGIN');
    try {
      const result = fn();
      sqlite.run('COMMIT');
      scheduleSave();
      return result;
    } catch (e) {
      try {
        sqlite.run('ROLLBACK');
      } catch (_) {
        /* ignore */
      }
      throw e;
    }
  }

  function tableColumns(table) {
    return all(`PRAGMA table_info(${table})`).map((c) => c.name);
  }

  function ensureColumn(table, column, ddl) {
    if (!tableColumns(table).includes(column)) {
      sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      scheduleSave();
    }
  }

  return {
    file: dbFile,
    all,
    get,
    run,
    exec,
    transaction,
    ensureColumn,
    tableColumns,
    flush,
    close() {
      try {
        if (dirty) flush();
        sqlite.close();
      } finally {
        releaseLock(lockFile);
      }
    },
    raw: sqlite,
  };
}

/* ---------------- JSON 字段辅助 ---------------- */

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

export function now() {
  return nowIso();
}

export const db = { openDatabase, parseJson, now };
