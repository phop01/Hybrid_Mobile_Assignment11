import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActivityMap } from '@/components/activity-map';
import { Banner, Button, Card, Screen, SectionTitle, StateView } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { firstParam, useActivity } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { canCheckIn, photoTimeProblem } from '@/lib/check-in-rules';
import { formatDistance, formatTime } from '@/lib/format';
import { distanceMeters, type Coordinates } from '@/lib/geo';
import { parseExifTakenAt, PHOTO_SOURCE_LABEL } from '@/lib/photo-time';
import { ApiError } from '@/services/api-client';
import { relocateActivityForDemo } from '@/services/campus-api';
import { getCurrentCoordinates } from '@/services/location';
import { preparePhotoForUpload } from '@/services/photo';
import { useActivities } from '@/state/activities-context';
import { useMyRegistrations, type CheckInOutcome } from '@/state/my-registrations-context';
import { useAuthenticatedSession } from '@/state/session-context';
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
  const session = useAuthenticatedSession();
  const { findById, checkIn, queuedIds, loading: regsLoading } = useMyRegistrations();
  const { upsert } = useActivities();
  const registration = registrationId ? findById(registrationId) : undefined;
  const activityState = useActivity(registration?.activityId);

  const [location, setLocation] = useState<LocationState>({ status: 'locating' });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const [relocating, setRelocating] = useState(false);
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
    if (!session || !coords) return;
    setRelocating(true);
    setError(null);
    try {
      upsert(await relocateActivityForDemo(session.token, activity.id, coords));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ย้ายสถานที่ไม่สำเร็จ');
    } finally {
      setRelocating(false);
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
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
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
    // ไม่ต้องขอสิทธิ์คลังภาพ: ตัวเลือกรูปของระบบให้ผู้ใช้เลือกเองทีละรูป แอปเห็นแค่รูปที่เลือก
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // ใช้เวลาถ่ายจริงในรูป ไม่ใช่เวลาที่กดเลือก ไม่งั้นรูปเก่าจะผ่านการตรวจเวลา
    const takenAt = parseExifTakenAt(asset.exif);
    const problem = photoTimeProblem(activity, takenAt);
    if (problem || !takenAt) {
      setError(problem);
      if (__DEV__) setRejectedPick(asset.uri);
      return;
    }
    applyPhoto(asset.uri, takenAt, 'library');
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
          <View style={styles.distanceRow} accessible accessibilityLabel={`ห่างจุดจัดงาน ${formatDistance(distance)}`}>
            <Ionicons
              name={distance <= activity.location.radiusM ? 'checkmark-circle' : 'close-circle'}
              size={28}
              color={distance <= activity.location.radiusM ? Colors.success : Colors.danger}
            />
            <Text style={styles.distanceText}>
              ห่างจุดจัดงาน {formatDistance(distance)} (ต้องไม่เกิน {activity.location.radiusM} ม.)
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
      <Card style={!decision.ok && styles.disabledCard}>
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
    <View style={styles.step}>
      <View style={[styles.stepNum, done && { backgroundColor: Colors.success }]}>
        {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={styles.stepNumText}>{n}</Text>}
      </View>
      <SectionTitle>{title}</SectionTitle>
    </View>
  );
}

function CheckInCamera({
  initialFacing,
  hint,
  onCapture,
  onClose,
}: {
  initialFacing: CameraType;
  hint: string;
  onCapture: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>(initialFacing);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <StateView kind="loading" message="กำลังเตรียมกล้อง…" />;

  if (!permission.granted) {
    // ขอสิทธิ์ตอนผู้ใช้กดเปิดกล้อง อธิบายก่อนว่าเอาไปทำอะไร
    return (
      <Screen>
        <StateView
          kind="empty"
          icon="camera-outline"
          title="ต้องใช้กล้องเพื่อถ่ายหลักฐานการเข้าร่วม"
          message="รูปใช้เป็นหลักฐานว่าคุณเข้าร่วมกิจกรรมจริง แอปไม่อ่านคลังภาพเอง เห็นเฉพาะรูปที่คุณเลือกเท่านั้น"
        />
        {permission.canAskAgain ? (
          <Button title="อนุญาตให้ใช้กล้อง" icon="camera" onPress={requestPermission} />
        ) : (
          <>
            <Banner tone="danger">ปิดสิทธิ์กล้องไว้ ต้องเปิดในการตั้งค่าของเครื่องก่อนจึงจะเช็กอินได้</Banner>
            <Button title="เปิดการตั้งค่า" icon="settings-outline" onPress={() => Linking.openSettings()} />
          </>
        )}
        <Button title="ยกเลิก" variant="ghost" onPress={onClose} />
      </Screen>
    );
  }

  const shoot = async () => {
    if (!ready || busy || !cameraRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!picture?.uri) throw new Error('ถ่ายรูปไม่สำเร็จ');
      onCapture(picture.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ถ่ายรูปไม่สำเร็จ ลองใหม่');
      setBusy(false);
    }
  };

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        onCameraReady={() => setReady(true)}
        onMountError={() => setError('เปิดกล้องไม่ได้ ลองปิดแอปอื่นที่ใช้กล้องแล้วลองใหม่')}
      />
      <View style={styles.cameraHint}>
        <Text style={styles.cameraHintText}>{hint}</Text>
      </View>
      {error ? (
        <View style={styles.cameraError}>
          <Banner tone="danger">{error}</Banner>
        </View>
      ) : null}
      <View style={styles.cameraBar}>
        <Pressable style={styles.roundBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="ปิดกล้อง">
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Pressable
          style={[styles.shutter, (!ready || busy) && { opacity: 0.5 }]}
          onPress={shoot}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityLabel="ถ่ายรูป">
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable
          style={styles.roundBtn}
          onPress={() => {
            setReady(false);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          accessibilityRole="button"
          accessibilityLabel="สลับกล้องหน้าหลัง">
          <Ionicons name="camera-reverse" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  disabledCard: { opacity: 0.6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '700' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  distanceText: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 3 / 4, maxHeight: 420, borderRadius: Radius.md, backgroundColor: Colors.border },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  cameraHint: {
    position: 'absolute',
    top: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  cameraHintText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  cameraError: { position: 'absolute', top: 100, left: Spacing.lg, right: Spacing.lg },
  cameraBar: {
    position: 'absolute',
    bottom: Spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  roundBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
});
