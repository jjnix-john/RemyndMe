import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as db from '../../lib/db';
import { getAlarmStatus, openBatterySettings, requestAlarmPermissions } from '../../lib/alarms';
import { speakBriefing, stopSpeaking } from '../../lib/briefing';
import { colors, gradients, priorityColor, radius } from '../../lib/theme';

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.h1}>Alarms</Text>
        <Text style={styles.subtle}>Native exact alarms · voice briefings</Text>

        <View style={[styles.statusCard, { borderColor: ok ? colors.accent : colors.danger }]}>
          <Ionicons name={ok ? 'shield-checkmark' : 'warning'} size={26} color={ok ? colors.accent : colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{ok ? 'Alarms are armed' : 'Action needed'}</Text>
            <Text style={styles.statusSub}>
              {ok ? 'Notifications and exact alarms are allowed.'
                : !status.notifications ? 'Notifications are blocked.' : 'Exact alarm permission is off, so alarms may be delayed.'}
            </Text>
          </View>
          {!ok && (
            <Pressable onPress={async () => setStatus(await requestAlarmPermissions())} style={styles.fixBtn}>
              <Text style={styles.fixText}>Fix</Text>
            </Pressable>
          )}
        </View>

        <Pressable onPress={testBriefing} testID="test-briefing">
          <LinearGradient colors={speaking ? gradients.alarm : gradients.primary} style={styles.testBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name={speaking ? 'stop' : 'volume-high'} size={22} color="#fff" />
            <Text style={styles.testText}>{speaking ? 'Stop briefing' : 'Preview voice briefing'}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={openBatterySettings} style={styles.tip}>
          <Ionicons name="battery-charging-outline" size={20} color={colors.medium} />
          <Text style={styles.tipText}>For fully reliable alarms, disable battery optimization for RemyndMe.</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Text style={styles.section}>Upcoming ({upcoming.length})</Text>
        {upcoming.length === 0 && <Text style={styles.empty}>No upcoming alarms. Add a task with a future due time.</Text>}
        {upcoming.map((t) => {
          const d = new Date(t.due_date);
          return (
            <View key={t.id} style={styles.item}>
              <View style={[styles.stripe, { backgroundColor: priorityColor(t.priority) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.itemTime}>
                  {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <Ionicons name="alarm" size={22} color={colors.primary} />
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 4, paddingTop: 8 },
  subtle: { color: colors.muted, paddingHorizontal: 4, marginBottom: 18 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, padding: 16, borderRadius: radius.md, borderWidth: 1 },
  statusTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  statusSub: { color: colors.muted, marginTop: 2, fontSize: 13 },
  fixBtn: { backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  fixText: { color: '#fff', fontWeight: '800' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: radius.md, marginTop: 14 },
  testText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, padding: 14, borderRadius: radius.md, marginTop: 14, borderWidth: 1, borderColor: colors.border },
  tipText: { color: colors.muted, flex: 1, fontSize: 13 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 26, marginBottom: 10, paddingHorizontal: 4 },
  empty: { color: colors.muted, paddingHorizontal: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, padding: 14, borderRadius: radius.md, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  itemTitle: { color: colors.text, fontWeight: '600', fontSize: 16 },
  itemTime: { color: colors.muted, marginTop: 3, fontSize: 13 },
});
