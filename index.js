// Custom entry: notifee background handlers and the foreground-service task must be registered
// before the React tree mounts so alarms work when the app is closed or backgrounded.
import notifee from './lib/notifee';
import { handleNotifeeEvent, registerForegroundTask } from './lib/alarmEvents';

registerForegroundTask();
notifee.onBackgroundEvent(async (event) => handleNotifeeEvent(event));

import 'expo-router/entry';
