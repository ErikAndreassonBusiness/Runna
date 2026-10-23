import { createHash, randomUUID } from 'node:crypto';
import { expandSteps, today, type Lap, type WorkoutItem } from '@stride/core';
import type { Db } from '../db';
import type { GarminWorkout } from './format';
import type { GarminProvider, GarminTokens, NormalizedActivity } from './provider';

/** Deterministic 0–1 random numbers seeded by a string, so re-imports are stable. */
function seeded(seed: string) {
  let counter = 0;
  return () => {
    const hash = createHash('sha256').update(`${seed}:${counter++}`).digest();
    return hash.readUInt32BE(0) / 0xffffffff;
  };
}

/**
 * Simulates Garmin Connect. Authorisation goes through a local consent page,
 * pushed workouts are kept in memory, and "importing" generates realistic runs
 * for past planned workouts (most completed, some skipped, paces with noise).
 */
export class MockGarminProvider implements GarminProvider {
  readonly mode = 'mock' as const;
  readonly workouts = new Map<string, { workout: GarminWorkout; date?: string }>();

  constructor(
    private readonly db: Db,
    private readonly publicUrl: string,
  ) {}

  authorizeUrl({ state, codeChallenge, redirectUri }: { state: string; codeChallenge: string; redirectUri: string }) {
    const params = new URLSearchParams({ state, code_challenge: codeChallenge, redirect_uri: redirectUri });
    return `${this.publicUrl}/garmin/mock/authorize?${params}`;
  }

  async exchangeCode(): Promise<GarminTokens> {
    return this.issueTokens();
  }

  async refresh(): Promise<GarminTokens> {
    return this.issueTokens();
  }

  async getUserId(accessToken: string) {
    return `mock-${createHash('sha256').update(accessToken).digest('hex').slice(0, 12)}`;
  }

  async deregister() {}

  async createWorkout(_accessToken: string, workout: GarminWorkout) {
    const id = String(this.workouts.size + 1000);
    this.workouts.set(id, { workout });
    return id;
  }

  async scheduleWorkout(_accessToken: string, workoutId: string, date: string) {
    const entry = this.workouts.get(workoutId);
    if (!entry) throw new Error(`Unknown mock workout ${workoutId}`);
    entry.date = date;
  }

  async deleteWorkout(_accessToken: string, workoutId: string) {
    this.workouts.delete(workoutId);
  }

  async fetchActivities(accessToken: string, from: Date, to: Date): Promise<NormalizedActivity[]> {
    const conn = this.db
      .prepare('SELECT user_id FROM garmin_connections WHERE access_token = ?')
      .get(accessToken) as { user_id: string } | undefined;
    if (!conn) throw new Error('Invalid mock access token');

    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);
    const rows = this.db
      .prepare(
        `SELECT w.id, w.date, w.title, w.steps_json FROM workouts w
         JOIN plans p ON p.id = w.plan_id AND p.status = 'active'
         WHERE w.user_id = ? AND w.date >= ? AND w.date <= ? AND w.date < ? AND w.status = 'planned'`,
      )
      .all(conn.user_id, fromDate, toDate, today()) as { id: string; date: string; title: string; steps_json: string }[];

    return rows.flatMap((row) => {
      const random = seeded(row.id);
      if (random() < 0.15) return []; // skipped this one
      const speed = 0.96 + random() * 0.1; // 0.96–1.06 × target pace
      const laps = simulateLaps(JSON.parse(row.steps_json), speed, random);
      const distance = laps.reduce((s, l) => s + l.distanceMeters, 0);
      const duration = laps.reduce((s, l) => s + l.durationSeconds, 0);
      return [
        {
          source: 'garmin' as const,
          externalId: `mock-${row.id}`,
          name: row.title,
          startTime: new Date(`${row.date}T07:00:00`).toISOString(),
          localDate: row.date,
          distanceMeters: Math.round(distance),
          durationSeconds: Math.round(duration),
          avgHeartRate: Math.round(135 + random() * 30),
          laps,
        },
      ];
    });
  }

  async fetchCallback(): Promise<NormalizedActivity[]> {
    return [];
  }

  private issueTokens(): GarminTokens {
    return {
      accessToken: `mock-access-${randomUUID()}`,
      refreshToken: `mock-refresh-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    };
  }
}

function simulateLaps(steps: WorkoutItem[], speed: number, random: () => number): Lap[] {
  return expandSteps(steps).map((s) => {
    const pace = s.pace ? (s.pace.fast + s.pace.slow) / 2 : 360;
    const actualPace = (pace / speed) * (0.98 + random() * 0.04);
    if (s.duration.type === 'time') {
      return { durationSeconds: s.duration.seconds, distanceMeters: Math.round((s.duration.seconds / actualPace) * 1000) };
    }
    const meters = s.duration.type === 'distance' ? s.duration.meters : 1000;
    return { distanceMeters: meters, durationSeconds: Math.round((meters / 1000) * actualPace) };
  });
}
