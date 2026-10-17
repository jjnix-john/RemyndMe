import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as db from '../../lib/db';
import { getAlarmStatus, openBatterySettings, requestAlarmPermissions } from '../../lib/alarms';
import { speakBriefing, stopSpeaking } from '../../lib/briefing';
import { colors, gradients, priorityColor, radius, shadows } from '../../lib/theme';

export default function AlarmsScreen() {
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

  const ok = status.notifications && status.exactAlarm;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        <View style={styles.titleRow}>
          <Text style={styles.leafIcon}>⏰</Text>
          <Text style={styles.h1}>Voice Alarms</Text>
        </View>
        <Text style={styles.subtle}>Gentle exact alarms · voice briefings that wake you peacefully</Text>

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

        {/* Test voice briefing button */}
        <Pressable onPress={testBriefing} testID="test-briefing" style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
          <LinearGradient
            colors={speaking ? gradients.alarm : gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.testBtn, shadows.floating]}
          >
            <Ionicons name={speaking ? 'stop' : 'volume-high'} size={22} color="#fff" />
            <Text style={styles.testText}>{speaking ? 'Stop Voice Briefing' : 'Preview Voice Briefing'}</Text>
          </LinearGradient>
        </Pressable>

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
            <Text style={styles.empty}>No upcoming alarms scheduled. Add a task with a future due time.</Text>
          </View>
        )}
        {upcoming.map((t) => {
          const d = new Date(t.due_date);
          return (
            <View key={t.id} style={[styles.item, shadows.card]}>
              <View style={[styles.stripe, { backgroundColor: priorityColor(t.priority) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.itemTime}>
                  {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.alarmBadge}>
                <Ionicons name="alarm" size={20} color={colors.primaryDark} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  leafIcon: { fontSize: 26 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtle: { color: colors.muted, marginTop: 4, marginBottom: 18, fontSize: 13 },
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
    gap: 10,
    padding: 17,
    borderRadius: radius.md,
    marginTop: 16,
  },
  testText: { color: '#fff', fontWeight: '700', fontSize: 16 },
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
  alarmBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
