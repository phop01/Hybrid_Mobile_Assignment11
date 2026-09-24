import { useState } from 'react';

import type { Coordinates } from '@/lib/geo';
import { relocateActivityForDemo } from '@/services/campus-api';
import { useActivities } from '@/state/activities-context';
import { useAuthenticatedSession } from '@/state/session-context';

/**
 * โหมดสาธิต: ย้ายสถานที่จัดงานมาที่ตำแหน่งปัจจุบัน แล้วอัปเดตรายการกิจกรรมในแอป
 * แยกเป็น hook (สัปดาห์ 12): หน้าจอไม่เรียก API และไม่ต้องจัดการ token เอง
 */
export function useDemoRelocate() {
  const session = useAuthenticatedSession();
  const { upsert } = useActivities();
  const [relocating, setRelocating] = useState(false);

  const relocate = async (activityId: string, coords: Coordinates) => {
    if (!session) return;
    setRelocating(true);
    try {
      upsert(await relocateActivityForDemo(session.token, activityId, coords));
    } finally {
      setRelocating(false);
    }
  };

  return { relocate, relocating };
}
