import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  AlarmType,
  AuthorizationStatus,
  TriggerType,
} from './notifee';
import { Platform } from 'react-native';

export const ALARM_CHANNEL = 'remyndme-alarms';
export const SERVICE_NOTIFICATION_ID = 'alarm-service';

export async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: ALARM_CHANNEL,
    name: 'Task alarms',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 500, 300, 500],
    bypassDnd: true,
    lights: true,
  });
}

/** Ask for notification + exact-alarm permission. Returns the current status. */
export async function requestAlarmPermissions({ openSettings = true } = {}) {
  await ensureChannel();
  await notifee.requestPermission();
  let status = await getAlarmStatus();
  if (Platform.OS === 'android' && !status.exactAlarm && openSettings) {
    await notifee.openAlarmPermissionSettings(); // Android 12+: SCHEDULE_EXACT_ALARM
    status = await getAlarmStatus();
  }
  return status;
}

export async function getAlarmStatus() {
  const s = await notifee.getNotificationSettings();
  return {
    notifications: s.authorizationStatus >= AuthorizationStatus.AUTHORIZED,
    exactAlarm: Platform.OS !== 'android' || s.android?.alarm === AndroidNotificationSetting.ENABLED,
  };
}

export async function openBatterySettings() {
  if (Platform.OS !== 'android') return;
  const optimized = await notifee.isBatteryOptimizationEnabled();
  if (optimized) await notifee.openBatteryOptimizationSettings();
}

const eligible = (t) => t && !t.is_completed && t.alarm_enabled && new Date(t.due_date).getTime() > Date.now() + 1000;

function buildNotification(task, id = task.id) {
  return {
    id,
    title: `⏰ ${task.title}`,
    body: task.priority === 'high' ? 'High priority task is due now' : 'Task is due now',
    data: { type: 'alarm', taskId: task.id },
    android: {
      channelId: ALARM_CHANNEL,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: { id: 'default', launchActivity: 'default' },
      fullScreenAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Snooze 10m', pressAction: { id: 'snooze' } },
        { title: 'Dismiss', pressAction: { id: 'dismiss' } },
      ],
    },
    ios: { sound: 'default', critical: true },
  };
}

export async function scheduleTaskAlarm(task) {
  if (!eligible(task)) return cancelTaskAlarm(task.id);
  await ensureChannel();
  await notifee.createTriggerNotification(buildNotification(task), {
    type: TriggerType.TIMESTAMP,
    timestamp: new Date(task.due_date).getTime(),
    alarmManager: { allowWhileIdle: true, type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
  });
}

export async function cancelTaskAlarm(taskId) {
  await notifee.cancelTriggerNotification(taskId);
  await notifee.cancelTriggerNotification(`snooze-${taskId}`);
}

export async function snoozeTask(task, minutes = 10) {
  await ensureChannel();
  await notifee.createTriggerNotification(buildNotification(task, `snooze-${task.id}`), {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + minutes * 60 * 1000,
    alarmManager: { allowWhileIdle: true, type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
  });
}

/** Make the OS schedule match the task list: arm eligible tasks, cancel stale ones. */
export async function rescheduleAlarms(tasks) {
  try {
    const existing = await notifee.getTriggerNotificationIds();
    const wanted = new Set();
    for (const t of tasks) {
      if (eligible(t)) {
        wanted.add(t.id);
        await scheduleTaskAlarm(t);
      }
    }
    for (const id of existing) {
      if (!wanted.has(id) && !id.startsWith('snooze-')) await notifee.cancelTriggerNotification(id);
    }
  } catch (err) {
    console.warn('[alarms] reschedule failed:', err?.message || err);
  }
}

export async function cancelAllAlarms() {
  await notifee.cancelTriggerNotifications();
  await notifee.cancelAllNotifications();
}
