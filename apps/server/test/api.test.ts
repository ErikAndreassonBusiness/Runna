import { addDays, expandSteps, today } from '@stride/core';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { openDb, type Db } from '../src/db';
import { lapsFromDetails, toGarminWorkout } from '../src/garmin/format';
import { MockGarminProvider } from '../src/garmin/mock';

const config: Config = {
  port: 0,
  publicUrl: 'http://localhost:4000',
  dbPath: ':memory:',
  appRedirectUrl: 'stride://garmin',
  garmin: { mode: 'mock', clientId: '', clientSecret: '', webhookSecret: 'hook-secret' },
};

let app: FastifyInstance;
let db: Db;
let mock: MockGarminProvider;
let token: string;

const call = async (method: string, url: string, payload?: unknown) => {
  const res = await app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${token}` } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined, headers: res.headers };
};

const planInput = {
  goal: '10k',
  raceDate: addDays(today(), 70),
  experience: 'intermediate',
  recentRace: { distanceMeters: 5000, timeSeconds: 23 * 60 },
  weeklyKm: 25,
  runDays: [0, 1, 2, 3, 4, 5, 6].slice(0, 4),
  longRunDay: 3,
};

/** Pretend the plan started three weeks ago so there is history to import. */
function shiftPlanIntoPast(days: number) {
  db.prepare('UPDATE workouts SET date = date(date, ?)').run(`-${days} days`);
}

async function connectGarmin() {
  const { body } = await call('POST', '/garmin/connect', { returnUrl: 'exp://192.168.1.2:8081/--/garmin' });
  const authorize = new URL(body.url);
  expect(authorize.pathname).toBe('/garmin/mock/authorize');
  const page = await app.inject({ method: 'GET', url: authorize.pathname + authorize.search });
  expect(page.body).toContain('Mock Garmin Connect');
  const state = authorize.searchParams.get('state')!;
  const callback = await app.inject({ method: 'GET', url: `/garmin/callback?code=mock-code&state=${state}` });
  expect(callback.headers.location).toBe('exp://192.168.1.2:8081/--/garmin?status=connected');
}

beforeEach(async () => {
  db = openDb(':memory:');
  mock = new MockGarminProvider(db, config.publicUrl);
  app = await buildApp(config, db, mock);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'Runner@Example.com', name: 'Runner', password: 'correct horse' },
  });
  token = res.json().token;
});

describe('auth', () => {
  it('registers, logs in and rejects bad credentials', async () => {
    const me = await call('GET', '/me');
    expect(me.body.user.email).toBe('runner@example.com');
    expect(me.body.garmin).toMatchObject({ connected: false, mode: 'mock' });

    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'runner@example.com', password: 'correct horse' } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'runner@example.com', password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    const anon = await app.inject({ method: 'GET', url: '/me' });
    expect(anon.statusCode).toBe(401);
  });
});

describe('plans', () => {
  it('creates a plan and validates input', async () => {
    const created = await call('POST', '/plans', planInput);
    expect(created.status).toBe(201);
    expect(created.body.plan.goal).toBe('10k');
    expect(created.body.workouts.at(-1).type).toBe('race');
    expect(created.body.plan.paces.threshold.fast).toBeGreaterThan(0);

    const invalid = await call('POST', '/plans', { ...planInput, longRunDay: 6 });
    expect(invalid.status).toBe(400);
  });

  it('moves workouts by swapping days and blocks moving race day', async () => {
    const { body } = await call('POST', '/plans', planInput);
    const future = body.workouts.filter((w: { date: string }) => w.date > today());
    const [a, b] = future;
    const moved = await call('POST', `/workouts/${a.id}/move`, { date: b.date });
    expect(moved.body.workout.date).toBe(b.date);
    expect((await call('GET', `/workouts/${b.id}`)).body.date).toBe(a.date);

    const race = body.workouts.at(-1);
    expect((await call('POST', `/workouts/${race.id}/move`, { date: a.date })).status).toBe(400);
  });

  it('logs, skips and resets workouts', async () => {
    const { body } = await call('POST', '/plans', planInput);
    const w = body.workouts[0];
    const done = await call('POST', `/workouts/${w.id}/complete`, { distanceMeters: 5000, durationSeconds: 1500 });
    expect(done.body.workout.status).toBe('completed');
    expect(done.body.workout.activity.distanceMeters).toBe(5000);
    const reset = await call('POST', `/workouts/${w.id}/reset`);
    expect(reset.body.workout.status).toBe('planned');
    expect((await call('POST', `/workouts/${w.id}/skip`)).body.workout.status).toBe('skipped');
  });

  it('recalculates paces from a new race result', async () => {
    const { body } = await call('POST', '/plans', planInput);
    const before = body.plan.paces.threshold.fast;
    const res = await call('POST', '/plans/active/race-result', { distanceMeters: 5000, timeSeconds: 21 * 60 });
    expect(res.body.plan.paces.threshold.fast).toBeLessThan(before);
    expect(res.body.events[0].message).toMatch(/race result/);
  });
});

describe('garmin (mock)', () => {
  it('connects, pushes upcoming workouts and re-pushes after changes', async () => {
    await call('POST', '/plans', planInput);
    expect((await call('POST', '/garmin/sync')).status).toBe(409);

    await connectGarmin();
    expect((await call('GET', '/garmin/status')).body.connected).toBe(true);

    const sync = await call('POST', '/garmin/sync', { days: 14 });
    expect(sync.body.synced).toBeGreaterThan(0);
    expect(mock.workouts.size).toBe(sync.body.synced);
    const scheduled = [...mock.workouts.values()].map((w) => w.date);
    expect(scheduled.every(Boolean)).toBe(true);

    // Nothing changed → nothing to push.
    expect((await call('POST', '/garmin/sync', { days: 14 })).body.synced).toBe(0);

    const plan = (await call('GET', '/plans/active')).body;
    expect(plan.workouts.find((w: { date: string }) => w.date >= today()).garminSynced).toBe(true);
  });

  it('imports runs, matches them to the plan and adapts', async () => {
    await call('POST', '/plans', planInput);
    shiftPlanIntoPast(21);
    await connectGarmin();

    const result = await call('POST', '/garmin/import', { days: 30 });
    expect(result.status).toBe(200);
    expect(result.body.imported).toBeGreaterThan(3);
    expect(result.body.matched).toBe(result.body.imported);

    const plan = (await call('GET', '/plans/active')).body;
    const completed = plan.workouts.filter((w: { status: string }) => w.status === 'completed');
    expect(completed.length).toBe(result.body.imported);
    expect(completed[0].activity.laps.length).toBe(expandSteps(completed[0].steps).length);

    // Importing again is idempotent.
    expect((await call('POST', '/garmin/import', { days: 30 })).body.imported).toBe(0);
  });

  it('accepts push notifications for connected users only', async () => {
    await call('POST', '/plans', planInput);
    await connectGarmin();
    const garminUserId = (db.prepare('SELECT garmin_user_id FROM garmin_connections').get() as { garmin_user_id: string }).garmin_user_id;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      activities: [
        { userId: garminUserId, summaryId: 's1', activityId: 42, activityType: 'RUNNING', startTimeInSeconds: now - 3600, startTimeOffsetInSeconds: 0, durationInSeconds: 1800, distanceInMeters: 6000 },
        { userId: garminUserId, summaryId: 's2', activityId: 43, activityType: 'CYCLING', startTimeInSeconds: now, durationInSeconds: 1800, distanceInMeters: 15000 },
        { userId: 'someone-else', summaryId: 's3', activityId: 44, activityType: 'RUNNING', startTimeInSeconds: now, durationInSeconds: 1800, distanceInMeters: 5000 },
      ],
    };
    const unauthorised = await app.inject({ method: 'POST', url: '/garmin/webhooks/activities', payload });
    expect(unauthorised.statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/garmin/webhooks/activities?token=hook-secret', payload });
    expect(res.statusCode).toBe(200);
    const rows = db.prepare('SELECT external_id FROM activities').all() as { external_id: string }[];
    expect(rows.map((r) => r.external_id)).toEqual(['42']);
  });

  it('disconnects on deregistration', async () => {
    await connectGarmin();
    const { garmin_user_id } = db.prepare('SELECT garmin_user_id FROM garmin_connections').get() as { garmin_user_id: string };
    await app.inject({
      method: 'POST',
      url: '/garmin/webhooks/deregistrations?token=hook-secret',
      payload: { deregistrations: [{ userId: garmin_user_id }] },
    });
    expect((await call('GET', '/garmin/status')).body.connected).toBe(false);
  });

  it('only returns to allowed app links', async () => {
    expect((await call('POST', '/garmin/connect', { returnUrl: 'https://evil.example/steal' })).status).toBe(400);
  });

  it('rejects reused or unknown OAuth state', async () => {
    const res = await app.inject({ method: 'GET', url: '/garmin/callback?code=x&state=bogus' });
    expect(res.headers.location).toMatch(/status=error/);
  });
});

describe('garmin format', () => {
  it('converts workouts with nested repeats and pace targets in m/s', () => {
    const g = toGarminWorkout({
      title: 'Intervals: 5 × 1km',
      description: 'desc',
      distanceMeters: 9000,
      estDurationSeconds: 2700,
      steps: [
        { kind: 'step', intensity: 'warmup', duration: { type: 'distance', meters: 2000 }, pace: { fast: 300, slow: 330 } },
        {
          kind: 'repeat',
          times: 5,
          steps: [
            { kind: 'step', intensity: 'active', duration: { type: 'distance', meters: 1000 }, pace: { fast: 240, slow: 250 } },
            { kind: 'step', intensity: 'recovery', duration: { type: 'time', seconds: 90 } },
          ],
        },
      ],
    });
    const [warmup, repeat] = g.segments[0].steps as Record<string, any>[];
    expect(warmup).toMatchObject({ stepOrder: 1, intensity: 'WARMUP', durationType: 'DISTANCE', durationValue: 2000, targetType: 'PACE' });
    expect(warmup.targetValueLow).toBeCloseTo(1000 / 330, 3);
    expect(warmup.targetValueHigh).toBeCloseTo(1000 / 300, 3);
    expect(repeat).toMatchObject({ type: 'WorkoutRepeatStep', stepOrder: 2, repeatValue: 5 });
    expect(repeat.steps.map((s: any) => s.stepOrder)).toEqual([3, 4]);
    expect(repeat.steps[0].intensity).toBe('INTERVAL');
    expect(repeat.steps[1]).toMatchObject({ durationType: 'TIME', durationValue: 90, targetType: 'OPEN' });
  });

  it('derives lap distances from samples', () => {
    const laps = lapsFromDetails({
      summaryId: 'x',
      summary: { summaryId: 'x', activityType: 'RUNNING', startTimeInSeconds: 0, durationInSeconds: 600 },
      laps: [{ startTimeInSeconds: 0 }, { startTimeInSeconds: 300 }],
      samples: [0, 100, 200, 300, 400, 500, 600].map((t) => ({ startTimeInSeconds: t, totalDistanceInMeters: t * 3 })),
    });
    expect(laps).toEqual([
      { distanceMeters: 900, durationSeconds: 300 },
      { distanceMeters: 900, durationSeconds: 300 },
    ]);
  });
});
