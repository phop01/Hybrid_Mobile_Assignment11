# CampusPass แอปเช็กอินกิจกรรมมหาวิทยาลัย

Assignment 11 รายวิชา Hybrid Mobile Application Programming
รวมเนื้อหาสัปดาห์ 1–11 ไว้ในแอปเดียว สร้างด้วย React Native + Expo SDK 57 + TypeScript + Expo Router

| | |
|---|---|
| ผู้พัฒนา | นายปภพ สุระทิพย์ |
| รหัสนักศึกษา | 663450176-7 |
| GitHub | _ลิงก์ repository_ |

## แอปนี้ทำอะไร

นักศึกษาค้นหาและลงทะเบียนกิจกรรม แล้ว**เช็กอินที่งานด้วยตำแหน่ง + รูปถ่ายสด**
(หรือถ่ายรูปใบเซ็นชื่อกระดาษเป็นหลักฐาน) แอปนับจำนวนกิจกรรมที่เข้าร่วมให้ในโปรไฟล์

## เนื้อหาแต่ละสัปดาห์ในแอป

| สัปดาห์ | หัวข้อ | ใช้ในแอป |
|---|---|---|
| 1 | Expo + TypeScript | หน้าโปรไฟล์, type ของข้อมูล |
| 2 | Components, Props, State | การ์ดกิจกรรมที่ใช้ซ้ำหลายหน้า |
| 3 | Styling, Lists | รายการกิจกรรม (FlatList), Loading/Empty/Error |
| 4 | Expo Router | Tabs + Stack, หน้ารายละเอียด, deep link |
| 5 | Forms + State | ค้นหา/กรอง, บันทึกไว้, ฟอร์มลงทะเบียน |
| 6 | REST API | API server ใน repo |
| 7 | Storage + Offline | AsyncStorage, SQLite, ใช้งานตอนไม่มีเน็ต |
| 8 | Authentication | Login, token ใน SecureStore, หน้าที่ต้อง Login |
| 9 | Camera | ถ่ายรูปยืนยันตอนเช็กอิน |
| 10 | Location + Maps | ตรวจว่าอยู่ในพื้นที่งาน, แผนที่ |
| 11 | Notifications | แจ้งเตือนเมื่อเปิดเช็กอิน |

## ติดตั้งและรัน

ต้องมี Node.js LTS และแอป Expo Go บนมือถือ

```bash
npm install
npm start
```

สแกน QR ด้วย Expo Go (มือถือต้องต่อ Wi-Fi วงเดียวกับคอม) หรือกด `w` เพื่อเปิดบนเว็บ

**บัญชีทดสอบ:** รหัสนักศึกษา `6601234567` รหัสผ่าน `campus1234`

## เอกสารเพิ่มเติม

- [docs/DESIGN.md](docs/DESIGN.md): เหตุผลของแต่ละฟีเจอร์
- [docs/DIAGRAMS.md](docs/DIAGRAMS.md): แผนภาพการทำงาน
- [docs/TESTING.md](docs/TESTING.md): ผลการทดสอบ, ขั้นตอนสาธิต, การแก้ปัญหา
