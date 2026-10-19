import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import * as db from '../../lib/db';
import { syncAll } from '../../lib/sync';
import { useRecorder } from '../../lib/useRecorder';
import { colors, gradients, radius, shadows } from '../../lib/theme';

const fmt = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const deriveTitle = (text) => {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 40)}…` : t || 'Untitled Note';
};

export default function NotesScreen() {
  const { user, isGuest, signOut } = useAuth();
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const rec = useRecorder();

  const load = useCallback(async () => setNotes(await db.listNotes()), []);
  useEffect(() => { load(); return db.subscribe(load); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? notes.filter((n) => n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)) : notes;
  }, [notes, query]);

  const newNote = () =>
    setEditing({ id: Crypto.randomUUID(), user_id: user?.id || 'guest-explorer', title: '', content: '', created_at: new Date().toISOString(), isNew: true });

  async function persist(note) {
    const body = (note.content || '').trim();
    const title = note.title.trim() || deriveTitle(body);
    if (!body && !note.title.trim()) return;
    await db.saveNote({ ...note, title, content: note.content });
    syncAll();
  }

  async function voiceNote() {
    if (rec.isRecording) {
      const text = await rec.stop();
      if (!text) return;
      const note = {
        id: Crypto.randomUUID(),
        user_id: user?.id || 'guest-explorer',
        title: deriveTitle(text),
        content: text,
        created_at: new Date().toISOString(),
      };
      await persist(note);
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
      {/* Mindful Header with breezy vibes */}
      <View style={styles.header}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.leafIcon}>🍃</Text>
            <Text style={styles.h1}>Notes</Text>
          </View>
          <Text style={styles.subtle}>
            {notes.length} {notes.length === 1 ? 'peaceful thought' : 'peaceful thoughts'} saved
          </Text>
        </View>

        <View style={styles.headerRight}>
          {isGuest && (
            <View style={styles.guestBadge}>
              <Text style={styles.guestText}>🌿 Guest Mode</Text>
            </View>
          )}
          <Pressable
            onPress={() =>
              Alert.alert(
                isGuest ? 'Guest Preview Mode' : 'Account Details',
                isGuest
                  ? 'You are running in breezy demo mode. All notes are saved safely in your local device cache.'
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

      {/* Floating Zen Pill Banner */}
      <View style={styles.zenPill}>
        <LinearGradient
          colors={gradients.breezyPill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.zenGradient}
        >
          <Ionicons name="sparkles" size={15} color={colors.primaryDark} />
          <Text style={styles.zenText}>Breathe deep & capture your floating ideas</Text>
        </LinearGradient>
      </View>

      {/* Floating Search Bar */}
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your notes & reflections…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Note Cards List */}
      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 150, gap: 14 }}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="leaf-outline" size={44} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Clear, serene canvas</Text>
            <Text style={styles.emptyText}>
              No notes found. Tap the plus button to jot down a gentle reflection, or tap the mic to speak freely.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setEditing(item)}>
            <View style={styles.cardTop}>
              <View style={styles.cardIndicator} />
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            {!!item.content && (
              <Text style={styles.cardBody} numberOfLines={3}>
                {item.content}
              </Text>
            )}
            <View style={styles.cardFooter}>
              <View style={styles.cardTag}>
                <Text style={styles.cardTagText}>🌱 Note</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.cardDate}>{fmt(item.created_at)}</Text>
                <Pressable
                  onPress={() =>
                    Alert.alert('Delete note?', 'Are you sure you want to remove this note?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          await db.removeNote(item.id);
                          syncAll();
                        },
                      },
                    ])
                  }
                  hitSlop={8}
                  style={{ padding: 2 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.subtle} />
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Recording status banner */}
      {(rec.isRecording || rec.isTranscribing) && (
        <View style={styles.recBanner}>
          {rec.isTranscribing ? (
            <ActivityIndicator color={colors.primaryDark} size="small" />
          ) : (
            <View style={styles.dot} />
          )}
          <Text style={styles.recText}>
            {rec.isTranscribing
              ? 'Processing voice note…'
              : `Listening gently ${String(Math.floor(rec.seconds / 60)).padStart(2, '0')}:${String(rec.seconds % 60).padStart(2, '0')} — tap mic to finish`}
          </Text>
        </View>
      )}

      {/* Floating Action Buttons */}
      <View style={styles.fabs}>
        <Pressable
          onPress={voiceNote}
          disabled={rec.isTranscribing}
          testID="voice-note-fab"
          style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
        >
          <LinearGradient
            colors={rec.isRecording ? gradients.alarm : ['#FFFFFF', '#F0FDF4']}
            style={[styles.fabSm, shadows.floating]}
          >
            <Ionicons
              name={rec.isRecording ? 'stop' : 'mic'}
              size={22}
              color={rec.isRecording ? '#fff' : colors.primaryDark}
            />
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={newNote}
          testID="new-note-fab"
          style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
        >
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

      {/* Note Editor Modal */}
      {editing && (
        <NoteEditor
          note={editing}
          onClose={async (note) => {
            await persist(note);
            setEditing(null);
          }}
          onDelete={async (id) => {
            await db.removeNote(id);
            syncAll();
            setEditing(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

function NoteEditor({ note, onClose, onDelete }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || '');
  const rec = useRecorder();
  const current = { ...note, title, content };

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const chars = content.length;

  async function toggleMic() {
    if (rec.isRecording) {
      const text = await rec.stop();
      if (text) setContent((c) => (c ? `${c.replace(/\s+$/, '')}\n${text}` : text));
    } else {
      await rec.start();
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={() => onClose(current)}>
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editorBar}>
            <Pressable onPress={() => onClose(current)} hitSlop={12} testID="editor-close">
              <View style={styles.iconCircle}>
                <Ionicons name="chevron-down" size={24} color={colors.text} />
              </View>
            </Pressable>

            <View style={styles.editorStatusPill}>
              <Text style={styles.editorStatus}>
                {rec.isTranscribing
                  ? 'Transcribing…'
                  : rec.isRecording
                  ? `● Listening ${rec.seconds}s`
                  : note.isNew
                  ? '🌿 Fresh Note'
                  : '🌿 Note'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {!note.isNew && (
                <Pressable
                  onPress={() =>
                    Alert.alert('Delete note?', 'This will permanently remove this note.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => onDelete(note.id) },
                    ])
                  }
                  hitSlop={8}
                >
                  <View style={[styles.iconCircle, { borderColor: '#FEE2E2' }]}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </View>
                </Pressable>
              )}

              <Pressable onPress={toggleMic} disabled={rec.isTranscribing} testID="editor-mic" hitSlop={8}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: rec.isRecording ? '#FEE2E2' : colors.primarySoft },
                  ]}
                >
                  {rec.isTranscribing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons
                      name={rec.isRecording ? 'stop-circle' : 'mic'}
                      size={20}
                      color={rec.isRecording ? colors.danger : colors.primaryDark}
                    />
                  )}
                </View>
              </Pressable>

              <Pressable
                onPress={() => onClose(current)}
                testID="editor-save"
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <LinearGradient
                  colors={gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.savePill}
                >
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  <Text style={styles.savePillText}>Save</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          <TextInput
            style={styles.titleInput}
            placeholder="Note title…"
            placeholderTextColor={colors.subtle}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.bodyInput}
            placeholder="Let your thoughts flow freely, or tap the mic to speak…"
            placeholderTextColor={colors.subtle}
            multiline
            textAlignVertical="top"
            value={content}
            onChangeText={setContent}
            autoFocus={note.isNew}
          />

          <View style={styles.statsBar}>
            <Text style={styles.statsText}>
              {words} {words === 1 ? 'word' : 'words'} · {chars} chars
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guestBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guestText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  zenPill: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  zenGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  zenText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  search: {
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
  searchInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  cardBody: { color: colors.textSecondary, marginTop: 8, lineHeight: 22, fontSize: 14 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  cardTag: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  cardTagText: { color: colors.primaryDark, fontSize: 11, fontWeight: '600' },
  cardDate: { color: colors.muted, fontSize: 12, fontWeight: '500' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 36, gap: 12 },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 22, fontSize: 14 },
  fabs: { position: 'absolute', right: 20, bottom: 26, alignItems: 'center', gap: 14 },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSm: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  recBanner: {
    position: 'absolute',
    left: 20,
    right: 90,
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  recText: { color: colors.text, flex: 1, fontSize: 12, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  editorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorStatusPill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  editorStatus: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  titleInput: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  bodyInput: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    lineHeight: 28,
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    ...shadows.card,
  },
  savePillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  statsBar: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: '#FFFFFF',
  },
  statsText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
  },
});
