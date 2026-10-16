import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import * as db from './db';
import { cancelAllAlarms } from './alarms';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    // Keep token refresh in step with app lifecycle (recommended for React Native).
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();

    return () => {
      sub.subscription.unsubscribe();
      appSub.remove();
    };
  }, []);

  // Make sure the profile row exists (the DB trigger normally creates it).
  useEffect(() => {
    if (session?.user) {
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
      loading,
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signUp: (email, password) => supabase.auth.signUp({ email, password }),
      signOut: async () => {
        await supabase.auth.signOut();
        await cancelAllAlarms().catch(() => {});
        await db.clearAll();
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
