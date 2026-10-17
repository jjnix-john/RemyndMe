import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { colors, gradients, radius, shadows } from '../lib/theme';

export default function Login() {
  const { signIn, signUp, continueAsGuest, isConfigured } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleGuest() {
    await continueAsGuest();
    router.replace('/(tabs)/tasks');
  }

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
          {/* Logo with lush leaf & alarm badge */}
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.logo, shadows.floating]}
          >
            <Ionicons name="leaf" size={38} color="#fff" />
          </LinearGradient>

          <Text style={styles.title}>RemyndMe</Text>
          <Text style={styles.sub}>A breezy mindful sanctuary for your notes, tasks & gentle alarms.</Text>

          {/* Quick Demo Mode Card for Expo Go Testing */}
          <Pressable onPress={handleGuest} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
            <LinearGradient
              colors={gradients.breezyPill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.guestCard, shadows.card]}
            >
              <View style={styles.guestIconWrap}>
                <Ionicons name="sparkles" size={22} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.guestTitle}>Explore in Demo Mode</Text>
                <Text style={styles.guestSub}>Instant access without setting up .env yet</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.primaryDark} />
            </LinearGradient>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or sign in with account</Text>
            <View style={styles.divider} />
          </View>

          {/* Sign In / Sign Up Form */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={colors.subtle}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              testID="email-input"
            />
            <TextInput
              style={styles.input}
              placeholder="Password (6+ characters)"
              placeholderTextColor={colors.subtle}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              testID="password-input"
            />

            {message && (
              <Text style={[styles.msg, { color: message.error ? colors.danger : colors.primaryDark }]}>
                {message.text}
              </Text>
            )}

            <Pressable onPress={submit} disabled={busy} testID="submit-button">
              <LinearGradient
                colors={gradients.primary}
                style={[styles.btn, shadows.floating]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null); }}>
              <Text style={styles.switch}>
                {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
                <Text style={{ color: colors.primaryDark, fontWeight: '700' }}>
                  {mode === 'signin' ? 'Create account' : 'Sign in'}
                </Text>
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
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: -0.5,
  },
  sub: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 16,
  },
  guestIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '700' },
  guestSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 12,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  form: { gap: 12 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    ...shadows.card,
  },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  msg: { fontSize: 13, textAlign: 'center', lineHeight: 18, marginVertical: 4 },
  switch: { color: colors.muted, textAlign: 'center', marginTop: 10, fontSize: 14 },
});
