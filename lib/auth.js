import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import * as db from './db';
import { cancelAllAlarms } from './alarms';

export const GUEST_USER = {
  id: 'guest-explorer',
  email: 'mindful.explorer@remyndme.breeze',
  user_metadata: {
    full_name: 'Mindful Explorer',
  },
};

export const GUEST_SESSION = {
  user: GUEST_USER,
  access_token: 'demo-guest-token',
};

const GUEST_STORAGE_KEY = 'remyndme_guest_session_active';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const guestActive = await AsyncStorage.getItem(GUEST_STORAGE_KEY);

        // If Supabase is configured and not in explicit guest mode, check real session
        if (isSupabaseConfigured && guestActive !== 'true') {
          const { data } = await supabase.auth.getSession();
          if (mounted) {
            setSession(data?.session ?? null);
            setLoading(false);
          }
        } else {
          // Without env or in guest mode, default to guest session so user can explore right away
          if (mounted) {
            setSession(GUEST_SESSION);
            setLoading(false);
          }
        }
      } catch (err) {
        if (mounted) {
          // Fallback to guest mode
          setSession(GUEST_SESSION);
          setLoading(false);
        }
      }
    }

    initAuth();

    if (isSupabaseConfigured) {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        if (mounted) setSession(s);
      });

      const appSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') supabase.auth.startAutoRefresh();
        else supabase.auth.stopAutoRefresh();
      });
      supabase.auth.startAutoRefresh();

      return () => {
        mounted = false;
        sub.subscription.unsubscribe();
        appSub.remove();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  // Upsert user profile if real Supabase session
  useEffect(() => {
    if (isSupabaseConfigured && session?.user && session.user.id !== GUEST_USER.id) {
      supabase
        .from('profiles')
        .upsert({ id: session.user.id, email: session.user.email, updated_at: new Date().toISOString() })
        .then(() => {});
    }
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isGuest: Boolean(session?.user?.id === GUEST_USER.id),
      isConfigured: isSupabaseConfigured,
      loading,
      continueAsGuest: async () => {
        await AsyncStorage.setItem(GUEST_STORAGE_KEY, 'true');
        setSession(GUEST_SESSION);
      },
      signIn: async (email, password) => {
        if (!isSupabaseConfigured) {
          return { error: { message: 'Supabase credentials are not configured in .env yet. Use Demo Mode to explore!' } };
        }
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        return supabase.auth.signInWithPassword({ email, password });
      },
      signUp: async (email, password) => {
        if (!isSupabaseConfigured) {
          return { error: { message: 'Supabase credentials are not configured in .env yet. Use Demo Mode to explore!' } };
        }
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        return supabase.auth.signUp({ email, password });
      },
      signOut: async () => {
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        if (isSupabaseConfigured) {
          await supabase.auth.signOut().catch(() => {});
        }
        setSession(null);
        await cancelAllAlarms().catch(() => {});
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
