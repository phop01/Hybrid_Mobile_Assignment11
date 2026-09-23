import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

// registrationId จาก server เป็น UUID ข้อมูลใน notification ไม่น่าเชื่อถือ จึงตรวจรูปแบบก่อนใช้
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

function openFromResponse(response: Notifications.NotificationResponse | null) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const id = data?.registrationId;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return;

  // payload เก็บแค่ ID หน้าปลายทางจะโหลดข้อมูลล่าสุดเอง (ข้อมูลใน notification อาจเก่าแล้ว)
  if (data?.type === 'checkin') {
    router.push({ pathname: '/check-in/[registrationId]', params: { registrationId: id } });
  } else {
    router.push({ pathname: '/registrations/[id]', params: { id } });
  }
}

/**
 * เปิดหน้าที่ถูกต้องเมื่อแตะแจ้งเตือน รองรับทั้ง
 * - cold start (แอปปิดอยู่): อ่าน response ที่ใช้เปิดแอป
 * - แอปเปิดอยู่ / อยู่เบื้องหลัง: ใช้ listener
 * รอจน session โหลดเสร็จ (ready) ก่อน เพราะหน้าปลายทางต้อง login
 */
export function useNotificationRouting(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      openFromResponse(response);
      Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromResponse(response);
      Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [ready]);
}
