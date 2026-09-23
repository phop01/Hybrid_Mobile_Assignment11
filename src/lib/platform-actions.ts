import { Alert, Linking, Platform } from 'react-native';

import type { Venue } from '@/types/models';

/** ถามยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ (Alert ของ React Native ใช้บนเว็บไม่ได้ จึงแยกกรณี) */
export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'ไม่ใช่', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** เปิดแอปแผนที่ของเครื่องเพื่อนำทาง ดีกว่าเขียนระบบนำทางเอง */
export function openDirections(venue: Venue) {
  const { latitude: lat, longitude: lng } = venue;
  const label = encodeURIComponent(venue.name);
  const url = Platform.select({
    ios: `maps:?daddr=${lat},${lng}&q=${label}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    default: `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`,
  });
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
  );
}

/** key สำหรับกันส่งลงทะเบียนซ้ำ (idempotency) สร้างครั้งเดียวต่อการเปิดฟอร์ม */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
