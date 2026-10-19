import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as db from '../lib/db';
import { buildBriefing, speakBriefing, stopSpeaking } from '../lib/briefing';
import { snoozeTask } from '../lib/alarms';
import { stopAlarm } from '../lib/alarmEvents';
import { colors, gradients, radius, shadows } from '../lib/theme';

/** Full-screen ring UI opened by tapping (or full-screen-intent launching from) an alarm notification. */
export default function AlarmScreen() {
  const { taskId } = useLocalSearchParams();
  const router = useRouter();
  const [briefing, setBriefing] = useState(null);
  const [now, setNow] = useState(new Date());

  // Live ticking clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    buildBriefing(taskId).then((b) => {
      if (alive) {
        setBriefing(b);
        speakBriefing(taskId, { repeat: 1 }).catch(() => {});
      }
    });
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [taskId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/tasks'));

  async function dismiss() {
    await stopAlarm();
    close();
  }

  async function snooze() {
    await stopAlarm();
    const task = await db.getTask(taskId);
    if (task) await snoozeTask(task, 10);
    close();
  }

  async function markDone() {
    const task = await db.getTask(taskId);
    if (task) await db.saveTask({ ...task, is_completed: true });
    await dismiss();
  }

  return (
    <LinearGradient colors={['#F0FDF4', '#DCFCE7', '#FFFFFF']} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        {/* Top close bar */}
        <View style={styles.topBar}>
          <Pressable onPress={dismiss} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>ALARM ACTIVE</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.center}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.ring, shadows.floating]}
          >
            <Ionicons name="alarm" size={54} color="#fff" />
          </LinearGradient>

          <Text style={styles.time}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
          <Text style={styles.dateSub}>
            {now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>

          <Text style={styles.title}>{briefing?.anchorTask?.title || 'Mindful Wakeup'}</Text>
          <Text style={styles.script}>{briefing?.text || 'Preparing your peaceful briefing…'}</Text>

          <Pressable onPress={() => speakBriefing(taskId, { repeat: 1 })} style={styles.replay}>
            <Ionicons name="volume-high" size={18} color={colors.primaryDark} />
            <Text style={styles.replayText}>Read briefing again</Text>
          </Pressable>
        </View>

        <View style={styles.buttons}>
          <Pressable onPress={snooze} style={[styles.btn, styles.secondaryBtn, shadows.card]}>
            <Text style={styles.secondaryBtnText}>Snooze 10m</Text>
          </Pressable>
          <Pressable onPress={markDone} style={[styles.btn, styles.secondaryBtn, shadows.card]}>
            <Text style={styles.secondaryBtnText}>Done</Text>
          </Pressable>
          <Pressable onPress={dismiss} style={{ flex: 1 }}>
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.btn, shadows.floating]}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>Dismiss</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  liveText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  ring: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center' },
  time: { color: colors.text, fontSize: 52, fontWeight: '200', marginTop: 18 },
  dateSub: { color: colors.muted, fontSize: 14, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  script: { color: colors.textSecondary, textAlign: 'center', marginTop: 14, lineHeight: 22, fontSize: 15 },
  replay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
    ...shadows.card,
  },
  replayText: { color: colors.primaryDark, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 10, padding: 20 },
  btn: { paddingVertical: 16, paddingHorizontal: 16, borderRadius: radius.md, alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  btnText: { fontWeight: '700', fontSize: 15 },
});
