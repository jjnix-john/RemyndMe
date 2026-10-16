# RemyndMe

Notes, tasks and voice alarms. React Native (Expo Router, JSX) + Node/Express + Supabase. See [remyndme_documentation.md](remyndme_documentation.md).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values.
3. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor (tables, RLS, profile trigger).
4. Build a **development build** (native modules: Notifee alarms, SQLite). Expo Go cannot run alarms.
   - `npm run android` (or `npm run ios`) once to compile and install the dev client.
5. `npm start` runs the Express server (`:4000`) and Expo together.

The app finds the backend through the Expo dev host. For a production server, set `API_URL` in `.env`.

## Layout

| Path | Purpose |
|---|---|
| `server.js` | Express: `/api/transcribe` (Groq Whisper-Large-v3), `/api/parse-task` (Gemini, inserts into Supabase), JWT-verified |
| `app/(tabs)/notes.jsx` | Notepad with `expo-av` voice dictation |
| `app/(tabs)/tasks.jsx` | Calendar-filtered tasks, priority sort, completion, AI/voice quick add |
| `app/(tabs)/alarms.jsx` | Permission status, upcoming alarms, voice briefing preview |
| `app/alarm.jsx` | Full-screen ring UI |
| `lib/db.js`, `lib/sync.js` | SQLite offline cache with push/pull sync to Supabase |
| `lib/alarms.js`, `lib/alarmEvents.js`, `lib/briefing.js` | Exact alarms, foreground service, TTS briefing |
| `index.js` | Registers Notifee background handlers before Expo Router |

## Alarm flow

1. A task alarm is armed with `AlarmManager.setExactAndAllowWhileIdle` (Notifee trigger, `SCHEDULE_EXACT_ALARM`).
2. On delivery (even when the app is closed), a headless handler promotes it to an Android Foreground Service.
3. The service builds a briefing from the SQLite cache (syncing first if online) and reads it with `expo-speech`.

## Notes

- Secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`) are only read by `server.js`; the client bundle only gets the Supabase URL and anon key.
- `GEMINI_MODEL` defaults to `gemini-1.5-flash` per the spec. Google has retired some 1.5 models, so the server falls back to `gemini-2.0-flash` on a 404. Set `GEMINI_MODEL` to pin one.
- Android 13+ needs the notification permission and, on 12+, the exact-alarm permission. The Alarms tab links to both.
