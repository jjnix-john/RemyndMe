import * as SQLite from 'expo-sqlite';

/**
 * Offline-first local cache (SQLite).
 * Every row carries `synced` (0 = pending push) and `deleted` (tombstone until pushed).
 */

const listeners = new Set();
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => { try { fn(); } catch {} });

let dbPromise;
function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('remyndme.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT,
          title TEXT NOT NULL,
          content TEXT,
          created_at TEXT NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0,
          deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT,
          title TEXT NOT NULL,
          due_date TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'medium',
          is_completed INTEGER NOT NULL DEFAULT 0,
          alarm_enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0,
          deleted INTEGER NOT NULL DEFAULT 0
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

const taskFromRow = (r) => ({ ...r, is_completed: !!r.is_completed, alarm_enabled: !!r.alarm_enabled });

/* --------------------------------- Notes --------------------------------- */
export async function listNotes() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM notes WHERE deleted = 0 ORDER BY created_at DESC');
}

export async function saveNote(n) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO notes (id, user_id, title, content, created_at, synced, deleted)
     VALUES (?, ?, ?, ?, ?, 0, 0)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, synced = 0, deleted = 0`,
    [n.id, n.user_id, n.title, n.content ?? '', n.created_at]
  );
  emit();
}

export async function removeNote(id) {
  const db = await getDb();
  await db.runAsync('UPDATE notes SET deleted = 1, synced = 0 WHERE id = ?', [id]);
  emit();
}

/* --------------------------------- Tasks --------------------------------- */
export async function listTasks() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM tasks WHERE deleted = 0 ORDER BY due_date ASC');
  return rows.map(taskFromRow);
}

export async function getTask(id) {
  const db = await getDb();
  const r = await db.getFirstAsync('SELECT * FROM tasks WHERE id = ? AND deleted = 0', [id]);
  return r ? taskFromRow(r) : null;
}

export async function saveTask(t) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tasks (id, user_id, title, due_date, priority, is_completed, alarm_enabled, created_at, synced, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, due_date = excluded.due_date,
       priority = excluded.priority, is_completed = excluded.is_completed,
       alarm_enabled = excluded.alarm_enabled, synced = 0, deleted = 0`,
    [t.id, t.user_id, t.title, t.due_date, t.priority, t.is_completed ? 1 : 0, t.alarm_enabled ? 1 : 0, t.created_at]
  );
  emit();
}

export async function removeTask(id) {
  const db = await getDb();
  await db.runAsync('UPDATE tasks SET deleted = 1, synced = 0 WHERE id = ?', [id]);
  emit();
}

/* ------------------------------ Sync helpers ------------------------------ */
const TABLES = {
  notes: ['id', 'user_id', 'title', 'content', 'created_at'],
  tasks: ['id', 'user_id', 'title', 'due_date', 'priority', 'is_completed', 'alarm_enabled', 'created_at'],
};

export async function getDirty(table) {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT * FROM ${table} WHERE synced = 0`);
  return table === 'tasks' ? rows.map(taskFromRow) : rows;
}

export async function markSynced(table, id) {
  const db = await getDb();
  await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id = ?`, [id]);
}

export async function purge(table, id) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

/** Replace cache with server truth, keeping rows that still have un-pushed local edits. */
export async function replaceFromRemote(table, remoteRows) {
  const db = await getDb();
  const cols = TABLES[table];
  await db.withTransactionAsync(async () => {
    const dirty = await db.getAllAsync(`SELECT id FROM ${table} WHERE synced = 0`);
    const dirtyIds = new Set(dirty.map((r) => r.id));
    const remoteIds = new Set();

    for (const row of remoteRows) {
      remoteIds.add(row.id);
      if (dirtyIds.has(row.id)) continue;
      const values = cols.map((c) => {
        const v = row[c];
        return typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null;
      });
      await db.runAsync(
        `INSERT OR REPLACE INTO ${table} (${cols.join(',')}, synced, deleted) VALUES (${cols.map(() => '?').join(',')}, 1, 0)`,
        values
      );
    }

    const local = await db.getAllAsync(`SELECT id FROM ${table} WHERE synced = 1`);
    for (const { id } of local) {
      if (!remoteIds.has(id)) await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
    }
  });
  emit();
}

export async function clearAll() {
  const db = await getDb();
  await db.execAsync('DELETE FROM notes; DELETE FROM tasks;');
  emit();
}
