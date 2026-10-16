import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { colors, gradients, radius } from '../lib/theme';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      setMessage({ error: true, text: 'Enter a valid email and a password of at least 6 characters.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const fn = mode === 'signin' ? signIn : signUp;
    const { data, error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) setMessage({ error: true, text: error.message });
    else if (mode === 'signup' && !data?.session) {
      setMessage({ error: false, text: 'Check your inbox to confirm your email, then sign in.' });
      setMode('signin');
    }
  }

  return (
    <LinearGradient colors={gradients.bg} style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.center}>
          <LinearGradient colors={gradients.primary} style={styles.logo}>
            <Ionicons name="alarm" size={40} color="#fff" />
          </LinearGradient>
          <Text style={styles.title}>RemyndMe</Text>
          <Text style={styles.sub}>Notes, tasks & voice alarms that actually wake you up.</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input} placeholder="Email" placeholderTextColor={colors.muted}
              autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}
              testID="email-input"
            />
            <TextInput
              style={styles.input} placeholder="Password" placeholderTextColor={colors.muted}
              secureTextEntry value={password} onChangeText={setPassword} testID="password-input"
            />
            {message && <Text style={[styles.msg, { color: message.error ? colors.danger : colors.accent }]}>{message.text}</Text>}
            <Pressable onPress={submit} disabled={busy} testID="submit-button">
              <LinearGradient colors={gradients.primary} style={styles.btn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.btnText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null); }}>
              <Text style={styles.switch}>
                {mode === 'signin' ? "New here? " : 'Already have an account? '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{mode === 'signin' ? 'Create account' : 'Sign in'}</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', textAlign: 'center', marginTop: 18, letterSpacing: -0.5 },
  sub: { color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 32, fontSize: 15 },
  form: { gap: 12 },
  input: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
    color: colors.text, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
  },
  btn: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  msg: { fontSize: 13, textAlign: 'center' },
  switch: { color: colors.muted, textAlign: 'center', marginTop: 10 },
});
