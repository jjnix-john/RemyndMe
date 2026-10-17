import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import * as db from '../../lib/db';
import { syncAll } from '../../lib/sync';
import { parseTask } from '../../lib/api';
import { scheduleTaskAlarm, cancelTaskAlarm, requestAlarmPermissions, getAlarmStatus } from '../../lib/alarms';
import { useRecorder } from '../../lib/useRecorder';
import { PRIORITY_RANK, colors, gradients, priorityColor, radius, shadows } from '../../lib/theme';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const timeStr = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const PRIORITIES = ['low', 'medium', 'high'];

const calendarTheme = {
  calendarBackground: '#FFFFFF',
  backgroundColor: '#FFFFFF',
  textSectionTitleColor: colors.muted,
  dayTextColor: colors.text,
  todayTextColor: colors.primaryDark,
  monthTextColor: colors.text,
  arrowColor: colors.primaryDark,
  textDisabledColor: '#C4D7CC',
  selectedDayBackgroundColor: colors.primary,
  selectedDayTextColor: '#FFFFFF',
  textMonthFontWeight: '800',
  textDayFontWeight: '600',
  textDayHeaderFontWeight: '700',
};

export default function TasksScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(dayKey(new Date()));
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(null);
  const [smartText, setSmartText] = useState('');
  const [smartBusy, setSmartBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const rec = useRecorder();

  const load = useCallback(async () => setTasks(await db.listTasks()), []);
  useEffect(() => { load(); return db.subscribe(load); }, [load]);

  // Ask for alarm permissions once on mount
  useEffect(() => {
    getAlarmStatus().then((s) => {
      if (!s.notifications || !s.exactAlarm) requestAlarmPermissions({ openSettings: false });
    }).catch(() => {});
  }, []);

  const marked = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (t.is_completed) continue;
      const k = dayKey(t.due_date);
      const dots = m[k]?.dots || [];
      if (!dots.find((d) => d.key === t.priority)) dots.push({ key: t.priority, color: priorityColor(t.priority) });
      m[k] = { dots };
    }
    m[selected] = {
      ...(m[selected] || {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return m;
  }, [tasks, selected]);

  const visible = useMemo(() => {
    const list = showAll ? tasks : tasks.filter((t) => dayKey(t.due_date) === selected);
    return [...list].sort((a, b) =>
      Number(a.is_completed) - Number(b.is_completed) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      new Date(a.due_date) - new Date(b.due_date)
    );
  }, [tasks, selected, showAll]);

  async function toggleDone(t) {
    const next = { ...t, is_completed: !t.is_completed };
    await db.saveTask(next);
    next.is_completed ? cancelTaskAlarm(t.id) : scheduleTaskAlarm(next);
    syncAll();
  }

  async function toggleAlarm(t) {
    const next = { ...t, alarm_enabled: !t.alarm_enabled };
    await db.saveTask(next);
    await scheduleTaskAlarm(next);
    syncAll();
  }

  async function saveTask(t) {
    await db.saveTask(t);
    await scheduleTaskAlarm(t);
    syncAll();
  }

  async function remove(t) {
    await db.removeTask(t.id);
    cancelTaskAlarm(t.id);
    syncAll();
  }

  const newTask = () => {
    const due = new Date(Date.now() + 60 * 60 * 1000);
    setEditing({
      id: Crypto.randomUUID(),
      user_id: user?.id || 'guest-explorer',
      title: '',
      due_date: due.toISOString(),
      priority: 'medium',
      is_completed: false,
      alarm_enabled: true,
      created_at: new Date().toISOString(),
      isNew: true,
    });
  };

  async function submitSmart(raw) {
    const input = (raw || smartText).trim();
    if (!input) return;
    setSmartBusy(true);
    try {
      const created = await parseTask(input);
      for (const t of created) {
        const full = {
          ...t,
          id: t.id || Crypto.randomUUID(),
          user_id: user?.id || 'guest-explorer',
          is_completed: false,
          alarm_enabled: t.alarm_enabled ?? true,
          created_at: new Date().toISOString(),
        };
        await db.saveTask(full);
        await scheduleTaskAlarm(full);
      }
      setSmartText('');
      syncAll();
    } catch (e) {
      Alert.alert('Smart Task', e.message);
    } finally {
      setSmartBusy(false);
    }
  }

  async function voiceSmart() {
    if (rec.isRecording) {
      const text = await rec.stop();
      if (text) submitSmart(text);
    } else {
      await rec.start();
    }
  }

  async function refresh() {
    setRefreshing(true);
    await syncAll();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      {/* Mindful Tasks Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.leafIcon}>🌿</Text>
            <Text style={styles.h1}>Tasks</Text>
          </View>
          <Text style={styles.subtle}>Peaceful focus · voice alarm reminders</Text>
        </View>
        <Pressable
          onPress={() => setSelected(dayKey(new Date()))}
          style={({ pressed }) => [styles.todayBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.todayText}>🌱 Today</Text>
        </Pressable>
      </View>

      {/* Smart Natural Language Task Bar */}
      <View style={styles.smart}>
        <Ionicons name="sparkles" size={18} color={colors.primaryDark} />
        <TextInput
          style={styles.smartInput}
          placeholder="Type or dictate a task (e.g. 'Matcha break at 3pm')…"
          placeholderTextColor={colors.muted}
          value={smartText}
          onChangeText={setSmartText}
          onSubmitEditing={() => submitSmart()}
          returnKeyType="done"
        />
        {smartBusy ? (
          <ActivityIndicator color={colors.primaryDark} size="small" />
        ) : (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {!!smartText.trim() && (
              <Pressable onPress={() => submitSmart()} hitSlop={8}>
                <Ionicons name="arrow-up-circle" size={26} color={colors.primaryDark} />
              </Pressable>
            )}
            <Pressable onPress={voiceSmart} disabled={rec.isTranscribing} hitSlop={8}>
              <Ionicons
                name={rec.isRecording ? 'stop-circle' : 'mic-outline'}
                size={24}
                color={rec.isRecording ? colors.danger : colors.primaryDark}
              />
            </Pressable>
          </View>
        )}
      </View>

      {/* Fresh White & Emerald Calendar */}
      <View style={styles.calWrap}>
        <Calendar
          current={selected}
          onDayPress={(d) => setSelected(d.dateString)}
          markingType="multi-dot"
          markedDates={marked}
          theme={calendarTheme}
          enableSwipeMonths
        />
      </View>

      {/* Section Filter Header */}
      <View style={styles.filterRow}>
        <Text style={styles.sectionTitle}>
          {showAll ? 'All Scheduled Tasks' : `Tasks for ${selected === dayKey(new Date()) ? 'Today' : selected}`}
        </Text>
        <Pressable
          onPress={() => setShowAll((s) => !s)}
          style={[styles.chip, showAll && styles.chipOn]}
        >
          <Text style={[styles.chipText, showAll && styles.chipOnText]}>
            {showAll ? 'Show Selected Day' : 'View All'}
          </Text>
        </Pressable>
      </View>

      {/* Task Items List */}
      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 150 }}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="checkmark-done" size={36} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Nothing due right now</Text>
            <Text style={styles.emptyText}>
              Enjoy the calm moment, or create a mindful task using the input or + button below.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.is_completed && styles.rowCompleted]}
            onPress={() => setEditing(item)}
          >
            {/* Mindful Custom Checkbox */}
            <Pressable onPress={() => toggleDone(item)} hitSlop={12} style={styles.checkWrap}>
              <View
                style={[
                  styles.checkbox,
                  item.is_completed && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {item.is_completed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
            </Pressable>

            {/* Task Info */}
            <View style={styles.rowBody}>
              <Text
                style={[
                  styles.rowTitle,
                  item.is_completed && { textDecorationLine: 'line-through', color: colors.muted },
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <View style={styles.rowMeta}>
                <Ionicons name="time-outline" size={14} color={colors.muted} />
                <Text style={styles.rowTime}>{timeStr(item.due_date)}</Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        item.priority === 'high'
                          ? '#FEE2E2'
                          : item.priority === 'low'
                          ? '#D1FAE5'
                          : '#FEF3C7',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color:
                          item.priority === 'high'
                            ? colors.danger
                            : item.priority === 'low'
                            ? colors.primaryDark
                            : '#D97706',
                      },
                    ]}
                  >
                    {item.priority}
                  </Text>
                </View>
              </View>
            </View>

            {/* Alarm bell toggle */}
            <Pressable onPress={() => toggleAlarm(item)} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons
                name={item.alarm_enabled ? 'alarm' : 'alarm-outline'}
                size={22}
                color={item.alarm_enabled ? colors.primaryDark : colors.subtle}
              />
            </Pressable>

            {/* Delete button */}
            <Pressable
              onPress={() =>
                Alert.alert('Delete task?', undefined, [
                  { text: 'Cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => remove(item) },
                ])
              }
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.subtle} />
            </Pressable>
          </Pressable>
        )}
      />

      {/* Floating Action Button */}
      <View style={styles.fabWrap}>
        <Pressable onPress={newTask} testID="new-task-fab" style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.fab, shadows.floating]}
          >
            <Ionicons name="add" size={32} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Task Editor Sheet */}
      {editing && (
        <TaskEditorSheet
          task={editing}
          onSave={async (t) => {
            await saveTask(t);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </SafeAreaView>
  );
}

function TaskEditorSheet({ task, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(new Date(task.due_date));
  const [priority, setPriority] = useState(task.priority || 'medium');
  const [alarm, setAlarm] = useState(task.alarm_enabled ?? true);

  function pickAndroid() {
    DateTimePickerAndroid.open({
      value: due,
      mode: 'date',
      onChange: (e1, d) => {
        if (e1.type !== 'set' || !d) return;
        const base = new Date(d);
        base.setHours(due.getHours(), due.getMinutes());
        DateTimePickerAndroid.open({
          value: base,
          mode: 'time',
          onChange: (e2, t) => {
            if (e2.type === 'set' && t) setDue(t);
          },
        });
      },
    });
  }

  function submit() {
    if (!title.trim()) return Alert.alert('Add a title');
    onSave({ ...task, title: title.trim(), due_date: due.toISOString(), priority, alarm_enabled: alarm });
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>{task.isNew ? '🌱 New Mindful Task' : '🌿 Edit Task'}</Text>
          <TextInput
            style={styles.sheetInput}
            placeholder="What needs mindful attention?"
            placeholderTextColor={colors.subtle}
            value={title}
            onChangeText={setTitle}
            autoFocus={task.isNew}
            testID="task-title-input"
          />

          <Text style={styles.label}>Scheduled Due Time</Text>
          {Platform.OS === 'android' ? (
            <Pressable style={styles.dateBtn} onPress={pickAndroid}>
              <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.dateText}>
                {due.toLocaleString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </Pressable>
          ) : (
            <DateTimePicker
              value={due}
              mode="datetime"
              display="compact"
              themeVariant="light"
              onChange={(_, d) => d && setDue(d)}
              style={{ alignSelf: 'flex-start' }}
            />
          )}

          <Text style={styles.label}>Priority</Text>
          <View style={styles.segment}>
            {PRIORITIES.map((p) => {
              const active = priority === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.segItem,
                    active && {
                      backgroundColor: p === 'high' ? '#FEE2E2' : p === 'low' ? '#D1FAE5' : '#FEF3C7',
                      borderColor: priorityColor(p),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segText,
                      active && {
                        color: p === 'high' ? colors.danger : p === 'low' ? colors.primaryDark : '#D97706',
                        fontWeight: '800',
                      },
                    ]}
                  >
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchTitle}>Voice Alarm</Text>
              <Text style={styles.switchSub}>Rings softly and reads briefing aloud</Text>
            </View>
            <Switch
              value={alarm}
              onValueChange={setAlarm}
              trackColor={{ true: colors.primary, false: colors.borderLight }}
              thumbColor={alarm ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.actionBtn, styles.cancelBtn]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={{ flex: 1 }} testID="task-save">
              <LinearGradient
                colors={gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.actionBtn, shadows.floating]}
              >
                <Text style={[styles.actionText, { color: '#fff' }]}>Save Task</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leafIcon: { fontSize: 24 },
  h1: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  subtle: { color: colors.muted, marginTop: 2, fontSize: 13, fontWeight: '500' },
  todayBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  todayText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  smart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  smartInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 14 },
  calWrap: {
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  chipOnText: { color: colors.primaryDark, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  rowCompleted: { opacity: 0.65, backgroundColor: '#FAFDFB' },
  checkWrap: { padding: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  rowTime: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  empty: { alignItems: 'center', marginTop: 40, gap: 10, paddingHorizontal: 36 },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 22, fontSize: 14 },
  fabWrap: { position: 'absolute', right: 20, bottom: 26 },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(18, 47, 34, 0.35)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 38,
    ...shadows.floating,
  },
  grab: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  sheetInput: {
    backgroundColor: '#F8FCF9',
    color: colors.text,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FCF9',
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  segment: { flexDirection: 'row', gap: 10 },
  segItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  segText: { color: colors.muted, fontWeight: '700', textTransform: 'capitalize' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  switchTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  switchSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  actionBtn: { paddingVertical: 16, paddingHorizontal: 22, borderRadius: radius.md, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#F4F9F5', borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 16 },
  actionText: { fontWeight: '700', fontSize: 16 },
});
