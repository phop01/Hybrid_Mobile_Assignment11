import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LoginPrompt } from '@/components/login-prompt';
import { Banner, Button, Card, Screen, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { summarizeAttendance } from '@/lib/attendance';
import { CATEGORIES, CATEGORY_ORDER } from '@/lib/categories';
import { formatDate } from '@/lib/format';
import { confirmAction } from '@/lib/platform-actions';
import { API_URL, toAbsoluteUrl } from '@/services/api-config';
import { useActivities } from '@/state/activities-context';
import { useMyRegistrations } from '@/state/my-registrations-context';
import { useAuthenticatedSession, useSession } from '@/state/session-context';

export default function ProfileScreen() {
  const session = useAuthenticatedSession();
  const { signOut } = useSession();
  const { registrations } = useMyRegistrations();
  const { activities, getById } = useActivities();

  if (!session) {
    return (
      <LoginPrompt
        icon="person-circle-outline"
        title="โปรไฟล์และจำนวนกิจกรรม"
        message="เข้าสู่ระบบเพื่อดูจำนวนกิจกรรมที่เข้าร่วมและหลักฐานการเข้าร่วม"
        next="/profile"
      />
    );
  }

  const { user } = session;
  const summary = summarizeAttendance(registrations, activities);
  const maxCount = Math.max(1, ...CATEGORY_ORDER.map((c) => summary.byCategory[c]));

  // แกลเลอรีหลักฐาน: รวมรูปเช็กอินทุกกิจกรรม ใช้ยื่นหลักฐาน (เช่น ชั่วโมงจิตอาสา กยศ.) หรือทำพอร์ตได้
  const evidence = registrations
    .filter((r) => r.checkIn && (r.status === 'checked_in' || r.status === 'pending_review'))
    .sort((a, b) => (b.checkIn?.takenAt ?? '').localeCompare(a.checkIn?.takenAt ?? ''));

  const onSignOut = async () => {
    const ok = await confirmAction('ออกจากระบบ', 'ข้อมูลการลงทะเบียนที่เก็บในเครื่องและการแจ้งเตือนจะถูกลบ', 'ออกจากระบบ');
    if (ok) await signOut();
  };

  return (
    <Screen>
      <Card style={styles.identity}>
        {/* ตัวอักษรในวงกลมเป็นของตกแต่ง: ซ่อนจาก screen reader และจำกัดการขยายไม่ให้ล้นวงกลม */}
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.avatarText} maxFontSizeMultiplier={1.3}>{user.fullName.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.muted}>รหัสนักศึกษา {user.studentId}</Text>
          <Text style={styles.muted}>{user.faculty}</Text>
        </View>
      </Card>

      <Card>
        <SectionTitle>กิจกรรมที่เข้าร่วม</SectionTitle>
        <View style={styles.totalRow} accessible accessibilityLabel={`เข้าร่วมแล้ว ${summary.total} กิจกรรม`}>
          <Text style={styles.total}>{summary.total}</Text>
          <Text style={styles.totalLabel}>กิจกรรม</Text>
        </View>
        <Text style={styles.muted}>นับเฉพาะกิจกรรมที่เช็กอินสำเร็จหรือหลักฐานตรวจผ่านแล้ว</Text>
        {summary.pendingReview > 0 ? (
          <Banner tone="warning" icon="hourglass">
            มีหลักฐาน {summary.pendingReview} รายการรอผู้จัดตรวจ จะถูกนับเมื่อตรวจผ่าน
          </Banner>
        ) : null}

        <View style={{ gap: Spacing.sm }}>
          {CATEGORY_ORDER.map((c) => {
            const count = summary.byCategory[c];
            return (
              <View key={c} style={styles.barRow} accessible accessibilityLabel={`${CATEGORIES[c].label} ${count} กิจกรรม`}>
                <Text style={styles.barLabel}>{CATEGORIES[c].label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(count / maxCount) * 100}%`, backgroundColor: CATEGORIES[c].color }]} />
                </View>
                <Text style={styles.barCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle>หลักฐานการเข้าร่วม</SectionTitle>
        {evidence.length === 0 ? (
          <Text style={styles.muted}>ยังไม่มีรูปหลักฐาน รูปจากการเช็กอินจะมาอยู่ที่นี่</Text>
        ) : (
          <View style={styles.gallery}>
            {evidence.map((r) => (
              <Pressable
                key={r.id}
                style={styles.photoCell}
                accessibilityRole="button"
                accessibilityLabel={`หลักฐาน ${getById(r.activityId)?.title ?? ''}`}
                onPress={() => router.push({ pathname: '/registrations/[id]', params: { id: r.id } })}>
                <Image source={{ uri: toAbsoluteUrl(r.checkIn!.photoUrl) }} style={styles.photo} contentFit="cover" />
                <Text numberOfLines={2} style={styles.photoTitle}>
                  {getById(r.activityId)?.title ?? 'กิจกรรม'}
                </Text>
                <Text style={styles.photoDate}>
                  {formatDate(r.checkIn!.takenAt)}
                  {r.status === 'pending_review' ? ' · รอตรวจ' : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <Button title="ออกจากระบบ" icon="log-out-outline" variant="secondary" onPress={onSignOut} />
      <View style={styles.apiInfo}>
        <Ionicons name="server-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.apiText}>API: {API_URL}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  name: { fontSize: 20, fontWeight: '700', color: Colors.text },
  muted: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  total: { fontSize: 48, fontWeight: '800', color: Colors.primary },
  totalLabel: { fontSize: 18, color: Colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barLabel: { width: 100, fontSize: 14, color: Colors.text },
  barTrack: { flex: 1, height: 10, backgroundColor: Colors.background, borderRadius: Radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.pill },
  barCount: { minWidth: 24, textAlign: 'right', fontWeight: '700', color: Colors.text },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  photoCell: { width: 140, gap: 4 },
  photo: { width: 140, height: 140, borderRadius: Radius.md, backgroundColor: Colors.border },
  photoTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  photoDate: { fontSize: 12, color: Colors.textMuted },
  apiInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' },
  apiText: { fontSize: 12, color: Colors.textMuted },
});
