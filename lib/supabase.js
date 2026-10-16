import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.startsWith('your_')) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_ANON_KEY missing. Configure them in .env and restart Expo.');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
