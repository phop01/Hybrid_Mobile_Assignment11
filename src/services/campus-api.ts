// API ทั้งหมดของ เช็กอินกิจกรรม (ตรงกับ server/index.mjs)

import type { Activity, Registration, RegistrationForm, User } from '@/types/models';

import { apiRequest } from './api-client';
import { isActivity, isRegistration, isUser, parseList, parseOne } from './validators';

export async function getActivities(signal?: AbortSignal): Promise<Activity[]> {
  return parseList(await apiRequest('/activities', { signal }), isActivity, 'กิจกรรม');
}

export async function getActivity(id: string, signal?: AbortSignal): Promise<Activity> {
  return parseOne(await apiRequest(`/activities/${encodeURIComponent(id)}`, { signal }), isActivity, 'กิจกรรม');
}

export async function login(studentId: string, password: string) {
  const payload = (await apiRequest('/auth/login', { method: 'POST', body: { studentId, password } })) as {
    token?: unknown;
    expiresAt?: unknown;
    user?: unknown;
  };
  if (typeof payload?.token !== 'string' || !isUser(payload.user)) {
    throw new Error('รูปแบบข้อมูลเข้าสู่ระบบไม่ถูกต้อง');
  }
  return { token: payload.token, user: payload.user };
}

export async function logout(token: string): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST', token });
}

export async function getMe(token: string): Promise<User> {
  return parseOne(await apiRequest('/me', { token }), isUser, 'ผู้ใช้');
}

export async function registerForActivity(
  token: string,
  activityId: string,
  form: RegistrationForm,
  idempotencyKey: string,
): Promise<Registration> {
  const payload = await apiRequest(`/activities/${encodeURIComponent(activityId)}/registrations`, {
    method: 'POST',
    token,
    body: form,
    idempotencyKey,
  });
  return parseOne(payload, isRegistration, 'การลงทะเบียน');
}

export async function getMyRegistrations(token: string, signal?: AbortSignal): Promise<Registration[]> {
  return parseList(await apiRequest('/registrations', { token, signal }), isRegistration, 'การลงทะเบียน');
}

export async function cancelRegistration(token: string, id: string): Promise<Registration> {
  const payload = await apiRequest(`/registrations/${encodeURIComponent(id)}`, { method: 'DELETE', token });
  return parseOne(payload, isRegistration, 'การลงทะเบียน');
}

export type CheckInPayload = {
  photoBase64: string;
  latitude: number;
  longitude: number;
  takenAt: string;
};

export async function submitCheckIn(token: string, registrationId: string, body: CheckInPayload): Promise<Registration> {
  const payload = await apiRequest(`/registrations/${encodeURIComponent(registrationId)}/check-in`, {
    method: 'POST',
    token,
    body,
  });
  return parseOne(payload, isRegistration, 'การเช็กอิน');
}

/** โหมดสาธิต: ย้ายสถานที่จัดงานมาที่ตำแหน่งปัจจุบัน (server เปิดให้ใช้เฉพาะ demo mode) */
export async function relocateActivityForDemo(
  token: string,
  activityId: string,
  coords: { latitude: number; longitude: number },
): Promise<Activity> {
  const payload = await apiRequest(`/demo/activities/${encodeURIComponent(activityId)}/relocate`, {
    method: 'POST',
    token,
    body: coords,
  });
  return parseOne(payload, isActivity, 'กิจกรรม');
}
