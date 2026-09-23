import { canCheckIn, checkInOpensAt } from '@/lib/check-in-rules';
import { distanceMeters } from '@/lib/geo';

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
