import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const rawExtra = Constants.expoConfig?.extra ?? {};
const supabaseUrl = typeof rawExtra.supabaseUrl === 'string' ? rawExtra.supabaseUrl.trim() : '';
const supabaseAnonKey = typeof rawExtra.supabaseAnonKey === 'string' ? rawExtra.supabaseAnonKey.trim() : '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.startsWith('your_') &&
  !supabaseUrl.includes('placeholder')
);

if (!isSupabaseConfigured) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_ANON_KEY not configured. Running in local/demo mode.');
}

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

