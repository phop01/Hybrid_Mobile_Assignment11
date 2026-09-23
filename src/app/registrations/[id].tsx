import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ReminderControl } from '@/components/reminder-control';
import { StatusBadge } from '@/components/status-badge';
import { Banner, Button, Card, InfoRow, Screen, SectionTitle, StateView } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { firstParam } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { checkInOpensAt, isCheckInOpen } from '@/lib/check-in-rules';
import { formatDate, formatDateRange, formatDistance, formatTime } from '@/lib/format';
import { confirmAction, openDirections } from '@/lib/platform-actions';
import { toAbsoluteUrl } from '@/services/api-config';
import { useActivities } from '@/state/activities-context';
import { useMyRegistrations } from '@/state/my-registrations-context';

export default function RegistrationDetailScreen() {
  const id = firstParam(useLocalSearchParams<{ id?: string | string[] }>().id);
  const { findById, loading, refresh, cancel, queuedIds } = useMyRegistrations();
  const { getById, status: activitiesStatus } = useActivities();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const registration = id ? findById(id) : undefined;
  const activity = registration ? getById(registration.activityId) : undefined;

  if (!registration || !activity) {
    if (loading || activitiesStatus === 'loading') return <StateView kind="loading" />;
    return (
      <StateView
        kind="empty"
        icon="help-circle-outline"
        title="ไม่พบการลงทะเบียนนี้"
        message="อาจถูกยกเลิกไปแล้ว หรือเป็นของบัญชีอื่น"
        actionLabel="ไปหน้าของฉัน"
        onAction={() => router.replace('/my')}
      />
    );
  }

  const queued = queuedIds.includes(registration.id);
  const open = isCheckInOpen(activity, now);
  const ended = now > new Date(activity.endsAt).getTime();

  const onCancel = async () => {
    const ok = await confirmAction('ยกเลิกการลงทะเบียน', `ยกเลิก “${activity.title}” ใช่ไหม? ที่นั่งจะว่างให้คนอื่น`, 'ยกเลิกการลงทะเบียน');
    if (!ok) return;
    setCancelling(true);
    setError(null);
    try {
      await cancel(registration.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setCancelling(false);
    }
  };

  let checkInSection;
  if (registration.status === 'registered' && queued) {
    checkInSection = (
      <Banner tone="warning" icon="cloud-upload">
        ถ่ายรูปเช็กอินแล้ว แต่ยังส่งไม่ได้เพราะออฟไลน์ แอปจะส่งให้อัตโนมัติเมื่อกลับมามีอินเทอร์เน็ต (ใช้เวลาตอนถ่ายรูปในการตรวจ)
      </Banner>
    );
  } else if (registration.status === 'registered') {
    checkInSection = (
      <>
        {open ? (
          <Banner tone="success" icon="radio-button-on">
            เปิดเช็กอินแล้ว ไปที่ {activity.location.name} แล้วกดเช็กอิน
          </Banner>
        ) : ended ? (
          <Banner tone="danger">กิจกรรมจบแล้ว หมดเวลาเช็กอิน</Banner>
        ) : (
          <Text style={styles.muted}>
            เปิดเช็กอิน {formatDate(checkInOpensAt(activity).toISOString())} เวลา {formatTime(checkInOpensAt(activity).toISOString())}
          </Text>
        )}
        <Button
          title={activity.checkInMethod === 'paper' ? 'ส่งหลักฐานใบเซ็นชื่อ' : 'เช็กอิน'}
          icon="camera"
          disabled={!open}
          onPress={() => router.push({ pathname: '/check-in/[registrationId]', params: { registrationId: registration.id } })}
          accessibilityHint="ตรวจตำแหน่งแล้วถ่ายรูปยืนยันการเข้าร่วม"
        />
      </>
    );
  } else if (registration.status === 'pending_review') {
    checkInSection = (
      <Banner tone="warning" icon="hourglass">
        ส่งรูปใบเซ็นชื่อแล้ว ผู้จัดกำลังตรวจเทียบกับกระดาษ จะนับเป็นกิจกรรมที่เข้าร่วมเมื่อตรวจผ่าน
      </Banner>
    );
  } else if (registration.status === 'checked_in') {
    checkInSection = <Banner tone="success">เข้าร่วมแล้ว นับในโปรไฟล์ของคุณแล้ว</Banner>;
  } else {
    checkInSection = <Banner tone="info">การลงทะเบียนนี้ถูกยกเลิกแล้ว</Banner>;
  }

  const record = registration.checkIn;

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Colors.primary} />}>
      <View style={{ gap: Spacing.sm }}>
        <StatusBadge status={queued && registration.status === 'registered' ? 'queued' : registration.status} />
        <Text style={styles.title} accessibilityRole="header">
          {activity.title}
        </Text>
      </View>

      <Card>
        <InfoRow icon="time-outline">{formatDateRange(activity.startsAt, activity.endsAt)}</InfoRow>
        <InfoRow icon="location-outline">{activity.location.name}</InfoRow>
        <Button title="นำทางไปสถานที่" icon="navigate-outline" variant="secondary" onPress={() => openDirections(activity.location)} />
      </Card>

      <Card>
        <SectionTitle>{activity.checkInMethod === 'paper' ? 'หลักฐานการเข้าร่วม (ใบเซ็นชื่อ)' : 'เช็กอิน'}</SectionTitle>
        {checkInSection}
        {record ? (
          <View style={{ gap: Spacing.sm }}>
            <Image
              source={{ uri: toAbsoluteUrl(record.photoUrl) }}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel="รูปหลักฐานการเข้าร่วม"
            />
            <Text style={styles.muted}>
              ถ่ายเมื่อ {formatDate(record.takenAt)} {formatTime(record.takenAt)} · ห่างจุดจัดงาน {formatDistance(record.distanceM)}
            </Text>
            {record.verifiedAt ? (
              <Text style={styles.muted}>ยืนยันเมื่อ {formatTime(record.verifiedAt)}</Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      {registration.status === 'registered' && !queued && !ended ? (
        <Card>
          <SectionTitle>แจ้งเตือน</SectionTitle>
          <ReminderControl registrationId={registration.id} activity={activity} now={now} />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>ข้อมูลที่ลงทะเบียน</SectionTitle>
        <InfoRow icon="person-outline">
          {registration.form.fullName} ({registration.form.studentId})
        </InfoRow>
        <InfoRow icon="school-outline">{registration.form.faculty}</InfoRow>
        <InfoRow icon="call-outline">{registration.form.phone}</InfoRow>
        {registration.form.dietary ? <InfoRow icon="restaurant-outline">{registration.form.dietary}</InfoRow> : null}
      </Card>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {registration.status === 'registered' && !queued && !ended ? (
        <Button title="ยกเลิกการลงทะเบียน" icon="close-circle-outline" variant="danger" loading={cancelling} onPress={onCancel} />
      ) : null}
      <Button
        title="ดูรายละเอียดกิจกรรม"
        variant="ghost"
        onPress={() => router.push({ pathname: '/activities/[id]', params: { id: activity.id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, lineHeight: 30 },
  muted: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: Colors.border },
});
