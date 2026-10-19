import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import * as db from '../../lib/db';
import { getAlarmStatus, openBatterySettings, requestAlarmPermissions } from '../../lib/alarms';
import { speakBriefing, stopSpeaking } from '../../lib/briefing';
import { colors, gradients, priorityColor, radius, shadows } from '../../lib/theme';

export default function AlarmsScreen() {
  const { user, isGuest, signOut } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState({ notifications: true, exactAlarm: true });
  const [speaking, setSpeaking] = useState(false);

  const load = useCallback(async () => {
    setTasks(await db.listTasks());
    setStatus(await getAlarmStatus().catch(() => status));
  }, []);

  useEffect(() => {
    load();
    const unsub = db.subscribe(load);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => { unsub(); sub.remove(); };
  }, [load]);

  const upcoming = useMemo(
    () => tasks.filter((t) => !t.is_completed && t.alarm_enabled && new Date(t.due_date) > new Date())
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date)),
    [tasks]
  );

  async function testBriefing() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    try { await speakBriefing(upcoming[0]?.id, { repeat: 1 }); } finally { setSpeaking(false); }
  }

  function openRingScreen(taskId) {
    router.push({ pathname: '/alarm', params: { taskId: taskId || upcoming[0]?.id || '' } });
  }

  const ok = status.notifications && status.exactAlarm;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* Header with Title and User Profile */}
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.leafIcon}>⏰</Text>
              <Text style={styles.h1}>Voice Alarms</Text>
            </View>
            <Text style={styles.subtle}>Gentle exact alarms · voice briefings that wake you peacefully</Text>
          </View>

          <View style={styles.headerRight}>
            {isGuest && (
              <View style={styles.guestBadge}>
                <Text style={styles.guestText}>🌿 Guest</Text>
              </View>
            )}
            <Pressable
              onPress={() =>
                Alert.alert(
                  isGuest ? 'Guest Preview Mode' : 'Account Details',
                  isGuest
                    ? 'You are running in breezy demo mode. Alarms and briefing audio work right in your session.'
                    : `Signed in as ${user?.email}`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: isGuest ? 'Exit Demo' : 'Sign out', style: 'destructive', onPress: signOut },
                  ]
                )
              }
              hitSlop={10}
            >
              <View style={styles.avatar}>
                <Ionicons name="leaf-outline" size={20} color={colors.primaryDark} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Status card */}
        <View style={[styles.statusCard, shadows.card, { borderColor: ok ? colors.primary : '#FCA5A5' }]}>
          <View style={[styles.statusIconWrap, { backgroundColor: ok ? colors.primarySoft : '#FEE2E2' }]}>
            <Ionicons name={ok ? 'shield-checkmark' : 'warning'} size={24} color={ok ? colors.primaryDark : colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{ok ? 'Alarms are active' : 'Action needed'}</Text>
            <Text style={styles.statusSub}>
              {ok
                ? 'Notifications and exact alarms are ready.'
                : !status.notifications
                ? 'Notifications are blocked in settings.'
                : 'Exact alarm permission is off; alarms may be delayed.'}
            </Text>
          </View>
          {!ok && (
            <Pressable onPress={async () => setStatus(await requestAlarmPermissions())} style={styles.fixBtn}>
              <Text style={styles.fixText}>Fix</Text>
            </Pressable>
          )}
        </View>

        {/* Quick Alarm Ring UI Demonstration Button */}
        <View style={styles.demoButtonsRow}>
          <Pressable
            onPress={() => openRingScreen()}
            style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}
          >
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.testBtn, shadows.floating]}
            >
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.testText}>Test Ring UI</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={testBriefing}
            testID="test-briefing"
            style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}
          >
            <LinearGradient
              colors={speaking ? gradients.alarm : ['#FFFFFF', '#F0FDF4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.testBtn, styles.testBtnOutline, shadows.card]}
            >
              <Ionicons
                name={speaking ? 'stop' : 'volume-high'}
                size={18}
                color={speaking ? '#fff' : colors.primaryDark}
              />
              <Text style={[styles.testText, { color: speaking ? '#fff' : colors.primaryDark }]}>
                {speaking ? 'Stop Voice' : 'Hear Briefing'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Reliability tip */}
        <Pressable onPress={openBatterySettings} style={[styles.tip, shadows.card]}>
          <Ionicons name="battery-charging-outline" size={20} color={colors.primaryDark} />
          <Text style={styles.tipText}>For fully reliable wakeups, disable battery optimization for RemyndMe.</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        {/* Upcoming alarms list */}
        <Text style={styles.section}>Upcoming Alarms ({upcoming.length})</Text>
        {upcoming.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color={colors.subtle} />
            <Text style={styles.empty}>No upcoming alarms scheduled. Add a task with a future due time in Tasks.</Text>
          </View>
        )}
        {upcoming.map((t) => {
          const d = new Date(t.due_date);
          return (
            <Pressable
              key={t.id}
              style={[styles.item, shadows.card]}
              onPress={() => openRingScreen(t.id)}
            >
              <View style={[styles.stripe, { backgroundColor: priorityColor(t.priority) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.itemTime}>
                  {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.ringPreviewPill}>
                <Ionicons name="play-circle" size={18} color={colors.primaryDark} />
                <Text style={styles.ringPreviewText}>Ring</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  leafIcon: { fontSize: 26 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtle: { color: colors.muted, marginTop: 4, marginBottom: 18, fontSize: 13 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guestBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guestText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  demoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  statusSub: { color: colors.muted, marginTop: 2, fontSize: 13 },
  fixBtn: { backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  fixText: { color: '#fff', fontWeight: '800' },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  testBtnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  testText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: radius.md,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tipText: { color: colors.textSecondary, flex: 1, fontSize: 13, lineHeight: 18 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 12 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  empty: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  itemTime: { color: colors.muted, marginTop: 4, fontSize: 13, fontWeight: '500' },
  ringPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  ringPreviewText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
});
