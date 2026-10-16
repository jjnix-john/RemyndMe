import * as Speech from 'expo-speech';
import * as db from './db';
import { syncAll } from './sync';

const SLOT_MS = 15 * 60 * 1000;
const rank = { high: 0, medium: 1, low: 2 };

const timeLabel = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const greeting = (h) => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function join(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Fetch active tasks for the alarm's time slot (+ the rest of today) and compose the spoken script. */
export async function buildBriefing(taskId) {
  // Best-effort fresh data; never block the alarm on the network.
  await Promise.race([syncAll().catch(() => {}), sleep(3000)]);

  const now = new Date();
  const all = (await db.listTasks()).filter((t) => !t.is_completed);
  const anchorTask = taskId ? all.find((t) => t.id === taskId) : null;
  const anchor = anchorTask ? new Date(anchorTask.due_date) : now;

  const slot = all
    .filter((t) => Math.abs(new Date(t.due_date).getTime() - anchor.getTime()) <= SLOT_MS)
    .sort((a, b) => rank[a.priority] - rank[b.priority]);
  if (anchorTask && !slot.find((t) => t.id === anchorTask.id)) slot.unshift(anchorTask);

  const slotIds = new Set(slot.map((t) => t.id));
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const later = all.filter(
    (t) => !slotIds.has(t.id) && new Date(t.due_date) > anchor && new Date(t.due_date) <= endOfDay
  );

  const parts = [`${greeting(now.getHours())}. It's ${timeLabel(now)}.`];
  if (slot.length === 0) {
    parts.push('You have no tasks due right now.');
  } else {
    parts.push(
      slot.length === 1
        ? `You have one task due: ${slot[0].title}${slot[0].priority === 'high' ? ', marked high priority' : ''}.`
        : `You have ${slot.length} tasks due: ${join(slot.map((t) => t.title))}.`
    );
  }
  if (later.length) {
    parts.push(`Later today you have ${later.length} more: ${join(later.slice(0, 5).map((t) => t.title))}.`);
  }
  return { text: parts.join(' '), slot, later, anchorTask };
}

let stopped = false;

/** Read the briefing aloud (expo-speech), repeated so it acts like a ringing alarm. */
export async function speakBriefing(taskId, { repeat = 2 } = {}) {
  stopped = false;
  const { text } = await buildBriefing(taskId);
  for (let i = 0; i < repeat && !stopped; i++) {
    await speakOnce(text);
    if (i < repeat - 1 && !stopped) await sleep(3000);
  }
  return text;
}

export function speakOnce(text) {
  return new Promise((resolve) => {
    const guard = setTimeout(resolve, 90000);
    const done = () => { clearTimeout(guard); resolve(); };
    Speech.speak(text, { rate: 0.95, pitch: 1.0, onDone: done, onStopped: done, onError: done });
  });
}

export function stopSpeaking() {
  stopped = true;
  Speech.stop();
}
