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
import { PRIORITY_RANK, colors, gradients, priorityColor, radius } from '../../lib/theme';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const timeStr = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const PRIORITIES = ['low', 'medium', 'high'];

const calendarTheme = {
  calendarBackground: colors.card, backgroundColor: colors.card,
  textSectionTitleColor: colors.muted, dayTextColor: colors.text, todayTextColor: colors.accent,
  monthTextColor: colors.text, arrowColor: colors.primary, textDisabledColor: '#4a4a63',
  selectedDayBackgroundColor: colors.primary, selectedDayTextColor: '#fff',
  textMonthFontWeight: '800', textDayFontWeight: '500', textDayHeaderFontWeight: '600',
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

  // Ask for exact-alarm permission once, the first time the screen is shown.
  useEffect(() => {
    getAlarmStatus().then((s) => { if (!s.notifications || !s.exactAlarm) requestAlarmPermissions({ openSettings: false }); }).catch(() => {});
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
    m[selected] = { ...(m[selected] || {}), selected: true };
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
    due.setMinutes(0, 0, 0);
    if (!showAll) {
      const [y, m, d] = selected.split('-').map(Number);
      due.setFullYear(y, m - 1, d);
    }
    setEditing({ id: Crypto.randomUUID(), user_id: user.id, title: '', due_date: due.toISOString(), priority: 'medium', is_completed: false, alarm_enabled: true, created_at: new Date().toISOString(), isNew: true });
  };

  async function smartAdd(text) {
    if (!text.trim()) return;
    setSmartBusy(true);
    try {
      const created = await parseTask(text.trim());
      setSmartText('');
      await syncAll();
      if (created?.[0]) setSelected(dayKey(created[0].due_date));
      setShowAll(false);
    } catch (e) {
      Alert.alert('Could not add task', e.message);
    } finally {
      setSmartBusy(false);
    }
  }

  async function micPress() {
    if (rec.isRecording) {
      const text = await rec.stop();
      if (text) { setSmartText(text); await smartAdd(text); }
    } else {
      await rec.start();
    }
  }

  async function refresh() { setRefreshing(true); await syncAll(); setRefreshing(false); }

  const busy = smartBusy || rec.isTranscribing;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.h1}>Tasks</Text>
              <Pressable onPress={() => { setSelected(dayKey(new Date())); setShowAll(false); }} style={styles.todayBtn}>
                <Text style={styles.todayText}>Today</Text>
              </Pressable>
            </View>

            {/* AI quick add */}
            <View style={styles.smart}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <TextInput
                style={styles.smartInput} placeholder='Try "dentist tomorrow 3pm, high priority"' placeholderTextColor={colors.muted}
                value={rec.isRecording ? `Recording… ${rec.seconds}s` : smartText} editable={!rec.isRecording && !busy}
                onChangeText={setSmartText} onSubmitEditing={() => smartAdd(smartText)} returnKeyType="send" testID="smart-input"
              />
              {busy ? <ActivityIndicator color={colors.primary} /> : (
                <>
                  {!!smartText && !rec.isRecording && (
                    <Pressable onPress={() => smartAdd(smartText)} hitSlop={8}><Ionicons name="arrow-up-circle" size={28} color={colors.primary} /></Pressable>
                  )}
                  <Pressable onPress={micPress} hitSlop={8} testID="task-mic">
                    <Ionicons name={rec.isRecording ? 'stop-circle' : 'mic-circle'} size={30} color={rec.isRecording ? colors.danger : colors.accent} />
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.calWrap}>
              <Calendar
                theme={calendarTheme} markingType="multi-dot" markedDates={marked} enableSwipeMonths
                onDayPress={(d) => { setSelected(d.dateString); setShowAll(false); }}
                style={{ borderRadius: radius.lg }}
              />
            </View>

            <View style={styles.filterRow}>
              <Text style={styles.sectionTitle}>
                {showAll ? 'All tasks' : new Date(`${selected}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              <Pressable onPress={() => setShowAll((v) => !v)} style={[styles.chip, showAll && styles.chipOn]}>
                <Text style={[styles.chipText, showAll && { color: '#fff' }]}>{showAll ? 'Showing all' : 'Show all'}</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>Nothing due{showAll ? '' : ' this day'}. Enjoy it, or add a task.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TaskRow task={item} onToggle={() => toggleDone(item)} onAlarm={() => toggleAlarm(item)} onEdit={() => setEditing(item)}
            onDelete={() => Alert.alert('Delete task?', item.title, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove(item) }])} />
        )}
      />

      <Pressable onPress={newTask} style={styles.fabWrap} testID="new-task-fab">
        <LinearGradient colors={gradients.primary} style={styles.fab}><Ionicons name="add" size={32} color="#fff" /></LinearGradient>
      </Pressable>

      {editing && <TaskEditor task={editing} onCancel={() => setEditing(null)} onSave={async (t) => { setEditing(null); await saveTask(t); }} />}
    </SafeAreaView>
  );
}

function TaskRow({ task, onToggle, onAlarm, onEdit, onDelete }) {
  const overdue = !task.is_completed && new Date(task.due_date) < new Date();
  return (
    <Pressable style={[styles.row, task.is_completed && { opacity: 0.5 }]} onPress={onEdit} onLongPress={onDelete}>
      <Pressable onPress={onToggle} hitSlop={10} testID={`task-check-${task.id}`}>
        <Ionicons name={task.is_completed ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={task.is_completed ? colors.accent : priorityColor(task.priority)} />
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, task.is_completed && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{task.title}</Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.rowTime, overdue && { color: colors.danger }]}>{timeStr(task.due_date)}{overdue ? ' · overdue' : ''}</Text>
          <View style={[styles.badge, { backgroundColor: `${priorityColor(task.priority)}26` }]}>
            <Text style={[styles.badgeText, { color: priorityColor(task.priority) }]}>{task.priority}</Text>
          </View>
        </View>
      </View>
      <Pressable onPress={onAlarm} hitSlop={10}>
        <Ionicons name={task.alarm_enabled ? 'notifications' : 'notifications-off-outline'} size={22} color={task.alarm_enabled ? colors.primary : colors.muted} />
      </Pressable>
    </Pressable>
  );
}

function TaskEditor({ task, onCancel, onSave }) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(new Date(task.due_date));
  const [priority, setPriority] = useState(task.priority);
  const [alarm, setAlarm] = useState(task.alarm_enabled);

  function pickAndroid() {
    DateTimePickerAndroid.open({
      value: due, mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const base = new Date(d);
        base.setHours(due.getHours(), due.getMinutes());
        DateTimePickerAndroid.open({
          value: base, mode: 'time',
          onChange: (e2, t) => { if (e2.type === 'set' && t) setDue(t); },
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
          <Text style={styles.sheetTitle}>{task.isNew ? 'New task' : 'Edit task'}</Text>
          <TextInput style={styles.sheetInput} placeholder="What needs doing?" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} autoFocus={task.isNew} testID="task-title-input" />

          <Text style={styles.label}>Due</Text>
          {Platform.OS === 'android' ? (
            <Pressable style={styles.dateBtn} onPress={pickAndroid}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.dateText}>{due.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
            </Pressable>
          ) : (
            <DateTimePicker value={due} mode="datetime" display="compact" themeVariant="dark" onChange={(_, d) => d && setDue(d)} style={{ alignSelf: 'flex-start' }} />
          )}

          <Text style={styles.label}>Priority</Text>
          <View style={styles.segment}>
            {PRIORITIES.map((p) => (
              <Pressable key={p} onPress={() => setPriority(p)} style={[styles.segItem, priority === p && { backgroundColor: `${priorityColor(p)}2E`, borderColor: priorityColor(p) }]}>
                <Text style={[styles.segText, priority === p && { color: priorityColor(p) }]}>{p}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchTitle}>Voice alarm</Text>
              <Text style={styles.switchSub}>Rings and reads your tasks aloud</Text>
            </View>
            <Switch value={alarm} onValueChange={setAlarm} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.actionBtn, { backgroundColor: colors.card }]}><Text style={styles.actionText}>Cancel</Text></Pressable>
            <Pressable onPress={submit} style={{ flex: 1 }} testID="task-save">
              <LinearGradient colors={gradients.primary} style={styles.actionBtn}><Text style={[styles.actionText, { color: '#fff' }]}>Save</Text></LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  todayBtn: { backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  todayText: { color: colors.primary, fontWeight: '700' },
  smart: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md,
    marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border,
  },
  smartInput: { flex: 1, color: colors.text, paddingVertical: 13, fontSize: 14 },
  calWrap: { marginHorizontal: 16, marginTop: 14, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  chip: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, marginHorizontal: 16, marginBottom: 10,
    padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  rowTime: { color: colors.muted, fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  empty: { alignItems: 'center', marginTop: 30, gap: 10, paddingHorizontal: 40 },
  emptyText: { color: colors.muted, textAlign: 'center' },
  fabWrap: { position: 'absolute', right: 20, bottom: 24 },
  fab: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, borderTopWidth: 1, borderColor: colors.border },
  grab: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 14 },
  sheetInput: { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', marginTop: 18, marginBottom: 8, letterSpacing: 0.8 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  dateText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  segment: { flexDirection: 'row', gap: 10 },
  segItem: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  segText: { color: colors.muted, fontWeight: '700', textTransform: 'capitalize' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  switchTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  switchSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  actionBtn: { paddingVertical: 15, paddingHorizontal: 22, borderRadius: radius.md, alignItems: 'center' },
  actionText: { color: colors.text, fontWeight: '700', fontSize: 16 },
});
