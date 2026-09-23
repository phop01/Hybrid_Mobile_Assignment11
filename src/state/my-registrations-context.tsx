import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/services/api-client';
import * as api from '@/services/campus-api';
import { cancelReminder, notifyVerified } from '@/services/reminders';
import {
  enqueueCheckIn,
  listQueuedCheckIns,
  loadRegistrationsCache,
  removeQueuedCheckIn,
  saveRegistrationsCache,
} from '@/storage/offline-db';
import type { PendingCheckIn, Registration, RegistrationForm } from '@/types/models';

import { useActivities } from './activities-context';
import { useAuthenticatedSession } from './session-context';

export type CheckInOutcome = { kind: 'sent'; registration: Registration } | { kind: 'queued' };

type MyRegistrationsValue = {
  registrations: Registration[];
  loading: boolean;
  /** มีค่าเมื่อแสดงข้อมูลจากเครื่องเพราะติดต่อ server ไม่ได้ */
  offlineSince: string | null;
  error: string | null;
  queuedIds: string[];
  refresh: () => Promise<void>;
  findById: (id: string) => Registration | undefined;
  findActiveForActivity: (activityId: string) => Registration | undefined;
  register: (activityId: string, form: RegistrationForm, idempotencyKey: string) => Promise<Registration>;
  cancel: (id: string) => Promise<void>;
  checkIn: (item: PendingCheckIn) => Promise<CheckInOutcome>;
};

const MyRegistrationsContext = createContext<MyRegistrationsValue | null>(null);

const POLL_PENDING_MS = 5000;
const RETRY_QUEUE_MS = 15000;

/** เปลี่ยนผู้ใช้ (login/logout) → สร้าง state ใหม่ทั้งหมด ข้อมูลของคนก่อนไม่ค้าง */
export function MyRegistrationsProvider({ children }: { children: ReactNode }) {
  const session = useAuthenticatedSession();
  return <UserRegistrationsProvider key={session?.user.id ?? 'anonymous'}>{children}</UserRegistrationsProvider>;
}

function UserRegistrationsProvider({ children }: { children: ReactNode }) {
  const session = useAuthenticatedSession();
  const { getById: getActivity } = useActivities();
  const token = session?.token ?? null;
  const userId = session?.user.id ?? null;

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  // เริ่มเป็น true เมื่อ login อยู่ เพราะจะโหลดทันที
  const [loading, setLoading] = useState(Boolean(token));
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const previousStatus = useRef(new Map<string, Registration['status']>());

  const apply = useCallback(
    (list: Registration[]) => {
      // หลักฐานแบบกระดาษเปลี่ยนจาก "รอตรวจ" เป็น "เข้าร่วมแล้ว" → แจ้งผู้ใช้
      for (const r of list) {
        if (previousStatus.current.get(r.id) === 'pending_review' && r.status === 'checked_in') {
          notifyVerified(r.id, getActivity(r.activityId)?.title ?? 'กิจกรรม').catch(() => undefined);
        }
      }
      previousStatus.current = new Map(list.map((r) => [r.id, r.status]));
      setRegistrations(list);
      if (userId) saveRegistrationsCache(userId, list).catch(() => undefined);
    },
    [getActivity, userId],
  );

  /** ส่งเช็กอินที่ค้างในคิวออฟไลน์ */
  const flushQueue = useCallback(async () => {
    if (!token) return;
    const queue = await listQueuedCheckIns();
    for (const item of queue) {
      try {
        await api.submitCheckIn(token, item.registrationId, item);
        await removeQueuedCheckIn(item.registrationId);
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) break; // ยังออฟไลน์ ลองใหม่รอบหน้า
        // server ปฏิเสธ (เช่น อยู่นอกพื้นที่) → เอาออกจากคิว ผู้ใช้จะเห็นว่ายังไม่ได้เช็กอินและทำใหม่ได้
        await removeQueuedCheckIn(item.registrationId);
        setError(e instanceof Error ? `เช็กอินที่รอส่งถูกปฏิเสธ: ${e.message}` : 'เช็กอินที่รอส่งถูกปฏิเสธ');
      }
    }
    setQueuedIds((await listQueuedCheckIns()).map((q) => q.registrationId));
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      await flushQueue();
      const list = await api.getMyRegistrations(token);
      apply(list);
      setOfflineSince(null);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        const cache = await loadRegistrationsCache(userId);
        if (cache) {
          setRegistrations(cache.registrations);
          setOfflineSince(cache.updatedAt);
        }
        setError(cache ? null : e.message);
      } else {
        setError(e instanceof Error ? e.message : 'โหลดการลงทะเบียนไม่สำเร็จ');
      }
    } finally {
      setLoading(false);
    }
  }, [apply, flushQueue, token, userId]);

  // เข้าระบบแล้ว → แสดงข้อมูลในเครื่องก่อน แล้วค่อยโหลดจาก server
  useEffect(() => {
    if (!token || !userId) return;
    loadRegistrationsCache(userId)
      .then((cache) => {
        if (cache) {
          setRegistrations(cache.registrations);
          previousStatus.current = new Map(cache.registrations.map((r) => [r.id, r.status]));
        }
      })
      .catch(() => undefined)
      .finally(() => refresh());
    listQueuedCheckIns().then((q) => setQueuedIds(q.map((i) => i.registrationId)));
  }, [token, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // กลับเข้าแอป → รีเฟรช (อาจเพิ่งกลับมามีเน็ต หรือผู้จัดเพิ่งตรวจหลักฐาน)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // มีหลักฐานรอตรวจ → เช็กสถานะเป็นระยะ (แอปนี้ไม่มี push server)
  const hasPending = registrations.some((r) => r.status === 'pending_review');
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(refresh, POLL_PENDING_MS);
    return () => clearInterval(timer);
  }, [hasPending, refresh]);

  // มีเช็กอินค้างในคิว → ลองส่งใหม่เป็นระยะ
  useEffect(() => {
    if (queuedIds.length === 0) return;
    const timer = setInterval(refresh, RETRY_QUEUE_MS);
    return () => clearInterval(timer);
  }, [queuedIds.length, refresh]);

  const register = useCallback(
    async (activityId: string, form: RegistrationForm, idempotencyKey: string) => {
      if (!token) throw new Error('กรุณาเข้าสู่ระบบ');
      const registration = await api.registerForActivity(token, activityId, form, idempotencyKey);
      apply([registration, ...registrations.filter((r) => r.id !== registration.id)]);
      return registration;
    },
    [apply, registrations, token],
  );

  const cancel = useCallback(
    async (id: string) => {
      if (!token) throw new Error('กรุณาเข้าสู่ระบบ');
      const updated = await api.cancelRegistration(token, id);
      await cancelReminder(id); // ยกเลิกแล้วต้องไม่เตือนอีก
      apply(registrations.map((r) => (r.id === id ? updated : r)));
    },
    [apply, registrations, token],
  );

  const checkIn = useCallback(
    async (item: PendingCheckIn): Promise<CheckInOutcome> => {
      if (!token) throw new Error('กรุณาเข้าสู่ระบบ');
      try {
        const updated = await api.submitCheckIn(token, item.registrationId, item);
        await cancelReminder(item.registrationId);
        apply(registrations.map((r) => (r.id === updated.id ? updated : r)));
        return { kind: 'sent', registration: updated };
      } catch (e) {
        if (!(e instanceof ApiError && e.isNetwork)) throw e;
        // ห้องจัดงานไม่มีสัญญาณ → เก็บไว้ในเครื่อง ส่งให้อัตโนมัติเมื่อเน็ตกลับมา
        await enqueueCheckIn(item);
        setQueuedIds((ids) => [...new Set([...ids, item.registrationId])]);
        return { kind: 'queued' };
      }
    },
    [apply, registrations, token],
  );

  const value: MyRegistrationsValue = {
    registrations,
    loading,
    offlineSince,
    error,
    queuedIds,
    refresh,
    findById: (id) => registrations.find((r) => r.id === id),
    findActiveForActivity: (activityId) =>
      registrations.find((r) => r.activityId === activityId && r.status !== 'cancelled'),
    register,
    cancel,
    checkIn,
  };
  return <MyRegistrationsContext.Provider value={value}>{children}</MyRegistrationsContext.Provider>;
}

export function useMyRegistrations(): MyRegistrationsValue {
  const value = useContext(MyRegistrationsContext);
  if (!value) throw new Error('useMyRegistrations ต้องใช้ภายใน MyRegistrationsProvider');
  return value;
}
