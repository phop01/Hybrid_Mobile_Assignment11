import type { Activity, Registration } from '@/types/models';

/** เปิดให้เช็กอินก่อนงานเริ่ม 30 นาที (เวลาเดียวกับที่แจ้งเตือน) */
export const CHECK_IN_OPENS_BEFORE_MS = 30 * 60 * 1000;

export type CheckInBlock =
  | 'not_registered'
  | 'already_submitted'
  | 'too_early'
  | 'too_late'
  | 'location_unknown'
  | 'too_far';

export type CheckInDecision = { ok: true } | { ok: false; reason: CheckInBlock; message: string };

export function checkInOpensAt(activity: Activity): Date {
  return new Date(new Date(activity.startsAt).getTime() - CHECK_IN_OPENS_BEFORE_MS);
}

export function isCheckInOpen(activity: Activity, now = Date.now()): boolean {
  return now >= checkInOpensAt(activity).getTime() && now <= new Date(activity.endsAt).getTime();
}

/**
 * รวมกฎการเช็กอินไว้ที่เดียว ใช้ทั้งหน้าจอและ test
 * ลำดับการตรวจ = ลำดับที่ผู้ใช้ควรรู้ก่อน (สถานะ → เวลา → ตำแหน่ง)
 * server ตรวจกฎเดียวกันซ้ำอีกครั้ง
 */
export function canCheckIn(params: {
  activity: Activity;
  registration: Registration;
  distanceM: number | null;
  now?: number;
}): CheckInDecision {
  const { activity, registration, distanceM, now = Date.now() } = params;

  if (registration.status === 'pending_review' || registration.status === 'checked_in') {
    return { ok: false, reason: 'already_submitted', message: 'ส่งหลักฐานการเข้าร่วมไปแล้ว' };
  }
  if (registration.status !== 'registered') {
    return { ok: false, reason: 'not_registered', message: 'การลงทะเบียนนี้ถูกยกเลิกแล้ว' };
  }
  if (now < checkInOpensAt(activity).getTime()) {
    return { ok: false, reason: 'too_early', message: 'ยังไม่ถึงเวลาเช็กอิน (เปิดก่อนงานเริ่ม 30 นาที)' };
  }
  if (now > new Date(activity.endsAt).getTime()) {
    return { ok: false, reason: 'too_late', message: 'กิจกรรมจบแล้ว หมดเวลาเช็กอิน' };
  }
  if (distanceM === null) {
    return { ok: false, reason: 'location_unknown', message: 'ต้องทราบตำแหน่งของคุณก่อนเช็กอิน' };
  }
  if (distanceM > activity.location.radiusM) {
    return {
      ok: false,
      reason: 'too_far',
      message: `คุณอยู่นอกพื้นที่จัดงาน ต้องอยู่ภายใน ${activity.location.radiusM} ม.`,
    };
  }
  return { ok: true };
}
