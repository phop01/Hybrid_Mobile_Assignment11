import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { ApiError, setUnauthorizedHandler } from '@/services/api-client';
import * as api from '@/services/campus-api';
import { clearAllReminders } from '@/services/reminders';
import { isUser } from '@/services/validators';
import { readJson, removeKeys, writeJson } from '@/storage/kv';
import { clearOfflineData } from '@/storage/offline-db';
import { clearToken, loadToken, saveToken } from '@/storage/token-storage';
import type { User } from '@/types/models';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; token: string; user: User };

type SessionContextValue = {
  session: SessionState;
  signIn: (studentId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// ข้อมูลโปรไฟล์ (ไม่ใช่ความลับ) เก็บไว้ด้วย เพื่อเปิดแอปตอนไม่มีเน็ตแล้วยังเข้าระบบอยู่
// เช่น ไปถึงงานที่สัญญาณไม่ดี ต้องยังเปิดการลงทะเบียนและเช็กอินแบบออฟไลน์ได้
const USER_KEY = 'campuspass/session-user/v1';

const SessionContext = createContext<SessionContextValue | null>(null);

// หน้าที่จะพาไปหลัง login สำเร็จ (ตั้งจากหน้า login อ่านจาก root layout)
let postLoginRedirect: string | null = null;
export function setPostLoginRedirect(path: string | null) {
  postLoginRedirect = path;
}
export function consumePostLoginRedirect(): string | null {
  const path = postLoginRedirect;
  postLoginRedirect = null;
  return path;
}

async function wipeLocalSession() {
  // Logout ต้องล้างทุกอย่างของผู้ใช้ เครื่องอาจใช้ร่วมกัน
  await Promise.allSettled([clearToken(), removeKeys([USER_KEY]), clearOfflineData(), clearAllReminders()]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  // ฟื้น session ตอนเปิดแอป ผู้ใช้ไม่ต้อง login ใหม่ทุกครั้ง
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await loadToken().catch(() => null);
      if (!token) return setSession({ status: 'anonymous' });
      try {
        const user = await api.getMe(token);
        await writeJson(USER_KEY, user);
        if (!cancelled) setSession({ status: 'authenticated', token, user });
      } catch (error) {
        if (error instanceof ApiError && error.isNetwork) {
          // ออฟไลน์: เชื่อ token ไว้ก่อน server จะตรวจอีกทีตอนส่งข้อมูล
          const cachedUser = await readJson<User | null>(USER_KEY, (v): v is User | null => v === null || isUser(v), null);
          if (cachedUser) return !cancelled && setSession({ status: 'authenticated', token, user: cachedUser });
        }
        // token หมดอายุหรือใช้ไม่ได้ → ล้างแล้วกลับไปสถานะยังไม่ login ไม่ปล่อยให้ค้างที่ loading
        await wipeLocalSession();
        if (!cancelled) setSession({ status: 'anonymous' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (studentId: string, password: string) => {
    const { token, user } = await api.login(studentId, password);
    await saveToken(token);
    await writeJson(USER_KEY, user);
    setSession({ status: 'authenticated', token, user });
  }, []);

  const signOut = useCallback(async () => {
    const current = session;
    if (current.status === 'authenticated') await api.logout(current.token).catch(() => undefined);
    await wipeLocalSession();
    setSession({ status: 'anonymous' });
  }, [session]);

  // server ตอบ 401 (token หมดอายุ) ที่ไหนก็ตาม → ออกจากระบบ
  useEffect(() => {
    setUnauthorizedHandler(() => {
      wipeLocalSession().then(() => setSession({ status: 'anonymous' }));
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return <SessionContext.Provider value={{ session, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession ต้องใช้ภายใน SessionProvider');
  return value;
}

export function useAuthenticatedSession() {
  const { session } = useSession();
  return session.status === 'authenticated' ? session : null;
}
