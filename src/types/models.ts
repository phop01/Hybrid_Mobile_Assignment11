// โครงสร้างข้อมูลหลักของ เช็กอินกิจกรรม
// กำหนดด้วย TypeScript ตั้งแต่แรก เพื่อให้ข้อมูลผิดรูปแบบถูกจับได้ตั้งแต่ตอนเขียนโค้ด

export type Category = 'academic' | 'volunteer' | 'sport' | 'culture';

/** วิธีที่ผู้จัดใช้เช็กชื่อ: เช็กอินในแอป หรือใบเซ็นชื่อกระดาษ */
export type CheckInMethod = 'app' | 'paper';

export type Venue = {
  name: string;
  latitude: number;
  longitude: number;
  /** รัศมีที่ถือว่า "อยู่ในงาน" (เมตร) */
  radiusM: number;
};

export type Activity = {
  id: string;
  title: string;
  description: string;
  category: Category;
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  location: Venue;
  checkInMethod: CheckInMethod;
  capacity: number;
  registeredCount: number;
};

export type RegistrationStatus = 'registered' | 'pending_review' | 'checked_in' | 'cancelled';

/**
 * ที่มาของรูปเช็กอิน: ให้ผู้จัดรู้ว่ารูปไหนถ่ายสด รูปไหนเลือกจากคลัง
 * 'demo' = รูปทดสอบในโหมดสาธิต (ข้ามการตรวจเวลาถ่าย) server รับเฉพาะตอนเปิด demo mode
 */
export type PhotoSource = 'camera' | 'library' | 'demo';

export type CheckInRecord = {
  photoUrl: string;
  /** ข้อมูลเก่าก่อนมีฟีเจอร์เลือกจากคลังไม่มีช่องนี้ = ถ่ายสด */
  photoSource?: PhotoSource;
  latitude: number;
  longitude: number;
  distanceM: number;
  takenAt: string;
  submittedAt: string;
  verifiedAt: string | null;
};

export type RegistrationForm = {
  fullName: string;
  studentId: string;
  faculty: string;
  phone: string;
  dietary: string;
};

export type Registration = {
  id: string;
  activityId: string;
  status: RegistrationStatus;
  registeredAt: string;
  form: RegistrationForm;
  checkIn: CheckInRecord | null;
};

export type User = {
  id: string;
  studentId: string;
  fullName: string;
  faculty: string;
};

/** ข้อมูลเช็กอินที่ถ่ายแล้วแต่ยังส่งไม่ได้ (ออฟไลน์) */
export type PendingCheckIn = {
  registrationId: string;
  photoBase64: string;
  photoSource: PhotoSource;
  latitude: number;
  longitude: number;
  takenAt: string;
  createdAt: string;
};
