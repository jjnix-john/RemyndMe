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
import { colors, gradients, radius } from '../lib/theme';

/** Full-screen ring UI opened by tapping (or full-screen-intent launching from) an alarm notification. */
export default function AlarmScreen() {
  const { taskId } = useLocalSearchParams();
  const router = useRouter();
  const [briefing, setBriefing] = useState(null);

  useEffect(() => {
    let alive = true;
    buildBriefing(taskId).then((b) => alive && setBriefing(b));
    return () => { alive = false; };
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
    <LinearGradient colors={['#1B0F2E', '#0B0B14']} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.center}>
          <LinearGradient colors={gradients.alarm} style={styles.ring}>
            <Ionicons name="alarm" size={56} color="#fff" />
          </LinearGradient>
          <Text style={styles.time}>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
          <Text style={styles.title}>{briefing?.anchorTask?.title || 'Your tasks'}</Text>
          <Text style={styles.script}>{briefing?.text || 'Preparing your briefing…'}</Text>

          <Pressable onPress={() => speakBriefing(taskId, { repeat: 1 })} style={styles.replay}>
            <Ionicons name="volume-high" size={18} color={colors.primary} />
            <Text style={styles.replayText}>Read again</Text>
          </Pressable>
        </View>

        <View style={styles.buttons}>
          <Pressable onPress={snooze} style={[styles.btn, { backgroundColor: colors.card }]}>
            <Text style={styles.btnText}>Snooze 10m</Text>
          </Pressable>
          <Pressable onPress={markDone} style={[styles.btn, { backgroundColor: colors.card }]}>
            <Text style={styles.btnText}>Done</Text>
          </Pressable>
          <Pressable onPress={dismiss} style={{ flex: 1 }}>
            <LinearGradient colors={gradients.alarm} style={styles.btn}><Text style={[styles.btnText, { color: '#fff' }]}>Dismiss</Text></LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  ring: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  time: { color: colors.text, fontSize: 56, fontWeight: '200', marginTop: 24 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  script: { color: colors.muted, textAlign: 'center', marginTop: 16, lineHeight: 22, fontSize: 15 },
  replay: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, backgroundColor: colors.primarySoft, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  replayText: { color: colors.primary, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 10, padding: 20 },
  btn: { paddingVertical: 16, paddingHorizontal: 16, borderRadius: radius.md, alignItems: 'center' },
  btnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
