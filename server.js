require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const {
  PORT = 4000,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  GROQ_API_KEY,
  GEMINI_API_KEY,
  GEMINI_MODEL = 'gemini-1.5-flash',
} = process.env;

const GEMINI_FALLBACK_MODELS = ['gemini-2.0-flash'];
const PRIORITIES = ['low', 'medium', 'high'];

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, GROQ_API_KEY, GEMINI_API_KEY })) {
  if (!v || v.startsWith('your_')) console.warn(`[warn] ${k} is not configured in .env`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/* ----------------------------- Auth middleware ----------------------------- */
// Verifies the Supabase JWT and builds a user-scoped client so RLS stays enforced.
async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    // Allow demo / guest mode when running locally without .env or Supabase keys
    if (token === 'demo-guest-token' || !SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.startsWith('your_')) {
      req.user = { id: 'guest-explorer', email: 'mindful.explorer@remyndme.breeze' };
      req.sb = null;
      return next();
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' });

    req.user = data.user;
    req.sb = sb;
    next();
  } catch (err) {
    next(err);
  }
}

/* --------------------------------- Groq STT -------------------------------- */
async function transcribeWithGroq(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype || 'audio/m4a' }), filename || 'audio.m4a');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    const e = new Error(`Groq transcription failed (${res.status})`);
    e.detail = detail;
    e.status = 502;
    throw e;
  }
  const json = await res.json();
  return (json.text || '').trim();
}

/* ------------------------------- Gemini parser ------------------------------ */
function buildSystemPrompt(localNow, timezone) {
  return `You are a task extraction engine for a reminder app.
Convert the user's raw text (often a voice transcript) into tasks.

Current local date/time: ${localNow}
User timezone: ${timezone}

RULES:
- Respond with ONLY valid JSON, no markdown, no commentary.
- Schema: {"tasks":[{"title":string,"due_date":string,"priority":"low"|"medium"|"high"}]}
- "title": short, imperative, clean (max 80 chars). Remove filler words and time phrases.
- "due_date": full ISO 8601 timestamp WITH the user's UTC offset, resolved from relative phrases
  ("tomorrow", "next Friday", "in 2 hours"). If a date is given without a time, use 09:00 local.
  If no date at all, use the next sensible time (today at the next whole hour, or tomorrow 09:00 if past 20:00).
- "priority": "high" if urgent/important/ASAP/deadline, "low" if optional/whenever, otherwise "medium".
- If the text contains several distinct tasks, return one entry per task.
- If the text contains no actionable task, return {"tasks":[]}.`;
}

async function callGemini(model, systemPrompt, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const e = new Error(`Gemini request failed (${res.status})`);
    e.status = res.status;
    e.detail = await res.text();
    throw e;
  }
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function parseWithGemini(text, localNow, timezone) {
  const systemPrompt = buildSystemPrompt(localNow, timezone);
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL)];
  let lastErr;
  for (const model of models) {
    try {
      return await callGemini(model, systemPrompt, text);
    } catch (err) {
      lastErr = err;
      // Only fall through to the next model if this one is unavailable/retired.
      if (err.status !== 404) break;
    }
  }
  lastErr.status = 502;
  throw lastErr;
}

function extractJson(raw) {
  const cleaned = raw.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Model returned non-JSON output');
  }
}

function normalizeTasks(parsed) {
  const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => {
      const title = String(t?.title || '').trim().slice(0, 200);
      const due = new Date(t?.due_date);
      if (!title || Number.isNaN(due.getTime())) return null;
      const priority = PRIORITIES.includes(String(t?.priority).toLowerCase())
        ? String(t.priority).toLowerCase()
        : 'medium';
      return { title, due_date: due.toISOString(), priority };
    })
    .filter(Boolean);
}

function fallbackParseTask(text) {
  const lower = text.toLowerCase();
  const priority = lower.includes('urgent') || lower.includes('asap') || lower.includes('important')
    ? 'high'
    : lower.includes('someday') || lower.includes('maybe') || lower.includes('low')
    ? 'low'
    : 'medium';

  const target = new Date();
  target.setHours(target.getHours() + 2, 0, 0, 0);

  if (lower.includes('tomorrow')) {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else if (lower.includes('tonight')) {
    target.setHours(20, 0, 0, 0);
  }

  const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    target.setHours(hours, mins, 0, 0);
  }

  const inHoursMatch = lower.match(/in\s+(\d+)\s*h(?:our)?s?/i);
  if (inHoursMatch) {
    target.setTime(Date.now() + parseInt(inHoursMatch[1], 10) * 3600000);
  }
  const inMinsMatch = lower.match(/in\s+(\d+)\s*m(?:in|inute)?s?/i);
  if (inMinsMatch) {
    target.setTime(Date.now() + parseInt(inMinsMatch[1], 10) * 60000);
  }

  let cleanTitle = text
    .replace(/\b(tomorrow|tonight|urgent|asap|important)\b/gi, '')
    .replace(/(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '')
    .replace(/in\s+\d+\s*(?:hours?|hrs?|mins?|minutes?)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanTitle) cleanTitle = text.trim();

  return [
    {
      title: cleanTitle.slice(0, 100),
      due_date: target.toISOString(),
      priority,
    },
  ];
}

/* ---------------------------------- Routes --------------------------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Audio -> text (Groq Whisper-Large-v3, or demo fallback)
app.post('/api/transcribe', requireUser, upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded (field "audio")' });
    if (!GROQ_API_KEY || GROQ_API_KEY.startsWith('your_')) {
      const demoTranscript = `🎙️ Voice Note (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}): Mindful morning check-in & review tasks for today`;
      return res.json({ text: demoTranscript });
    }
    const text = await transcribeWithGroq(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ text });
  } catch (err) {
    next(err);
  }
});

// Raw text -> structured tasks (Gemini or heuristic fallback) -> inserted into Supabase `tasks` if available
app.post('/api/parse-task', requireUser, async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Field "text" is required' });
    if (text.length > 2000) return res.status(400).json({ error: 'Text too long (max 2000 chars)' });

    const timezone = String(req.body?.timezone || 'UTC');
    const localNow = String(req.body?.localNow || new Date().toISOString());

    let tasks;
    if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith('your_')) {
      tasks = fallbackParseTask(text);
    } else {
      const raw = await parseWithGemini(text, localNow, timezone);
      tasks = normalizeTasks(extractJson(raw));
    }
    if (!tasks.length) return res.status(422).json({ error: 'No actionable task found in text' });

    const rows = tasks.map((t) => ({ ...t, user_id: req.user.id, is_completed: false, alarm_enabled: true }));
    if (!req.sb) {
      // In local/demo mode without Supabase connected, return the structured tasks directly
      return res.json({ tasks: rows.map((r, i) => ({ ...r, id: `demo-task-${Date.now()}-${i}` })) });
    }
    const { data, error } = await req.sb.from('tasks').insert(rows).select();
    if (error) {
      const e = new Error(`Supabase insert failed: ${error.message}`);
      e.status = 500;
      throw e;
    }
    res.json({ tasks: data });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Error handling ----------------------------- */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message, err.detail || '');
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`RemyndMe API listening on http://0.0.0.0:${PORT}`));
