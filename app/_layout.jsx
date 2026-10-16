import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import notifee from '@notifee/react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { syncAll } from '../lib/sync';
import { ensureChannel } from '../lib/alarms';
import { handleNotifeeEvent } from '../lib/alarmEvents';

function RootNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  // Auth gate
  useEffect(() => {
    if (!navState?.key || loading) return;
    const onLogin = segments[0] === 'login';
    if (!session && !onLogin) router.replace('/login');
    else if (session && onLogin) router.replace('/(tabs)/tasks');
  }, [session, loading, segments, navState?.key]);

  // Sync on sign-in, on resume, and periodically
  useEffect(() => {
    if (!session) return;
    syncAll();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncAll());
    const timer = setInterval(syncAll, 60000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [session?.user?.id]);

  // Alarm notification handling while the app is open / launched from an alarm
  useEffect(() => {
    if (!navState?.key) return;
    ensureChannel();
    const open = (taskId) => router.push({ pathname: '/alarm', params: { taskId } });
    const unsub = notifee.onForegroundEvent((e) => handleNotifeeEvent(e, open));
    notifee.getInitialNotification().then((initial) => {
      const id = initial?.notification?.data?.taskId;
      if (id && initial.notification.data.type?.startsWith('alarm')) open(id);
    });
    return unsub;
  }, [navState?.key]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="alarm" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <RootNav />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
