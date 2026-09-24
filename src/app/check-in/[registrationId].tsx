import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { ActivityMap } from '@/components/activity-map';
import { CheckInCamera } from '@/components/check-in-camera';
import { Banner, Button, Card, Screen, SectionTitle, StateView } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { firstParam, useActivity } from '@/hooks/use-activity';
import { useDemoRelocate } from '@/hooks/use-demo-relocate';
import { useNow } from '@/hooks/use-now';
import { canCheckIn, photoTimeProblem } from '@/lib/check-in-rules';
import { formatDistance, formatTime } from '@/lib/format';
import { distanceMeters, type Coordinates } from '@/lib/geo';
import { PHOTO_SOURCE_LABEL } from '@/lib/photo-time';
import { getCurrentCoordinates } from '@/services/location';
import { pickPhotoFromLibrary, preparePhotoForUpload } from '@/services/photo';
import { useMyRegistrations, type CheckInOutcome } from '@/state/my-registrations-context';
import type { PhotoSource } from '@/types/models';

type LocationState =
  | { status: 'locating' }
  | { status: 'ok'; coords: Coordinates }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'error'; message: string };

type Photo = { uri: string; base64: string; takenAt: string; source: PhotoSource };

// เว็บอ่าน EXIF ของรูปไม่ได้ จึงตรวจเวลาถ่ายไม่ได้ → บนเว็บให้ถ่ายสดอย่างเดียว
// ยกเว้นตอนพัฒนา/สาธิต: เปิดให้เลือกรูปทดสอบได้ทุกแพลตฟอร์ม
const CAN_PICK_FROM_LIBRARY = Platform.OS !== 'web' || __DEV__;

/**
 * เช็กอิน = ตรวจตำแหน่ง + รูปยืนยัน
 * - ต้องอยู่ในรัศมีงาน: กันเช็กอินจากหอพัก
 * - ถ่ายสด หรือเลือกจากคลังได้ (เผื่อถ่ายไว้แล้วตอนอยู่ในงาน หรือกล้องในแอปใช้ไม่ได้)
 *   แต่รูปจากคลังต้องมีเวลาถ่าย (EXIF) อยู่ในช่วงงาน กันเอารูปเก่า/รูปที่เพื่อนส่งมาใช้
 *   และบันทึกว่ารูปมาจากคลัง ให้ผู้จัดเห็น
 * - โหมดสาธิต (__DEV__): รูปที่ไม่ผ่านการตรวจเวลา ส่งเป็น "รูปทดสอบ" ได้ ไว้สาธิตโดยไม่ต้องไปอยู่ในงานจริง
 * - แบบกระดาษ: ถ่ายรูปใบเซ็นชื่อตรงบรรทัดของเรา เป็นหลักฐานที่นักศึกษาเก็บไว้เองได้
 */
export default function CheckInScreen() {
  const registrationId = firstParam(useLocalSearchParams<{ registrationId?: string | string[] }>().registrationId);
  const { findById, checkIn, queuedIds, loading: regsLoading } = useMyRegistrations();
  const registration = registrationId ? findById(registrationId) : undefined;
  const activityState = useActivity(registration?.activityId);

  const [location, setLocation] = useState<LocationState>({ status: 'locating' });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const { relocate, relocating } = useDemoRelocate();
  // รูปจากคลังที่ไม่ผ่านการตรวจเวลา เก็บไว้ให้กดใช้เป็นรูปทดสอบได้ (โหมดสาธิตเท่านั้น)
  const [rejectedPick, setRejectedPick] = useState<string | null>(null);
  const now = useNow();

  const locate = async () => {
    setLocation({ status: 'locating' });
    const result = await getCurrentCoordinates();
    setLocation(result.status === 'ok' ? { status: 'ok', coords: result.coords } : result);
  };

  // ผู้ใช้กดเช็กอินมาแล้ว = เริ่มใช้ฟีเจอร์นี้ จึงขอตำแหน่งตอนเข้าหน้านี้ ไม่ใช่ตอนเปิดแอป
  const hasRegistration = Boolean(registration);
  useEffect(() => {
    if (!hasRegistration) return;
    let cancelled = false;
    getCurrentCoordinates().then((result) => {
      if (!cancelled) setLocation(result.status === 'ok' ? { status: 'ok', coords: result.coords } : result);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRegistration]);

  if (!registration) {
    if (regsLoading) return <StateView kind="loading" />;
    return <StateView kind="empty" title="ไม่พบการลงทะเบียนนี้" actionLabel="ไปหน้าของฉัน" onAction={() => router.replace('/my')} />;
  }
  if (activityState.status === 'loading') return <StateView kind="loading" />;
  if (activityState.status !== 'ready') {
    return <StateView kind="empty" title="ไม่พบกิจกรรมนี้" actionLabel="กลับ" onAction={() => router.back()} />;
  }
  const { activity } = activityState;
  const isPaper = activity.checkInMethod === 'paper';

  // ----- ส่งแล้ว -----
  if (outcome) {
    const pending = outcome.kind === 'sent' && outcome.registration.status === 'pending_review';
    return (
      <Screen>
        {outcome.kind === 'queued' ? (
          <StateView
            kind="empty"
            icon="cloud-upload-outline"
            title="บันทึกไว้แล้ว รอส่ง"
            message="ตอนนี้ติดต่อ server ไม่ได้ แอปเก็บรูปและเวลาที่ถ่ายไว้ในเครื่อง และจะส่งให้อัตโนมัติเมื่อกลับมามีอินเทอร์เน็ต"
          />
        ) : pending ? (
          <StateView
            kind="empty"
            icon="hourglass-outline"
            title="ส่งหลักฐานแล้ว รอผู้จัดตรวจ"
            message="ผู้จัดจะตรวจเทียบรูปกับใบเซ็นชื่อ เมื่อผ่านแล้วจะแจ้งเตือนและนับในโปรไฟล์ของคุณ"
          />
        ) : (
          <StateView kind="empty" icon="checkmark-circle" title="เช็กอินสำเร็จ" message="นับเป็นกิจกรรมที่เข้าร่วมในโปรไฟล์ของคุณแล้ว" />
        )}
        <Button
          title="ดูการลงทะเบียน"
          onPress={() => router.replace({ pathname: '/registrations/[id]', params: { id: registration.id } })}
        />
      </Screen>
    );
  }

  const coords = location.status === 'ok' ? location.coords : null;
  const distance = coords ? distanceMeters(coords, activity.location) : null;
  const decision = queuedIds.includes(registration.id)
    ? ({ ok: false, reason: 'already_submitted', message: 'ถ่ายรูปแล้ว รอส่งเมื่อกลับมาออนไลน์' } as const)
    : canCheckIn({ activity, registration, distanceM: distance, now });

  const relocateForDemo = async () => {
    if (!coords) return;
    setError(null);
    try {
      await relocate(activity.id, coords);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ย้ายสถานที่ไม่สำเร็จ');
    }
  };

  const submit = async () => {
    if (!photo || !coords || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await checkIn({
        registrationId: registration.id,
        photoBase64: photo.base64,
        latitude: coords.latitude,
        longitude: coords.longitude,
        takenAt: photo.takenAt,
        photoSource: photo.source,
        createdAt: new Date().toISOString(),
      });
      setOutcome(result);
    } catch (e) {
      // server ปฏิเสธ (เช่น ตรวจแล้วอยู่นอกพื้นที่) → บอกเหตุผล รูปยังอยู่ ลองส่งใหม่ได้
      setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const applyPhoto = async (uri: string, takenAt: string, source: PhotoSource) => {
    setProcessing(true);
    setError(null);
    setRejectedPick(null);
    try {
      const prepared = await preparePhotoForUpload(uri);
      setPhoto({ ...prepared, takenAt, source });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ประมวลผลรูปไม่สำเร็จ');
    } finally {
      setProcessing(false);
    }
  };

  const onCaptured = (uri: string) => {
    // บันทึกเวลาตอนถ่าย ไม่ใช่ตอนส่ง: ถ้าออฟไลน์แล้วส่งทีหลัง server ยังตรวจได้ว่าถ่ายในช่วงงาน
    setCameraOpen(false);
    applyPhoto(uri, new Date().toISOString(), 'camera');
  };

  const pickFromLibrary = async () => {
    setError(null);
    setRejectedPick(null);
    const picked = await pickPhotoFromLibrary();
    if (!picked) return;
    const { uri, takenAt } = picked;
    const problem = photoTimeProblem(activity, takenAt);
    if (problem || !takenAt) {
      setError(problem);
      if (__DEV__) setRejectedPick(uri);
      return;
    }
    applyPhoto(uri, takenAt, 'library');
  };

  if (cameraOpen) {
    return (
      <CheckInCamera
        initialFacing={isPaper ? 'back' : 'front'}
        hint={isPaper ? 'ถ่ายให้เห็นชื่อและลายเซ็นของคุณในใบเซ็นชื่อชัด ๆ' : 'ถ่ายตัวคุณให้เห็นบรรยากาศงานด้านหลัง'}
        onCapture={onCaptured}
        onClose={() => setCameraOpen(false)}
      />
    );
  }

  return (
    <Screen>
      <Card>
        <SectionTitle>{activity.title}</SectionTitle>
        <Text style={styles.muted}>
          {isPaper
            ? 'กิจกรรมนี้ใช้ใบเซ็นชื่อกระดาษ: เซ็นชื่อกับผู้จัดก่อน แล้วถ่ายรูปใบเซ็นชื่อเป็นหลักฐาน'
            : 'ยืนยันว่าอยู่ในงาน: ตรวจตำแหน่ง แล้วถ่ายรูปตัวเองที่งาน'}
        </Text>
      </Card>

      {/* ขั้นที่ 1: ตำแหน่ง */}
      <Card>
        <StepTitle n={1} title="ตรวจตำแหน่ง" done={decision.ok || decision.reason === 'already_submitted'} />
        <ActivityMap venue={activity.location} title={activity.title} user={coords} height={200} />
        {location.status === 'locating' ? <Banner tone="info" icon="locate">กำลังหาตำแหน่งของคุณ…</Banner> : null}
        {location.status === 'denied' ? (
          <>
            <Banner tone="danger" icon="location-outline">
              ต้องใช้ตำแหน่งเพื่อยืนยันว่าคุณอยู่ในพื้นที่จัดงาน แอปใช้ตำแหน่งเฉพาะตอนเช็กอิน ไม่ติดตามเบื้องหลัง
            </Banner>
            {location.canAskAgain || Platform.OS === 'web' ? (
              <Button title="อนุญาตตำแหน่ง" icon="locate" onPress={locate} />
            ) : (
              <Button title="เปิดการตั้งค่าเพื่ออนุญาตตำแหน่ง" icon="settings-outline" onPress={() => Linking.openSettings()} />
            )}
          </>
        ) : null}
        {location.status === 'error' ? (
          <>
            <Banner tone="danger">{location.message}</Banner>
            <Button title="ลองหาตำแหน่งอีกครั้ง" icon="refresh" variant="secondary" onPress={locate} />
          </>
        ) : null}
        {distance !== null ? (
          // ผ่าน/ไม่ผ่านบอกด้วยข้อความด้วย ไม่ใช่แค่สีและรูปไอคอน (screen reader อ่านได้ คนตาบอดสีแยกได้)
          <View style={styles.distanceRow} accessible>
            <Ionicons
              name={distance <= activity.location.radiusM ? 'checkmark-circle' : 'close-circle'}
              size={28}
              color={distance <= activity.location.radiusM ? Colors.success : Colors.danger}
            />
            <Text style={styles.distanceText}>
              {distance <= activity.location.radiusM ? 'อยู่ในพื้นที่' : 'อยู่นอกพื้นที่'} · ห่างจุดจัดงาน {formatDistance(distance)} (ต้องไม่เกิน{' '}
              {activity.location.radiusM} ม.)
            </Text>
          </View>
        ) : null}
        {!decision.ok && location.status === 'ok' ? <Banner tone="danger">{decision.message}</Banner> : null}
        {!decision.ok && decision.reason === 'too_far' ? (
          <>
            <Button title="ตรวจตำแหน่งอีกครั้ง" icon="refresh" variant="secondary" onPress={locate} />
            {__DEV__ ? (
              <Button
                title="โหมดสาธิต: ย้ายสถานที่จัดงานมาที่ตำแหน่งฉัน"
                icon="flask-outline"
                variant="ghost"
                loading={relocating}
                onPress={relocateForDemo}
              />
            ) : null}
          </>
        ) : null}
      </Card>

      {/* ขั้นที่ 2: ถ่ายรูป */}
      <Card>
        <StepTitle n={2} title="ถ่ายหลักฐานการเข้าร่วม" done={!!photo} />
        {processing ? <StateView kind="loading" message="กำลังเตรียมรูป…" /> : null}
        {photo ? (
          <>
            <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" accessibilityLabel="รูปที่จะส่ง" />
            <Text style={styles.muted}>
              {PHOTO_SOURCE_LABEL[photo.source]} · ถ่ายเมื่อ {formatTime(photo.takenAt)}
            </Text>
            <Button title="ถ่ายใหม่" icon="camera-reverse-outline" variant="secondary" disabled={submitting} onPress={() => setCameraOpen(true)} />
            {CAN_PICK_FROM_LIBRARY ? (
              <Button title="เลือกรูปอื่นจากคลัง" icon="images-outline" variant="ghost" disabled={submitting} onPress={pickFromLibrary} />
            ) : null}
          </>
        ) : (
          <>
            <Button title="เปิดกล้อง" icon="camera" disabled={!decision.ok || processing} onPress={() => setCameraOpen(true)} />
            {CAN_PICK_FROM_LIBRARY ? (
              <Button
                title="เลือกจากคลังรูป"
                icon="images-outline"
                variant="secondary"
                disabled={!decision.ok || processing}
                onPress={pickFromLibrary}
                accessibilityHint="ใช้ได้เฉพาะรูปที่ถ่ายระหว่างงานนี้"
              />
            ) : null}
          </>
        )}
        <Text style={styles.muted}>
          {Platform.OS !== 'web'
            ? 'เลือกจากคลังได้ แต่ต้องเป็นรูปที่ถ่ายระหว่างงานนี้ (แอปตรวจจากเวลาในรูป) และผู้จัดจะเห็นว่ารูปมาจากคลัง'
            : __DEV__
              ? 'บนเว็บอ่านเวลาถ่ายของรูปไม่ได้ รูปจากคลังจึงส่งได้เฉพาะเป็นรูปทดสอบ (โหมดสาธิต)'
              : 'บนเว็บต้องถ่ายสดเท่านั้น เพราะเบราว์เซอร์อ่านเวลาถ่ายของรูปในคลังไม่ได้'}
        </Text>
      </Card>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {__DEV__ && rejectedPick ? (
        <Button
          title="โหมดสาธิต: ใช้รูปนี้เป็นรูปทดสอบ"
          icon="flask-outline"
          variant="ghost"
          onPress={() => applyPhoto(rejectedPick, new Date().toISOString(), 'demo')}
          accessibilityHint="ข้ามการตรวจเวลาถ่าย รูปจะถูกบันทึกว่าเป็นรูปทดสอบ"
        />
      ) : null}
      <Button
        title={submitting ? 'กำลังส่ง…' : isPaper ? 'ส่งหลักฐาน' : 'ยืนยันเช็กอิน'}
        icon="send"
        loading={submitting}
        disabled={!decision.ok || !photo}
        onPress={submit}
      />
    </Screen>
  );
}

function StepTitle({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    // อ่านเป็นประโยคเดียว "ขั้นที่ 1 ตรวจตำแหน่ง เสร็จแล้ว" แทนที่จะรู้ว่าเสร็จจากสีเขียวอย่างเดียว
    <View style={styles.step} accessible accessibilityRole="header" accessibilityLabel={`ขั้นที่ ${n} ${title}${done ? ' เสร็จแล้ว' : ''}`}>
      <View style={[styles.stepNum, done && { backgroundColor: Colors.success }]}>
        {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={styles.stepNumText}>{n}</Text>}
      </View>
      <SectionTitle>{title}</SectionTitle>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  // minWidth/minHeight แทนขนาดตายตัว: ตัวอักษรขยาย 200% แล้ววงกลมโตตาม ตัวเลขไม่ล้น
  stepNum: {
    minWidth: 28,
    minHeight: 28,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '700' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  distanceText: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 3 / 4, maxHeight: 420, borderRadius: Radius.md, backgroundColor: Colors.border },
});
