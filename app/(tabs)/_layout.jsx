import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { colors, shadows } from '../../lib/theme';

const icon = (outline, filled) => ({ focused, color, size }) => (
  <Ionicons name={focused ? filled : outline} size={23} color={color} />
);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="tasks"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: (Platform.OS === 'ios' ? 56 : 64) + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          ...shadows.card,
        },
        tabBarLabelStyle: {
          fontWeight: '600',
          fontSize: 12,
          marginTop: 2,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
          tabBarIcon: icon('document-text-outline', 'document-text'),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: icon('calendar-outline', 'calendar'),
        }}
      />
      <Tabs.Screen
        name="alarms"
        options={{
          title: 'Alarms',
          tabBarIcon: icon('alarm-outline', 'alarm'),
        }}
      />
    </Tabs>
  );
}
