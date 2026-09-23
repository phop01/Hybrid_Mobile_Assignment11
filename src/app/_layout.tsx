import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { Colors } from '@/constants/theme';
import { useNotificationRouting } from '@/hooks/use-notification-routing';
import { ActivitiesProvider } from '@/state/activities-context';
import { FavoritesProvider } from '@/state/favorites-context';
import { MyRegistrationsProvider } from '@/state/my-registrations-context';
import { consumePostLoginRedirect, SessionProvider, useSession } from '@/state/session-context';

SplashScreen.preventAutoHideAsync();

// กด back จากหน้าที่เปิดผ่าน deep link/แจ้งเตือน จะกลับมาที่แท็บหลัก ไม่หลุดออกจากแอป
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  return (
    <SessionProvider>
      <ActivitiesProvider>
        <FavoritesProvider>
          <MyRegistrationsProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </MyRegistrationsProvider>
        </FavoritesProvider>
      </ActivitiesProvider>
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session } = useSession();
  const ready = session.status !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  useNotificationRouting(ready);

  // login สำเร็จ → พาไปหน้าที่ผู้ใช้ตั้งใจจะไป หลัง Stack.Protected อัปเดตเสร็จ
  const previousStatus = useRef(session.status);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = session.status;
    if (was === 'anonymous' && session.status === 'authenticated') {
      const next = consumePostLoginRedirect();
      if (next) setTimeout(() => router.push(next as never), 0);
    }
  }, [session.status]);

  // ยังตรวจ session ไม่เสร็จ → ค้าง splash ไว้ หน้าที่ต้อง login จะไม่กระพริบให้เห็นก่อน
  if (!ready) return null;
  const isAuthenticated = session.status === 'authenticated';

  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'กลับ',
        headerTintColor: Colors.primary,
        headerTitleStyle: { color: Colors.text },
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="activities/[id]/index" options={{ title: 'รายละเอียดกิจกรรม' }} />

      {/* login มีเฉพาะตอนยังไม่เข้าระบบ */}
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" options={{ title: 'เข้าสู่ระบบ' }} />
      </Stack.Protected>

      {/* หน้าที่ต้องรู้ว่าเป็นใคร: ลงทะเบียน ดูการลงทะเบียน และเช็กอิน */}
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="activities/[id]/register" options={{ title: 'ลงทะเบียนกิจกรรม' }} />
        <Stack.Screen name="registrations/[id]" options={{ title: 'การลงทะเบียนของฉัน' }} />
        <Stack.Screen name="check-in/[registrationId]" options={{ title: 'เช็กอิน' }} />
      </Stack.Protected>

      <Stack.Screen name="+not-found" options={{ title: 'ไม่พบหน้านี้' }} />
    </Stack>
  );
}
