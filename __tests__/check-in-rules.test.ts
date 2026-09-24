import { canCheckIn, checkInOpensAt, photoTimeProblem } from '@/lib/check-in-rules';
import { distanceMeters } from '@/lib/geo';
import { parseExifTakenAt } from '@/lib/photo-time';

import { makeActivity, makeRegistration, NOW } from '../test-utils/fixtures';

describe('distanceMeters', () => {
  it('returns 0 for the same point', () => {
    const p = { latitude: 16.4745, longitude: 102.8232 };
    expect(distanceMeters(p, p)).toBe(0);
  });

  it('measures ~111 m for 0.001° of latitude', () => {
    const d = distanceMeters({ latitude: 16.4745, longitude: 102.8232 }, { latitude: 16.4755, longitude: 102.8232 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });
});

describe('canCheckIn', () => {
  const activity = makeActivity();

  it('opens 30 minutes before the start time', () => {
    expect(checkInOpensAt(activity).toISOString()).toBe(new Date('2026-10-01T09:45:00+07:00').toISOString());
  });

  it('allows check-in inside the time window and radius', () => {
    expect(canCheckIn({ activity, registration: makeRegistration(), distanceM: 40, now: NOW })).toEqual({ ok: true });
  });

  it('rejects when outside the venue radius', () => {
    const result = canCheckIn({ activity, registration: makeRegistration(), distanceM: 2300, now: NOW });
    expect(result).toMatchObject({ ok: false, reason: 'too_far' });
  });

  it('rejects before check-in opens', () => {
    const early = new Date('2026-10-01T09:00:00+07:00').getTime();
    expect(canCheckIn({ activity, registration: makeRegistration(), distanceM: 10, now: early })).toMatchObject({
      ok: false,
      reason: 'too_early',
    });
  });

  it('rejects after the activity ends', () => {
    const late = new Date('2026-10-01T12:30:00+07:00').getTime();
    expect(canCheckIn({ activity, registration: makeRegistration(), distanceM: 10, now: late })).toMatchObject({
      ok: false,
      reason: 'too_late',
    });
  });

  it('requires a known location', () => {
    expect(canCheckIn({ activity, registration: makeRegistration(), distanceM: null, now: NOW })).toMatchObject({
      ok: false,
      reason: 'location_unknown',
    });
  });

  it('does not allow a second submission (paper evidence waiting for review)', () => {
    const registration = makeRegistration({ status: 'pending_review' });
    expect(canCheckIn({ activity, registration, distanceM: 10, now: NOW })).toMatchObject({ ok: false, reason: 'already_submitted' });
  });

  it('does not allow cancelled registrations', () => {
    const registration = makeRegistration({ status: 'cancelled' });
    expect(canCheckIn({ activity, registration, distanceM: 10, now: NOW })).toMatchObject({ ok: false, reason: 'not_registered' });
  });
});

describe('photoTimeProblem (รูปจากคลัง)', () => {
  const activity = makeActivity();

  it('accepts a photo taken during the check-in window', () => {
    expect(photoTimeProblem(activity, new Date(NOW).toISOString())).toBeNull();
  });

  it('rejects a photo with no EXIF time', () => {
    expect(photoTimeProblem(activity, null)).toMatch('ไม่มีข้อมูลเวลาถ่าย');
  });

  it('rejects an old photo taken before check-in opens', () => {
    expect(photoTimeProblem(activity, '2026-09-01T10:00:00+07:00')).toMatch('ถ่ายก่อนเริ่มงาน');
  });

  it('rejects a photo taken after the activity ended', () => {
    expect(photoTimeProblem(activity, '2026-10-30T10:00:00+07:00')).toMatch('หลังงานจบ');
  });
});

describe('parseExifTakenAt', () => {
  it('uses OffsetTimeOriginal when present', () => {
    expect(parseExifTakenAt({ DateTimeOriginal: '2026:10:01 10:15:30', OffsetTimeOriginal: '+07:00' })).toBe(
      '2026-10-01T03:15:30.000Z',
    );
  });

  it('falls back to device local time without an offset', () => {
    expect(parseExifTakenAt({ DateTimeOriginal: '2026:10:01 10:15:30' })).toBe(
      new Date(2026, 9, 1, 10, 15, 30).toISOString(),
    );
  });

  it('returns null when there is no capture time', () => {
    expect(parseExifTakenAt({})).toBeNull();
    expect(parseExifTakenAt(undefined)).toBeNull();
    expect(parseExifTakenAt({ DateTimeOriginal: 'not a date' })).toBeNull();
  });
});
