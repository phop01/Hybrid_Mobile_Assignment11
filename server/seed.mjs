// ข้อมูลตัวอย่างของ server
// เวลาของกิจกรรมคำนวณจาก "ตอนเปิด server" เพื่อให้สาธิตได้ทุกวัน
// (ถ้าเขียนวันที่ตายตัว วันสอบกิจกรรมจะจบไปหมดแล้ว)

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// พิกัดอ้างอิง: มหาวิทยาลัยขอนแก่น วิทยาเขตหนองคาย (ถ.มิตรภาพ ต.หนองกอมเกาะ อ.เมืองหนองคาย)
// ชื่อสถานที่ในงานด้านล่างเป็นชื่อสมมติ พิกัดคำนวณจากจุดอ้างอิงนี้
const CAMPUS = { latitude: 17.8066, longitude: 102.7463 };

function at(offsetMs, roundTo30 = true) {
  const date = new Date(Date.now() + offsetMs);
  if (roundTo30) {
    date.setMinutes(date.getMinutes() < 30 ? 0 : 30, 0, 0);
  }
  return date.toISOString();
}

/** วันถัดไปอีก dayOffset วัน เวลา hour:minute (เวลาเครื่อง server) ใช้กับกิจกรรมล่วงหน้าให้เวลาสมจริง */
function dayAt(dayOffset, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function place(name, dLat, dLng, radiusM = 150) {
  return {
    name,
    latitude: Number((CAMPUS.latitude + dLat).toFixed(6)),
    longitude: Number((CAMPUS.longitude + dLng).toFixed(6)),
    radiusM,
  };
}

export function buildActivities() {
  return [
    {
      id: 'demo-app-checkin',
      title: 'สาธิตระบบเช็กอิน: เปิดบ้านชมรมคอมพิวเตอร์',
      description:
        'กิจกรรมสำหรับสาธิตการเช็กอินในแอป ต้องอยู่ในรัศมีสถานที่จัดงานและถ่ายรูปสดเพื่อยืนยันการเข้าร่วม ' +
        'ตอนแรกสถานที่อยู่ไกลจากคุณ ให้ลองเช็กอินเพื่อดูว่าระบบปฏิเสธ แล้วใช้ปุ่มโหมดสาธิตย้ายสถานที่มาที่ตำแหน่งปัจจุบัน',
      category: 'academic',
      startsAt: at(15 * MINUTE, false),
      endsAt: at(3 * HOUR, false),
      location: place('ลานกิจกรรมกลาง', 0.012, 0.015),
      checkInMethod: 'app',
      capacity: 80,
      baseRegistered: 41,
    },
    {
      id: 'demo-paper-checkin',
      title: 'ค่ายอาสาพัฒนาชุมชนรอบวิทยาเขต',
      description:
        'ผู้จัดใช้ใบเซ็นชื่อแบบกระดาษ หลังเซ็นชื่อแล้วให้ถ่ายรูปใบเซ็นชื่อตรงบรรทัดของคุณเป็นหลักฐาน ' +
        'ผู้จัดจะตรวจเทียบกับกระดาษก่อนนับว่าเข้าร่วม',
      category: 'volunteer',
      startsAt: at(-10 * MINUTE, false),
      endsAt: at(2 * HOUR, false),
      location: place('ศาลาชุมชน ต.หนองกอมเกาะ', -0.009, 0.011, 200),
      checkInMethod: 'paper',
      capacity: 40,
      baseRegistered: 22,
    },
    {
      id: 'mobile-dev-seminar',
      title: 'สัมมนา Mobile App Development ในอุตสาหกรรม',
      description: 'วิทยากรจากบริษัทพัฒนาแอปมาเล่าประสบการณ์การทำแอประดับ production และตอบคำถามเรื่องการฝึกงาน',
      category: 'academic',
      startsAt: at(2 * HOUR),
      endsAt: at(4 * HOUR),
      location: place('ห้องประชุม คณะสหวิทยาการ', 0.001, -0.002, 120),
      checkInMethod: 'app',
      capacity: 120,
      baseRegistered: 87,
    },
    {
      id: 'futsal-friendly',
      title: 'ฟุตซอลกระชับมิตรระหว่างสาขาวิชา',
      description: 'แข่งขันฟุตซอลแบบทีมละ 5 คน เน้นสนุกและสร้างความสัมพันธ์ระหว่างสาขาวิชา มีน้ำดื่มและผ้าเย็นให้',
      category: 'sport',
      startsAt: dayAt(1, 16),
      endsAt: dayAt(1, 19),
      location: place('สนามฟุตซอลในร่ม ศูนย์กีฬา', -0.004, -0.006, 150),
      checkInMethod: 'app',
      capacity: 60,
      baseRegistered: 38,
    },
    {
      id: 'ux-workshop',
      title: 'Workshop ออกแบบ UX สำหรับแอปมือถือ',
      description: 'ฝึกทำ user flow และ prototype ในเวลา 3 ชั่วโมง รับจำนวนจำกัดเพื่อให้วิทยากรดูแลได้ทั่วถึง',
      category: 'academic',
      startsAt: dayAt(2, 13),
      endsAt: dayAt(2, 16),
      location: place('ห้องปฏิบัติการ 2 อาคารเรียนรวม', 0.003, 0.004, 120),
      checkInMethod: 'app',
      capacity: 30,
      baseRegistered: 30,
    },
    {
      id: 'thai-music-contest',
      title: 'ประกวดวงดนตรีไทยร่วมสมัย',
      description: 'ชมการประกวดวงดนตรีไทยจากทุกสาขาวิชา ผู้ชมร่วมโหวตวงยอดนิยมได้ มีการแสดงพิเศษช่วงพักกรรมการ',
      category: 'culture',
      startsAt: dayAt(5, 17, 30),
      endsAt: dayAt(5, 21),
      location: place('หอประชุมใหญ่', -0.002, 0.007, 200),
      checkInMethod: 'paper',
      capacity: 500,
      baseRegistered: 212,
    },
    {
      id: 'tree-planting',
      title: 'ปลูกป่าเฉลิมพระเกียรติ',
      description: 'ร่วมปลูกต้นไม้บริเวณพื้นที่ป่าของวิทยาเขต แต่งกายชุดพร้อมลุย มีรถรับส่งจากหน้าหอพัก',
      category: 'volunteer',
      startsAt: dayAt(7, 7),
      endsAt: dayAt(7, 11),
      location: place('แปลงป่าชุมชน ฝั่งตะวันตก', 0.006, -0.014, 300),
      checkInMethod: 'paper',
      capacity: 150,
      baseRegistered: 64,
    },
    {
      id: 'blood-donation',
      title: 'บริจาคโลหิตประจำภาคเรียน',
      description: 'ร่วมบริจาคโลหิตกับสภากาชาด กิจกรรมนี้จบไปแล้ว ใช้แสดงสถานะกิจกรรมที่ผ่านมา',
      category: 'volunteer',
      startsAt: dayAt(-1, 9),
      endsAt: dayAt(-1, 15),
      location: place('โรงอาหารกลาง ชั้น 2', 0.002, 0.001, 120),
      checkInMethod: 'app',
      capacity: 200,
      baseRegistered: 143,
    },
  ];
}

// รหัสผ่านเก็บเป็น hash ใน server.mjs ตอนเริ่มระบบ ไม่เก็บตัวจริงในฐานข้อมูล
// บัญชีเหล่านี้เป็นข้อมูลทดสอบ ไม่ใช่บัญชีจริง
export const DEMO_USERS = [
  {
    id: 'u1',
    studentId: '6601234567',
    password: 'campus1234',
    fullName: 'สมชาย ใจดี',
    faculty: 'คณะสหวิทยาการ มข. วิทยาเขตหนองคาย',
  },
  {
    id: 'u2',
    studentId: '6609876543',
    password: 'campus1234',
    fullName: 'สมหญิง รักเรียน',
    faculty: 'คณะสหวิทยาการ มข. วิทยาเขตหนองคาย',
  },
];
