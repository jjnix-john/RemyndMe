import notifee, { AndroidCategory, AndroidForegroundServiceType, AndroidImportance, EventType } from './notifee';
import { ALARM_CHANNEL, SERVICE_NOTIFICATION_ID, ensureChannel, snoozeTask } from './alarms';
import { speakBriefing, stopSpeaking } from './briefing';
import * as db from './db';

let releaseService = null;

/**
 * Registered once at app entry (index.js). Notifee runs this inside an Android Foreground Service,
 * which keeps the process alive while the voice briefing is spoken, even with the app in background.
 * The service stops when the returned promise resolves.
 */
export function registerForegroundTask() {
  notifee.registerForegroundService((notification) =>
    new Promise((resolve) => {
      releaseService = resolve;
      speakBriefing(notification?.data?.taskId)
        .catch((e) => console.warn('[alarm] briefing failed:', e?.message || e))
        .finally(() => stopAlarm());
    })
  );
}

/** Promote an alarm notification into a foreground service that speaks the briefing. */
export async function runAlarmBriefing(notification) {
  await ensureChannel();
  await notifee.displayNotification({
    id: SERVICE_NOTIFICATION_ID,
    title: notification.title,
    body: 'Reading your tasks…',
    data: { type: 'alarm-briefing', taskId: notification.data?.taskId },
    android: {
      channelId: ALARM_CHANNEL,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK],
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      ongoing: true,
      onlyAlertOnce: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Snooze 10m', pressAction: { id: 'snooze' } },
        { title: 'Dismiss', pressAction: { id: 'dismiss' } },
      ],
    },
  });
}

export async function stopAlarm() {
  stopSpeaking();
  releaseService?.();
  releaseService = null;
  try {
    await notifee.stopForegroundService();
    await notifee.cancelNotification(SERVICE_NOTIFICATION_ID);
  } catch {}
}

/** Shared by notifee.onBackgroundEvent (headless) and onForegroundEvent (UI). */
export async function handleNotifeeEvent({ type, detail }, navigate) {
  const { notification, pressAction } = detail || {};
  const data = notification?.data || {};
  const isAlarm = data.type === 'alarm' || data.type === 'alarm-briefing';

  if (type === EventType.DELIVERED && data.type === 'alarm') {
    await runAlarmBriefing(notification);
    return;
  }
  if (!isAlarm) return;

  if (type === EventType.ACTION_PRESS) {
    if (pressAction?.id === 'dismiss') {
      await stopAlarm();
      await notifee.cancelNotification(notification.id);
    } else if (pressAction?.id === 'snooze') {
      await stopAlarm();
      const task = await db.getTask(data.taskId);
      if (task) await snoozeTask(task, 10);
      await notifee.cancelNotification(notification.id);
    }
    return;
  }

  if (type === EventType.PRESS && navigate && data.taskId) {
    navigate(data.taskId);
  }
}
