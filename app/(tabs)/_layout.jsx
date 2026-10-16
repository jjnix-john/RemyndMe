import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';

const icon = (name) => ({ color, size }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="tasks"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface, borderTopColor: colors.border,
          height: 58 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6,
        },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="notes" options={{ title: 'Notes', tabBarIcon: icon('document-text') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="alarms" options={{ title: 'Alarms', tabBarIcon: icon('alarm') }} />
    </Tabs>
  );
}
