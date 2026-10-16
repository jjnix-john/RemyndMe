# RemyndMe: Technical & Architecture Documentation

## 1. System Overview & Monorepo Setup
RemyndMe is a multi-modal mobile productivity application built with **React Native (Expo)** using vanilla **JavaScript (JSX)** for the frontend, powered by a lightweight **Node.js / Express** backend. Both services run concurrently from a single root directory using a unified 1-command workflow (`npm start`).

*   **Client Framework:** Expo Router / React Native (JSX)
*   **Server Framework:** Node.js, Express, Cors, Dotenv
*   **Process Manager:** `concurrently` (runs server and expo client simultaneously)
*   **Database:** Supabase (PostgreSQL) + Local SQLite / WatermelonDB for offline-first caching

---

## 2. Supabase Database Schema (PostgreSQL)
The database uses three decoupled tables with Row-Level Security (RLS) enabled.

```sql
-- Profiles table linked to Supabase Auth
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Decoupled Notes table
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Decoupled Tasks table with scheduling and priority
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  is_completed BOOLEAN DEFAULT FALSE,
  alarm_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
```

---

## 3. Core Module Architecture

### Module A: Dedicated Notepad & Voice STT Pipeline
*   **UI:** Clean, minimalist text editor screen (`notes.jsx`) for managing typed or dictated notes.
*   **Voice Capture:** Utilizes `expo-av` to record microphone audio snippets.
*   **Transcription:** Audio is posted to the backend, which proxies to **Groq API (Whisper-Large-v3)** to return high-accuracy text transcripts saved directly into the Supabase `notes` table.

### Module B: Task Tracker with Integrated Calendar & Native Alarms
*   **UI:** Dedicated task management screen (`tasks.jsx`) featuring an integrated calendar component (`react-native-calendars`). Selecting a calendar date filters tasks due on that specific day.
*   **Alarms:** Implements native platform exact alarm scheduling (`SCHEDULE_EXACT_ALARM`) combined with an Android Foreground Service wrapper to ensure alarms ring reliably even when the app is backgrounded.

### Module C: AI Automation & Voice-Enabled Alarms (Production)
*   **AI Parser:** An Express backend route (`/api/parse-task`) sends raw voice transcript text to **Google Gemini 1.5 Flash API** using a strict JSON-forcing system prompt. It extracts `{ title, due_date, priority }` to auto-create database tasks.
*   **Voice Alarms:** When a task alarm triggers, the app fetches active tasks for that time slot, passes them to a Text-to-Speech service (or `expo-speech` fallback), and reads the tasks aloud as the alarm sound.

---

## 4. Environment Configuration (`.env`)
```env
PORT=4000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
```

---

## 5. AI Prompt Guidance

Below is the implementation prompt designed to guide your AI coding assistant based on these specs:

```text
Build the complete production-ready mobile application "RemyndMe" strictly adhering to the technical documentation provided above. Use React Native (Expo) with standard JavaScript (JSX) and Node.js.

ARCHITECTURE & SETUP SPECIFICATIONS:
1. Root Monorepo Setup:
   - Create a root `package.json` with scripts: "server" (node server.js), "expo" (npx expo start), and "start" (concurrently running both).
   - Create a root `server.js` file handling Express endpoints, CORS, dotenv, and AI API wrappers.
   - Use an `app/` folder structured with `.jsx` / `.js` files for Expo Router / navigation.

2. Database & Supabase:
   - Configure Supabase client connection and local offline caching (SQLite).
   - Implement the exact SQL schema provided for `profiles`, `notes` (decoupled note-taking), and `tasks` (decoupled task-tracking), complete with RLS policies.

3. Module Implementation (JSX):
   - Module 1 (Notepad): Standalone notepad screen for text editing and audio recording via `expo-av`. Send audio to Groq Whisper API for transcription and save to `notes`.
   - Module 2 (Task Tracker & Calendar): Standalone task manager with an integrated calendar (`react-native-calendars`) to filter tasks by date. Include priority sorting and completion checks.
   - Module 3 (Alarms): Native background alarm scheduling with Android Foreground Service support for exact alarms.

4. AI & Production Integration:
   - Implement backend endpoint `/api/parse-task` using Google Gemini 1.5 Flash API to parse raw text into clean JSON tasks ({ title, due_date, priority }) and insert into Supabase.
   - Configure alarm trigger handlers to fetch active tasks and invoke Text-to-Speech (expo-speech or cloud TTS) for voice-enabled alarm briefings.
   - Ensure all secrets are pulled safely from `.env`.
```