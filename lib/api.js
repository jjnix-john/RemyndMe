import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/** Resolve the Express backend URL: explicit API_URL > Expo dev host (LAN) > emulator loopback. */
export function getApiUrl() {
  const { apiUrl, apiPort } = Constants.expoConfig?.extra ?? {};
  if (apiUrl) return apiUrl.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
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
  const form = new FormData();
  form.append('audio', { uri, name: 'recording.m4a', type: 'audio/m4a' });
  const { text } = await request('/api/transcribe', { method: 'POST', body: form });
  return text;
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

/** Sends raw text to /api/parse-task (Gemini). The server inserts the tasks into Supabase. */
export async function parseTask(text) {
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
}
