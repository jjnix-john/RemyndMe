// Loads the root .env so only public-safe values reach the client bundle.
// NOTE: GROQ_API_KEY and GEMINI_API_KEY are server-only and are NEVER exposed here.
require('dotenv').config();

const plugins = [
  'expo-router',
  'expo-sqlite',
  'expo-asset',
  'expo-font',
  ['expo-av', { microphonePermission: 'RemyndMe records your voice to create notes and tasks.' }],
];

// Include expo-dev-client plugin only when building or running custom dev client
if (process.env.EXPO_USE_DEV_CLIENT) {
  plugins.push('expo-dev-client');
}

module.exports = {
  expo: {
    name: 'RemyndMe',
    slug: 'remyndme',
    scheme: 'remyndme',
    version: '1.0.0',
    orientation: 'portrait',
    platforms: ['ios', 'android'],
    userInterfaceStyle: 'light',
    backgroundColor: '#F4F9F5',
    android: {
      package: 'com.remyndme.app',
      permissions: [
        'RECORD_AUDIO',
        'POST_NOTIFICATIONS',
        'SCHEDULE_EXACT_ALARM',
        'USE_EXACT_ALARM',
        'USE_FULL_SCREEN_INTENT',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'WAKE_LOCK',
        'VIBRATE',
        'RECEIVE_BOOT_COMPLETED',
      ],
    },
    ios: {
      bundleIdentifier: 'com.remyndme.app',
      infoPlist: {
        NSMicrophoneUsageDescription: 'RemyndMe records your voice to create notes and tasks.',
        UIBackgroundModes: ['audio'],
      },
    },
    plugins,
    extra: {
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
      apiUrl: process.env.API_URL || null,
      apiPort: process.env.PORT || '4000',
    },
  },
};
