// การแจ้งเตือนในเครื่อง (local notification) ไม่ต้องมี push server และใช้ได้ใน Expo Go

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { checkInOpensAt } from '@/lib/check-in-rules';
import { readJson, removeKeys, writeJson } from '@/storage/kv';
import type { Activity } from '@/types/models';

export const supportsNotifications = true;

const CHANNEL_ID = 'checkin-reminders';
const MAP_KEY = 'campuspass/reminder-ids/v1';

export type NotificationData = { type: 'checkin' | 'verified'; registrationId: string };

// แอปเปิดอยู่ก็ต้องแสดง banner ไม่งั้นผู้ใช้จะไม่เห็นแจ้งเตือนเลย
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type ReminderMap = Record<string, string>;
const isMap = (v: unknown): v is ReminderMap => typeof v === 'object' && v !== null && !Array.isArray(v);

/** เก็บคู่ registrationId → notificationId ไว้ เพื่อยกเลิกแจ้งเตือนได้เมื่อยกเลิกการลงทะเบียน */
export function loadReminderMap(): Promise<ReminderMap> {
  return readJson(MAP_KEY, isMap, {});
}

/**
 * ขอสิทธิ์ตอนผู้ใช้กด "ตั้งเตือน" เท่านั้น
 * Android ต้องสร้าง channel ก่อนขอสิทธิ์ ไม่งั้นหน้าต่างขอสิทธิ์จะไม่ขึ้น
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'แจ้งเตือนเช็กอินกิจกรรม',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function schedule(
  registrationId: string,
  content: { title: string; body: string },
  trigger: Notifications.NotificationTriggerInput,
): Promise<string> {
  const granted = await ensureNotificationPermission();
  if (!granted) throw new Error('notification-permission-denied');

  await cancelReminder(registrationId);
  const data: NotificationData = { type: 'checkin', registrationId };
  const notificationId = await Notifications.scheduleNotificationAsync({ content: { ...content, data }, trigger });
  const map = await loadReminderMap();
  await writeJson(MAP_KEY, { ...map, [registrationId]: notificationId });
  return notificationId;
}

/** เตือนตอน "เปิดเช็กอิน" (30 นาทีก่อนงาน) เป็นจังหวะที่ผู้ใช้ทำอะไรต่อได้ทันที */
export async function scheduleCheckInReminder(registrationId: string, activity: Activity): Promise<string> {
  const date = checkInOpensAt(activity);
  if (date.getTime() <= Date.now()) throw new Error('reminder-time-has-passed');
  return schedule(
    registrationId,
    { title: `เปิดเช็กอินแล้ว: ${activity.title}`, body: `ไปที่ ${activity.location.name} แล้วแตะเพื่อเช็กอิน` },
    { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
  );
}

/** ใช้สาธิตในห้องสอบ: เตือนใน 10 วินาทีแทนการรอถึงเวลาจริง */
export async function scheduleTestReminder(registrationId: string, activity: Activity): Promise<string> {
  return schedule(
    registrationId,
    { title: `(ทดสอบ) เปิดเช็กอินแล้ว: ${activity.title}`, body: `ไปที่ ${activity.location.name} แล้วแตะเพื่อเช็กอิน` },
    { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: CHANNEL_ID },
  );
}

export async function cancelReminder(registrationId: string): Promise<void> {
  const map = await loadReminderMap();
  const notificationId = map[registrationId];
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
  const { [registrationId]: _removed, ...rest } = map;
  await writeJson(MAP_KEY, rest);
}

/** แจ้งทันทีเมื่อผู้จัดตรวจหลักฐานผ่าน ผู้ใช้จะรู้ผลโดยไม่ต้องเข้าแอปมาเช็กเอง */
export async function notifyVerified(registrationId: string, activityTitle: string): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) return; // ไม่ขอสิทธิ์เองตรงนี้ เพราะผู้ใช้ไม่ได้กดอะไร
  const data: NotificationData = { type: 'verified', registrationId };
  await Notifications.scheduleNotificationAsync({
    content: { title: 'ตรวจหลักฐานผ่านแล้ว ✓', body: `${activityTitle} ถูกนับเป็นกิจกรรมที่เข้าร่วมแล้ว`, data },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

export async function clearAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await removeKeys([MAP_KEY]);
}
