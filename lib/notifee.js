import { NativeModules, Platform } from 'react-native';

/**
 * Safe Notifee loader & Expo Go shim.
 * In Expo Go, native modules like Notifee are not present in the runtime binary.
 * This shim detects if the native module is available. If present (e.g. custom dev build),
 * it uses the real @notifee/react-native; otherwise, it provides a safe mock so the app
 * runs smoothly in Expo Go without crashing.
 */

const hasNativeModule = Boolean(NativeModules && NativeModules.NotifeeApiModule);

let realNotifee = null;
if (hasNativeModule) {
  try {
    realNotifee = require('@notifee/react-native');
  } catch (err) {
    console.warn('[notifee] Native module was present but require failed:', err?.message || err);
  }
}

export const AndroidCategory = realNotifee?.AndroidCategory ?? {
  ALARM: 'alarm',
  CALL: 'call',
  EMAIL: 'email',
  ERROR: 'err',
  EVENT: 'event',
  MESSAGE: 'msg',
  NAVIGATION: 'navigation',
  PROGRESS: 'progress',
  PROMO: 'promo',
  RECOMMENDATION: 'recommendation',
  REMINDER: 'reminder',
  SERVICE: 'service',
  SOCIAL: 'social',
  STATUS: 'status',
  SYSTEM: 'sys',
  TRANSPORT: 'transport',
  WORKOUT: 'workout',
};

export const AndroidForegroundServiceType = realNotifee?.AndroidForegroundServiceType ?? {
  FOREGROUND_SERVICE_TYPE_NONE: 0,
  FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1,
  FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK: 2,
  FOREGROUND_SERVICE_TYPE_PHONE_CALL: 4,
  FOREGROUND_SERVICE_TYPE_LOCATION: 8,
  FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE: 16,
  FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION: 32,
  FOREGROUND_SERVICE_TYPE_CAMERA: 64,
  FOREGROUND_SERVICE_TYPE_MICROPHONE: 128,
};

export const AndroidImportance = realNotifee?.AndroidImportance ?? {
  UNKNOWN: -1000,
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
};

export const AndroidNotificationSetting = realNotifee?.AndroidNotificationSetting ?? {
  DISABLED: 0,
  ENABLED: 1,
  NOT_SUPPORTED: -1,
};

export const AndroidVisibility = realNotifee?.AndroidVisibility ?? {
  SECRET: -1,
  PRIVATE: 0,
  PUBLIC: 1,
};

export const AlarmType = realNotifee?.AlarmType ?? {
  SET: 0,
  SET_AND_ALLOW_WHILE_IDLE: 1,
  SET_EXACT: 2,
  SET_EXACT_AND_ALLOW_WHILE_IDLE: 3,
  SET_ALARM_CLOCK: 4,
};

export const AuthorizationStatus = realNotifee?.AuthorizationStatus ?? {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};

export const TriggerType = realNotifee?.TriggerType ?? {
  TIMESTAMP: 0,
  INTERVAL: 1,
};

export const EventType = realNotifee?.EventType ?? {
  DISMISSED: 0,
  PRESS: 1,
  ACTION_PRESS: 2,
  DELIVERED: 3,
  APP_BLOCKED: 4,
  CHANNEL_BLOCKED: 5,
  CHANNEL_GROUP_BLOCKED: 6,
  TRIGGER_NOTIFICATION_CREATED: 7,
  FG_ALREADY_EXISTING: 8,
};

// In-memory registry for mock trigger notifications
const mockTriggerIds = new Set();
const foregroundSubscribers = new Set();
const backgroundSubscribers = new Set();

const mockNotifee = {
  isAvailable: false,
  createChannel: async (channel) => {
    return channel?.id || 'remyndme-alarms';
  },
  requestPermission: async () => ({
    authorizationStatus: AuthorizationStatus.AUTHORIZED,
    settings: {
      sound: true,
      alert: true,
      badge: true,
    },
  }),
  openAlarmPermissionSettings: async () => {},
  getNotificationSettings: async () => ({
    authorizationStatus: AuthorizationStatus.AUTHORIZED,
    android: { alarm: AndroidNotificationSetting.ENABLED },
    sound: true,
    alert: true,
  }),
  isBatteryOptimizationEnabled: async () => false,
  openBatteryOptimizationSettings: async () => {},
  createTriggerNotification: async (notification, trigger) => {
    const id = notification?.id || `mock-trigger-${Date.now()}`;
    mockTriggerIds.add(id);
    return id;
  },
  displayNotification: async (notification) => {
    return notification?.id || `mock-display-${Date.now()}`;
  },
  cancelTriggerNotification: async (notificationId) => {
    mockTriggerIds.delete(notificationId);
  },
  cancelTriggerNotifications: async () => {
    mockTriggerIds.clear();
  },
  cancelNotification: async () => {},
  cancelAllNotifications: async () => {
    mockTriggerIds.clear();
  },
  getTriggerNotificationIds: async () => {
    return Array.from(mockTriggerIds);
  },
  registerForegroundService: (task) => {
    // In Expo Go, no native background foreground service is spawned.
  },
  stopForegroundService: async () => {},
  onForegroundEvent: (observer) => {
    foregroundSubscribers.add(observer);
    return () => foregroundSubscribers.delete(observer);
  },
  onBackgroundEvent: (observer) => {
    backgroundSubscribers.add(observer);
    return () => backgroundSubscribers.delete(observer);
  },
  getInitialNotification: async () => null,
};

const notifee = realNotifee?.default || realNotifee || mockNotifee;

export const isNativeNotifeeAvailable = hasNativeModule;
export default notifee;
