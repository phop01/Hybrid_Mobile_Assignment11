import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { checkInOpensAt, isCheckInOpen } from '@/lib/check-in-rules';
import { formatDate, formatTime } from '@/lib/format';
import {
  cancelReminder,
  loadReminderMap,
  scheduleCheckInReminder,
  scheduleTestReminder,
  supportsNotifications,
} from '@/services/reminders';
import type { Activity } from '@/types/models';

import { Banner, Button } from './ui';

/**
 * ปุ่มตั้ง/ยกเลิก "แจ้งเตือนเมื่อเปิดเช็กอิน"
 * ขอสิทธิ์แจ้งเตือนตอนกดปุ่มนี้เท่านั้น ไม่ขอตอนเปิดแอป
 */
export function ReminderControl({ registrationId, activity, now }: { registrationId: string; activity: Activity; now: number }) {
  const [scheduled, setScheduled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    loadReminderMap().then((map) => setScheduled(Boolean(map[registrationId])));
  }, [registrationId]);

  if (!supportsNotifications) {
    return <Banner tone="info" icon="notifications-off-outline">การแจ้งเตือนใช้ได้บนแอปมือถือ (Expo Go) เว็บเบราว์เซอร์ไม่รองรับ</Banner>;
  }

  const opensAt = checkInOpensAt(activity).toISOString();
  const alreadyOpen = isCheckInOpen(activity, now) || now > new Date(activity.endsAt).getTime();

  const run = async (task: () => Promise<unknown>, successText: string, nextScheduled: boolean) => {
    setBusy(true);
    setMessage(null);
    setDenied(false);
    try {
      await task();
      setScheduled(nextScheduled);
      setMessage({ tone: 'success', text: successText });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'notification-permission-denied') {
        setDenied(true);
        setMessage({ tone: 'danger', text: 'ไม่ได้รับสิทธิ์แจ้งเตือน เปิดสิทธิ์ได้ในการตั้งค่าของเครื่อง' });
      } else if (code === 'reminder-time-has-passed') {
        setMessage({ tone: 'info', text: 'เปิดเช็กอินแล้ว ไม่ต้องตั้งเตือน' });
      } else {
        setMessage({ tone: 'danger', text: 'ตั้งแจ้งเตือนไม่สำเร็จ' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      {alreadyOpen ? null : scheduled ? (
        <>
          <Text style={styles.text}>
            จะแจ้งเตือน {formatDate(opensAt)} เวลา {formatTime(opensAt)} ตอนเปิดเช็กอิน
          </Text>
          <Button
            title="ยกเลิกแจ้งเตือน"
            icon="notifications-off-outline"
            variant="secondary"
            loading={busy}
            onPress={() => run(() => cancelReminder(registrationId), 'ยกเลิกแจ้งเตือนแล้ว', false)}
          />
        </>
      ) : (
        <Button
          title={`แจ้งเตือนเมื่อเปิดเช็กอิน (${formatTime(opensAt)})`}
          icon="notifications-outline"
          variant="secondary"
          loading={busy}
          onPress={() => run(() => scheduleCheckInReminder(registrationId, activity), 'ตั้งแจ้งเตือนแล้ว', true)}
        />
      )}
      {__DEV__ ? (
        <Button
          title="โหมดสาธิต: ทดสอบแจ้งเตือนใน 10 วินาที"
          icon="flask-outline"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            run(() => scheduleTestReminder(registrationId, activity), 'จะแจ้งเตือนใน 10 วินาที ลองกดปุ่ม Home แล้วแตะแจ้งเตือน', true)
          }
        />
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {denied && Platform.OS !== 'web' ? (
        <Button title="เปิดการตั้งค่า" variant="ghost" icon="settings-outline" onPress={() => Linking.openSettings()} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, color: Colors.textMuted },
});
