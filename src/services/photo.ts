import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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
