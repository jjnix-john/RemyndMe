import { supabase, isSupabaseConfigured } from './supabase';
import * as db from './db';
import { rescheduleAlarms } from './alarms';

let inflight = null;

async function push(table, userId) {
  const dirty = await db.getDirty(table);
  for (const row of dirty) {
    if (row.deleted) {
      const { error } = await supabase.from(table).delete().eq('id', row.id);
      if (error) throw error;
      await db.purge(table, row.id);
    } else {
      const { synced, deleted, ...payload } = row;
      const { error } = await supabase.from(table).upsert({ ...payload, user_id: payload.user_id || userId });
      if (error) throw error;
      await db.markSynced(table, row.id);
    }
  }
}

async function pull(table, order) {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: table === 'tasks' });
  if (error) throw error;
  await db.replaceFromRemote(table, data);
}

/** Push local changes, pull server state, then re-arm native alarms. Safe to call concurrently. */
export function syncAll() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (!isSupabaseConfigured) {
        await rescheduleAlarms(await db.listTasks());
        return { ok: true, reason: 'local-only' };
      }

      const { data } = await supabase.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId || userId === 'guest-explorer') {
        await rescheduleAlarms(await db.listTasks());
        return { ok: true, reason: 'guest-session' };
      }

      await push('notes', userId);
      await push('tasks', userId);
      await pull('notes', 'created_at');
      await pull('tasks', 'due_date');
      await rescheduleAlarms(await db.listTasks());
      return { ok: true };
    } catch (err) {
      console.warn('[sync] failed:', err?.message || err);
      return { ok: false, reason: err?.message || 'error' };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

