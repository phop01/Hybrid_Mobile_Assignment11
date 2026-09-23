import * as Location from 'expo-location';

import type { Coordinates } from '@/lib/geo';

export type LocationResult =
  | { status: 'ok'; coords: Coordinates }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'error'; message: string };

const TIMEOUT_MS = 12000;

/**
 * อ่านตำแหน่งปัจจุบันครั้งเดียว (ขอสิทธิ์เฉพาะตอนใช้งาน ไม่ติดตามเบื้องหลัง)
 * ใช้ความแม่นยำระดับ Balanced: เช็กอินต้องการความแม่นยำระดับอาคาร ไม่ต้องละเอียดระดับเมตร
 * และใช้แบตน้อยกว่า High
 */
export async function getCurrentCoordinates(): Promise<LocationResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: 'denied', canAskAgain: permission.canAskAgain };

  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    return { status: 'ok', coords: { latitude: position.coords.latitude, longitude: position.coords.longitude } };
  } catch {
    // อยู่ในอาคารแล้ว GPS จับสัญญาณไม่ได้ → ลองใช้ตำแหน่งล่าสุดที่เครื่องรู้
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) return { status: 'ok', coords: { latitude: last.coords.latitude, longitude: last.coords.longitude } };
    return { status: 'error', message: 'หาตำแหน่งไม่ได้ ลองออกไปที่โล่งหรือเปิด GPS แล้วลองใหม่' };
  }
}
