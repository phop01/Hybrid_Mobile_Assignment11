// เว็บไม่รองรับ local notification ของ expo-notifications
// คง API เดิมไว้ให้หน้าจอเรียกได้ แต่ supportsNotifications = false เพื่อซ่อนปุ่มและแสดงข้อความแทน

import type { Activity } from '@/types/models';

export const supportsNotifications = false;

export type NotificationData = { type: 'checkin' | 'verified'; registrationId: string };

const unsupported = () => Promise.reject(new Error('notifications-unsupported-on-web'));

export async function loadReminderMap(): Promise<Record<string, string>> {
  return {};
}
export async function ensureNotificationPermission(): Promise<boolean> {
  return false;
}
export function scheduleCheckInReminder(_registrationId: string, _activity: Activity): Promise<string> {
  return unsupported();
}
export function scheduleTestReminder(_registrationId: string, _activity: Activity): Promise<string> {
  return unsupported();
}
export async function cancelReminder(_registrationId: string): Promise<void> {}
export async function notifyVerified(_registrationId: string, _activityTitle: string): Promise<void> {}
export async function clearAllReminders(): Promise<void> {}
