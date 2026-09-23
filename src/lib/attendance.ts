import type { Activity, Category, Registration } from '@/types/models';

export type AttendanceSummary = {
  total: number;
  byCategory: Record<Category, number>;
  pendingReview: number;
};

/**
 * นับจำนวนกิจกรรมที่เข้าร่วม
 * นับเฉพาะ checked_in เท่านั้น: ลงทะเบียนแล้วไม่ไป หรือหลักฐานยังรอตรวจ ต้องไม่ถูกนับ
 */
export function summarizeAttendance(registrations: Registration[], activities: Activity[]): AttendanceSummary {
  const categoryOf = new Map(activities.map((a) => [a.id, a.category]));
  const summary: AttendanceSummary = {
    total: 0,
    byCategory: { academic: 0, volunteer: 0, sport: 0, culture: 0 },
    pendingReview: 0,
  };
  for (const registration of registrations) {
    if (registration.status === 'pending_review') summary.pendingReview += 1;
    if (registration.status !== 'checked_in') continue;
    summary.total += 1;
    const category = categoryOf.get(registration.activityId);
    if (category) summary.byCategory[category] += 1;
  }
  return summary;
}
