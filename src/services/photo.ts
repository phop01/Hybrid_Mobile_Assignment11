import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { parseExifTakenAt } from '@/lib/photo-time';

const MAX_WIDTH = 960;

/**
 * ย่อรูปก่อนส่ง: รูปจากกล้องมือถือมักมีขนาดหลาย MB ส่งช้า โดยเฉพาะตอนเน็ตในงานไม่ดี
 * กว้าง 960px ยังอ่านชื่อและลายเซ็นในใบเซ็นชื่อได้ชัด
 */
export async function preparePhotoForUpload(uri: string): Promise<{ uri: string; base64: string }> {
  const context = ImageManipulator.manipulate(uri).resize({ width: MAX_WIDTH, height: null });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('แปลงรูปไม่สำเร็จ กรุณาถ่ายใหม่');
  return { uri: result.uri, base64: result.base64 };
}

/**
 * เปิดตัวเลือกรูปของระบบ คืนรูปที่เลือกพร้อมเวลาถ่ายจริงจาก EXIF (null = ไม่มีข้อมูลเวลา)
 * ไม่ต้องขอสิทธิ์คลังภาพ: ผู้ใช้เลือกเองทีละรูป แอปเห็นแค่รูปที่เลือก
 * คืน null ถ้าผู้ใช้กดยกเลิก
 */
export async function pickPhotoFromLibrary(): Promise<{ uri: string; takenAt: string | null } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  // ใช้เวลาถ่ายจริงในรูป ไม่ใช่เวลาที่กดเลือก ไม่งั้นรูปเก่าจะผ่านการตรวจเวลา
  return { uri: asset.uri, takenAt: parseExifTakenAt(asset.exif) };
}
