// เช็กอินกิจกรรม API server
// ใช้ Node.js ล้วน (node:http) ไม่ต้องติดตั้ง package เพิ่ม เพื่อให้ clone แล้วรันได้ทันที
//
// เหตุผลที่ต้องมี server กลาง:
// - ที่นั่งคงเหลือต้องเห็นตรงกันทุกคน
// - ผลเช็กอินต้องถูกเก็บไว้ที่ที่ผู้จัดตรวจได้ และ server ต้องตรวจระยะทาง/เวลาซ้ำ
//   เพราะค่าที่ส่งมาจากแอปถูกแก้ไขได้

import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildActivities, DEMO_USERS } from './seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '.data');
const DB_FILE = join(DATA_DIR, 'db.json');
const UPLOAD_DIR = join(DATA_DIR, 'uploads');

export const PORT = Number(process.env.API_PORT ?? 3001);
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_IN_OPENS_BEFORE_MS = 30 * 60 * 1000;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PAPER_REVIEW_DELAY_MS = 8000;

// ---------- ฐานข้อมูล (ไฟล์ JSON) ----------

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 32);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function loadDb() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  let saved = { registrations: [], sessions: [] };
  if (existsSync(DB_FILE)) {
    try {
      saved = JSON.parse(readFileSync(DB_FILE, 'utf8'));
    } catch {
      console.warn('[api] อ่าน db.json ไม่ได้ เริ่มฐานข้อมูลใหม่');
    }
  }
  return {
    // กิจกรรมสร้างใหม่ทุกครั้งที่เปิด server เพื่อให้เวลาเป็นปัจจุบันเสมอ
    activities: buildActivities(),
    users: DEMO_USERS.map(({ password, ...user }) => ({ ...user, passwordHash: hashPassword(password) })),
    registrations: Array.isArray(saved.registrations) ? saved.registrations : [],
    sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
  };
}

const db = loadDb();

function persist() {
  const { registrations, sessions } = db;
  writeFileSync(DB_FILE, JSON.stringify({ registrations, sessions }, null, 2));
}

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PHOTO_BYTES * 1.5) throw new HttpError(413, 'too_large', 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function activeRegistrations(activityId) {
  return db.registrations.filter((r) => r.activityId === activityId && r.status !== 'cancelled');
}

function publicActivity(activity) {
  const { baseRegistered, ...rest } = activity;
  return { ...rest, registeredCount: baseRegistered + activeRegistrations(activity.id).length };
}

function findActivity(id) {
  const activity = db.activities.find((a) => a.id === id);
  if (!activity) throw new HttpError(404, 'activity_not_found', 'ไม่พบกิจกรรมนี้');
  return activity;
}

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function publicRegistration(registration) {
  const { idempotencyKey, userId, ...rest } = registration;
  return rest;
}

function requireUser(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = db.sessions.find((s) => s.token === token);
  if (!session || session.expiresAt < Date.now()) {
    throw new HttpError(401, 'unauthorized', 'กรุณาเข้าสู่ระบบใหม่');
  }
  return db.users.find((u) => u.id === session.userId);
}

function findOwnRegistration(user, id) {
  const registration = db.registrations.find((r) => r.id === id);
  // ไม่บอกว่ามีอยู่จริงถ้าไม่ใช่ของผู้ใช้คนนี้ เพื่อไม่ให้เดา ID ของคนอื่นได้
  if (!registration || registration.userId !== user.id) {
    throw new HttpError(404, 'registration_not_found', 'ไม่พบการลงทะเบียนนี้');
  }
  return registration;
}

// ---------- validation (ซ้ำกับฝั่งแอป เพราะ client ถูกแก้ไขได้) ----------

function validateRegistrationBody(body) {
  const errors = {};
  if (typeof body.fullName !== 'string' || body.fullName.trim().length < 2) errors.fullName = 'กรุณากรอกชื่อ-นามสกุล';
  if (typeof body.studentId !== 'string' || !/^\d{10}$/.test(body.studentId)) errors.studentId = 'รหัสนักศึกษาต้องเป็นตัวเลข 10 หลัก';
  if (typeof body.faculty !== 'string' || body.faculty.trim().length < 2) errors.faculty = 'กรุณากรอกคณะ';
  if (typeof body.phone !== 'string' || !/^0\d{9}$/.test(body.phone)) errors.phone = 'เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 10 หลัก';
  if (body.dietary !== undefined && (typeof body.dietary !== 'string' || body.dietary.length > 200)) {
    errors.dietary = 'ข้อจำกัดด้านอาหารยาวเกินไป';
  }
  return errors;
}

// ---------- routes ----------

async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key',
    });
    return res.end();
  }

  // GET /health
  if (method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, demoMode: DEMO_MODE });
  }

  // GET /uploads/:file (รูปหลักฐานเช็กอิน)
  if (method === 'GET' && parts[0] === 'uploads' && parts.length === 2 && /^[\w-]+\.jpg$/.test(parts[1])) {
    const file = join(UPLOAD_DIR, parts[1]);
    if (!existsSync(file)) throw new HttpError(404, 'not_found', 'ไม่พบรูป');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
    return createReadStream(file).pipe(res);
  }

  // POST /auth/login
  if (method === 'POST' && url.pathname === '/auth/login') {
    const body = await readJson(req);
    const user = db.users.find((u) => u.studentId === body.studentId);
    // ข้อความเดียวกันทั้งกรณีไม่มีผู้ใช้และรหัสผิด เพื่อไม่บอกว่ารหัสนักศึกษาไหนมีอยู่
    if (!user || typeof body.password !== 'string' || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, 'invalid_credentials', 'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง');
    }
    const session = { token: randomBytes(32).toString('hex'), userId: user.id, expiresAt: Date.now() + TOKEN_TTL_MS };
    db.sessions.push(session);
    persist();
    return send(res, 200, { token: session.token, expiresAt: new Date(session.expiresAt).toISOString(), user: publicUser(user) });
  }

  // POST /auth/logout
  if (method === 'POST' && url.pathname === '/auth/logout') {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    db.sessions = db.sessions.filter((s) => s.token !== token);
    persist();
    return send(res, 204);
  }

  // GET /me
  if (method === 'GET' && url.pathname === '/me') {
    return send(res, 200, publicUser(requireUser(req)));
  }

  // GET /activities
  if (method === 'GET' && url.pathname === '/activities') {
    const list = [...db.activities].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(publicActivity);
    return send(res, 200, list);
  }

  // GET /activities/:id
  if (method === 'GET' && parts[0] === 'activities' && parts.length === 2) {
    return send(res, 200, publicActivity(findActivity(parts[1])));
  }

  // POST /activities/:id/registrations
  if (method === 'POST' && parts[0] === 'activities' && parts[2] === 'registrations' && parts.length === 3) {
    const user = requireUser(req);
    const activity = findActivity(parts[1]);
    const body = await readJson(req);
    const idempotencyKey = req.headers['idempotency-key'];

    // ส่งซ้ำด้วย key เดิม (เช่น เน็ตหลุดแล้วกดลองใหม่) → คืนผลเดิม ไม่สร้างรายการใหม่
    if (idempotencyKey) {
      const previous = db.registrations.find((r) => r.idempotencyKey === idempotencyKey && r.userId === user.id);
      if (previous) return send(res, 200, publicRegistration(previous));
    }

    const errors = validateRegistrationBody(body);
    if (Object.keys(errors).length > 0) {
      return send(res, 400, { code: 'validation_failed', message: 'ข้อมูลไม่ถูกต้อง', fields: errors });
    }
    if (new Date(activity.endsAt).getTime() < Date.now()) {
      throw new HttpError(409, 'activity_ended', 'กิจกรรมนี้จบไปแล้ว');
    }
    if (activeRegistrations(activity.id).some((r) => r.userId === user.id)) {
      throw new HttpError(409, 'already_registered', 'คุณลงทะเบียนกิจกรรมนี้แล้ว');
    }
    if (publicActivity(activity).registeredCount >= activity.capacity) {
      throw new HttpError(409, 'activity_full', 'กิจกรรมนี้เต็มแล้ว');
    }

    const registration = {
      id: randomUUID(),
      activityId: activity.id,
      userId: user.id,
      status: 'registered',
      registeredAt: new Date().toISOString(),
      form: {
        fullName: body.fullName.trim(),
        studentId: body.studentId,
        faculty: body.faculty.trim(),
        phone: body.phone,
        dietary: (body.dietary ?? '').trim(),
      },
      checkIn: null,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    };
    db.registrations.push(registration);
    persist();
    return send(res, 201, publicRegistration(registration));
  }

  // GET /registrations (ของฉัน)
  if (method === 'GET' && url.pathname === '/registrations') {
    const user = requireUser(req);
    const list = db.registrations
      .filter((r) => r.userId === user.id)
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
      .map(publicRegistration);
    return send(res, 200, list);
  }

  // GET /registrations/:id
  if (method === 'GET' && parts[0] === 'registrations' && parts.length === 2) {
    const user = requireUser(req);
    return send(res, 200, publicRegistration(findOwnRegistration(user, parts[1])));
  }

  // DELETE /registrations/:id (ยกเลิก)
  if (method === 'DELETE' && parts[0] === 'registrations' && parts.length === 2) {
    const user = requireUser(req);
    const registration = findOwnRegistration(user, parts[1]);
    if (registration.status !== 'registered') {
      throw new HttpError(409, 'cannot_cancel', 'ยกเลิกไม่ได้ เพราะเช็กอินไปแล้ว');
    }
    registration.status = 'cancelled';
    persist();
    return send(res, 200, publicRegistration(registration));
  }

  // POST /registrations/:id/check-in
  if (method === 'POST' && parts[0] === 'registrations' && parts[2] === 'check-in' && parts.length === 3) {
    const user = requireUser(req);
    const registration = findOwnRegistration(user, parts[1]);
    const activity = findActivity(registration.activityId);
    const body = await readJson(req);

    if (registration.status !== 'registered') {
      // ส่งซ้ำจากคิวออฟไลน์ → ถือว่าสำเร็จแล้ว
      if (registration.checkIn) return send(res, 200, publicRegistration(registration));
      throw new HttpError(409, 'not_registered', 'การลงทะเบียนนี้ถูกยกเลิกแล้ว');
    }
    const { photoBase64, latitude, longitude, takenAt } = body;
    if (typeof photoBase64 !== 'string' || photoBase64.length < 100) {
      throw new HttpError(400, 'photo_required', 'ต้องมีรูปถ่ายเป็นหลักฐาน');
    }
    const photo = Buffer.from(photoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (photo.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'photo_too_large', 'รูปใหญ่เกิน 3 MB');
    // ตรวจ magic number ของ JPEG ไม่เชื่อแค่สิ่งที่ client บอก
    if (photo[0] !== 0xff || photo[1] !== 0xd8) throw new HttpError(400, 'photo_invalid', 'ไฟล์รูปต้องเป็น JPEG');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new HttpError(400, 'location_required', 'ต้องมีพิกัดตอนเช็กอิน');
    }

    // ตรวจเวลา: ใช้เวลาที่ถ่ายรูป (takenAt) เพราะรูปอาจถูกถ่ายตอนออฟไลน์แล้วส่งทีหลัง
    const taken = new Date(takenAt).getTime();
    const opensAt = new Date(activity.startsAt).getTime() - CHECK_IN_OPENS_BEFORE_MS;
    const endsAt = new Date(activity.endsAt).getTime();
    if (!Number.isFinite(taken) || taken > Date.now() + 2 * 60 * 1000) {
      throw new HttpError(400, 'invalid_time', 'เวลาถ่ายรูปไม่ถูกต้อง');
    }
    if (taken < opensAt) throw new HttpError(409, 'too_early', 'ยังไม่ถึงเวลาเช็กอิน');
    if (taken > endsAt) throw new HttpError(409, 'too_late', 'หมดเวลาเช็กอินแล้ว');

    const distance = distanceMeters({ latitude, longitude }, activity.location);
    if (distance > activity.location.radiusM) {
      throw new HttpError(409, 'too_far', `อยู่นอกพื้นที่จัดงาน (ห่าง ${Math.round(distance)} ม.)`);
    }

    const fileName = `${registration.id}.jpg`;
    writeFileSync(join(UPLOAD_DIR, fileName), photo);
    registration.checkIn = {
      photoUrl: `/uploads/${fileName}`,
      latitude,
      longitude,
      distanceM: Math.round(distance),
      takenAt: new Date(taken).toISOString(),
      submittedAt: new Date().toISOString(),
      verifiedAt: null,
    };

    if (activity.checkInMethod === 'paper') {
      // แอปอ่านลายเซ็นในรูปไม่ได้ ต้องให้ผู้จัดตรวจเทียบกับกระดาษก่อนนับ
      registration.status = 'pending_review';
      if (DEMO_MODE) {
        // จำลองผู้จัดตรวจผ่าน (แอปนี้ไม่มีฝั่งผู้จัด)
        setTimeout(() => {
          if (registration.status === 'pending_review') {
            registration.status = 'checked_in';
            registration.checkIn.verifiedAt = new Date().toISOString();
            persist();
            console.log(`[api] ผู้จัด (จำลอง) ตรวจหลักฐานผ่าน: ${activity.title}`);
          }
        }, PAPER_REVIEW_DELAY_MS);
      }
    } else {
      registration.status = 'checked_in';
      registration.checkIn.verifiedAt = registration.checkIn.submittedAt;
    }
    persist();
    return send(res, 200, publicRegistration(registration));
  }

  // POST /demo/activities/:id/relocate (โหมดสาธิตเท่านั้น)
  if (method === 'POST' && parts[0] === 'demo' && parts[1] === 'activities' && parts[3] === 'relocate') {
    if (!DEMO_MODE) throw new HttpError(404, 'not_found', 'ไม่พบ');
    requireUser(req);
    const activity = findActivity(parts[2]);
    const body = await readJson(req);
    if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      throw new HttpError(400, 'location_required', 'ต้องส่งพิกัด');
    }
    activity.location = { ...activity.location, latitude: body.latitude, longitude: body.longitude };
    return send(res, 200, publicActivity(activity));
  }

  throw new HttpError(404, 'not_found', 'ไม่พบ endpoint นี้');
}

export function startServer(port = PORT) {
  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (error instanceof HttpError) {
        send(res, error.status, { code: error.code, message: error.message });
      } else {
        console.error('[api]', error);
        send(res, 500, { code: 'server_error', message: 'เกิดข้อผิดพลาดที่ server' });
      }
    });
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[api] เช็กอินกิจกรรม API พร้อมที่ http://localhost:${port} (demo mode: ${DEMO_MODE ? 'on' : 'off'})`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
