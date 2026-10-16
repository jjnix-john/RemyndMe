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
import { colors, gradients, radius } from '../../lib/theme';

const fmt = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const deriveTitle = (text) => {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 40)}…` : t || 'Untitled';
};

export default function NotesScreen() {
  const { user, signOut } = useAuth();
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // note being edited
  const [refreshing, setRefreshing] = useState(false);
  const rec = useRecorder();

  const load = useCallback(async () => setNotes(await db.listNotes()), []);
  useEffect(() => { load(); return db.subscribe(load); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? notes.filter((n) => n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)) : notes;
  }, [notes, query]);

  const newNote = () =>
    setEditing({ id: Crypto.randomUUID(), user_id: user.id, title: '', content: '', created_at: new Date().toISOString(), isNew: true });

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
      const note = { id: Crypto.randomUUID(), user_id: user.id, title: deriveTitle(text), content: text, created_at: new Date().toISOString() };
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
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Notepad</Text>
          <Text style={styles.subtle}>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</Text>
        </View>
        <Pressable onPress={() => Alert.alert('Sign out', user?.email, [{ text: 'Cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }])}>
          <Ionicons name="person-circle-outline" size={32} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search notes" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 12 }}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="create-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No notes yet. Type one, or tap the mic and just talk.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setEditing(item)}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            {!!item.content && <Text style={styles.cardBody} numberOfLines={3}>{item.content}</Text>}
            <Text style={styles.cardDate}>{fmt(item.created_at)}</Text>
          </Pressable>
        )}
      />

      {(rec.isRecording || rec.isTranscribing) && (
        <View style={styles.recBanner}>
          {rec.isTranscribing ? <ActivityIndicator color="#fff" /> : <View style={styles.dot} />}
          <Text style={styles.recText}>
            {rec.isTranscribing ? 'Transcribing with Whisper…' : `Recording ${String(Math.floor(rec.seconds / 60)).padStart(2, '0')}:${String(rec.seconds % 60).padStart(2, '0')} — tap mic to finish`}
          </Text>
        </View>
      )}

      <View style={styles.fabs}>
        <Pressable onPress={voiceNote} disabled={rec.isTranscribing} testID="voice-note-fab">
          <LinearGradient colors={rec.isRecording ? gradients.alarm : [colors.card, colors.card]} style={[styles.fabSm, { borderWidth: 1, borderColor: colors.border }]}>
            <Ionicons name={rec.isRecording ? 'stop' : 'mic'} size={24} color={rec.isRecording ? '#fff' : colors.primary} />
          </LinearGradient>
        </Pressable>
        <Pressable onPress={newNote} testID="new-note-fab">
          <LinearGradient colors={gradients.primary} style={styles.fab}>
            <Ionicons name="add" size={32} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      {editing && (
        <NoteEditor
          note={editing}
          onClose={async (note) => { await persist(note); setEditing(null); }}
          onDelete={async (id) => { await db.removeNote(id); syncAll(); setEditing(null); }}
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

  async function toggleMic() {
    if (rec.isRecording) {
      const text = await rec.stop();
      if (text) setContent((c) => (c ? `${c.replace(/\s+$/, '')} ${text}` : text));
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
              <Ionicons name="chevron-down" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.editorStatus}>
              {rec.isTranscribing ? 'Transcribing…' : rec.isRecording ? `● Recording ${rec.seconds}s` : note.isNew ? 'New note' : 'Edit note'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 18 }}>
              {!note.isNew && (
                <Pressable onPress={() => Alert.alert('Delete note?', undefined, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDelete(note.id) }])}>
                  <Ionicons name="trash-outline" size={24} color={colors.danger} />
                </Pressable>
              )}
              <Pressable onPress={toggleMic} disabled={rec.isTranscribing} testID="editor-mic">
                {rec.isTranscribing ? <ActivityIndicator color={colors.primary} /> : (
                  <Ionicons name={rec.isRecording ? 'stop-circle' : 'mic-circle'} size={30} color={rec.isRecording ? colors.danger : colors.primary} style={{ marginTop: -3 }} />
                )}
              </Pressable>
            </View>
          </View>
          <TextInput style={styles.titleInput} placeholder="Title" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} />
          <TextInput
            style={styles.bodyInput} placeholder="Start typing, or tap the mic to dictate…" placeholderTextColor={colors.muted}
            multiline textAlignVertical="top" value={content} onChangeText={setContent} autoFocus={note.isNew}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtle: { color: colors.muted, marginTop: 2 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md,
    marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  cardBody: { color: colors.muted, marginTop: 6, lineHeight: 20 },
  cardDate: { color: colors.primary, fontSize: 12, marginTop: 10, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 90, paddingHorizontal: 40, gap: 12 },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
  fabs: { position: 'absolute', right: 20, bottom: 24, alignItems: 'center', gap: 14 },
  fab: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  fabSm: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  recBanner: {
    position: 'absolute', left: 16, right: 100, bottom: 30, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  recText: { color: colors.text, flex: 1, fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  editorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
  editorStatus: { color: colors.muted, fontWeight: '600' },
  titleInput: { color: colors.text, fontSize: 26, fontWeight: '800', paddingHorizontal: 20, paddingVertical: 8 },
  bodyInput: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 26, paddingHorizontal: 20, paddingTop: 8 },
});
