import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useMyRegistrations } from '@/state/my-registrations-context';

/**
 * 5 แท็บ = 5 เรื่องที่ผู้ใช้เปิดบ่อยที่สุด เข้าถึงได้ในแตะเดียว (แผนที่เพิ่มในสัปดาห์ 12)
 * หน้ารายละเอียด/ลงทะเบียน/เช็กอินอยู่ใน Root Stack นอกแท็บ จึงมีปุ่มย้อนกลับอัตโนมัติ
 */
export default function TabsLayout() {
  const { registrations } = useMyRegistrations();
  const pending = registrations.filter((r) => r.status === 'pending_review').length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        headerTitleStyle: { color: Colors.text },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen
        name="activities"
        options={{
          title: 'กิจกรรม',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'แผนที่',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: 'ของฉัน',
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="ticket" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'บันทึกไว้',
          tabBarIcon: ({ color, size }) => <Ionicons name="star" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'โปรไฟล์',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
