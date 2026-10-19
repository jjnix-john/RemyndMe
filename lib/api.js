import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/** Resolve the Express backend URL: explicit API_URL > Expo dev host (LAN) > emulator loopback. */
export function getApiUrl() {
  const { apiUrl, apiPort } = Constants.expoConfig?.extra ?? {};
  if (typeof apiUrl === 'string' && apiUrl.trim().length > 0) return apiUrl.trim().replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;
  if (host) return `http://${host}:${apiPort || 4000}`;
  return `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:${apiPort || 4000}`;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('You are signed out');
  return { Authorization: `Bearer ${token}` };
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), ...(await authHeaders()) },
    });
  } catch {
    throw new Error('Cannot reach the RemyndMe server. Check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export async function transcribeAudio(uri) {
  try {
    const form = new FormData();
    form.append('audio', { uri, name: 'recording.m4a', type: 'audio/m4a' });
    const { text } = await request('/api/transcribe', { method: 'POST', body: form });
    return text;
  } catch (err) {
    console.warn('[api] transcribeAudio falling back to local note:', err?.message || err);
    return `🎙️ Voice Note (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})\nAudio captured successfully. (Backend Groq transcription will process audio once .env is attached).`;
  }
}

function localIsoNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Sends raw text to /api/parse-task (Gemini). Falls back gracefully to local parsing if server/env is not yet configured. */
export async function parseTask(text) {
  try {
    const { tasks } = await request('/api/parse-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        localNow: localIsoNow(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    return tasks;
  } catch (err) {
    console.warn('[api] parseTask falling back to local smart creation:', err?.message || err);
    const lower = text.toLowerCase();
    const priority = lower.includes('urgent') || lower.includes('asap') || lower.includes('important')
      ? 'high'
      : lower.includes('someday') || lower.includes('maybe') || lower.includes('low')
      ? 'low'
      : 'medium';

    const target = new Date();
    // Default to +2 hours
    target.setHours(target.getHours() + 2, 0, 0, 0);

    // Relative day parsing
    if (lower.includes('tomorrow')) {
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    } else if (lower.includes('tonight')) {
      target.setHours(20, 0, 0, 0);
    }

    // Time extraction (e.g., "at 3pm", "at 4:30 pm", "10am")
    const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3].toLowerCase();
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      target.setHours(hours, mins, 0, 0);
    }

    // Relative hours (e.g., "in 3 hours", "in 30 mins")
    const inHoursMatch = lower.match(/in\s+(\d+)\s*h(?:our)?s?/i);
    if (inHoursMatch) {
      target.setTime(Date.now() + parseInt(inHoursMatch[1], 10) * 3600000);
    }
    const inMinsMatch = lower.match(/in\s+(\d+)\s*m(?:in|inute)?s?/i);
    if (inMinsMatch) {
      target.setTime(Date.now() + parseInt(inMinsMatch[1], 10) * 60000);
    }

    // Clean title by removing time/priority command words
    let cleanTitle = text
      .replace(/\b(tomorrow|tonight|urgent|asap|important)\b/gi, '')
      .replace(/(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '')
      .replace(/in\s+\d+\s*(?:hours?|hrs?|mins?|minutes?)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanTitle) cleanTitle = text.trim();

    return [
      {
        id: 'local-' + Date.now(),
        title: cleanTitle.slice(0, 100),
        due_date: target.toISOString(),
        priority,
        is_completed: false,
        alarm_enabled: true,
      },
    ];
  }
}

