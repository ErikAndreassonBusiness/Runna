import { createHash, randomBytes } from 'node:crypto';
import { addDays } from '@stride/core';
import { nowIso, type Db } from '../db';
import { toGarminWorkout } from '../garmin/format';
import type { GarminProvider, NormalizedActivity } from '../garmin/provider';
import { ingestActivity } from './activities';
import { getActivePlan, getPlanWorkouts, runAdaptation, type WorkoutRow } from './plans';

const STATE_TTL_MS = 15 * 60_000;

interface ConnectionRow {
  user_id: string;
  garmin_user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
}

export class GarminNotConnectedError extends Error {
  constructor() {
    super('Garmin is not connected');
  }
}

export class GarminService {
  constructor(
    private readonly db: Db,
    private readonly provider: GarminProvider,
  ) {}

  get mode() {
    return this.provider.mode;
  }

  status(userId: string) {
    const conn = this.connection(userId);
    return { connected: Boolean(conn), mode: this.provider.mode, connectedAt: conn?.connected_at ?? null };
  }

  /**
   * Start OAuth 2.0 PKCE: remember the verifier against a random state.
   * `callbackUrl` is where Garmin sends the browser back to (this server);
   * `returnUrl` is the app deep link we finally redirect to.
   */
  beginConnect(userId: string, callbackUrl: string, returnUrl: string): string {
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    this.db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(new Date(Date.now() - STATE_TTL_MS).toISOString());
    this.db
      .prepare(
        'INSERT INTO oauth_states (state, user_id, code_verifier, redirect_uri, return_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(state, userId, verifier, callbackUrl, returnUrl, nowIso());
    return this.provider.authorizeUrl({ state, codeChallenge: challenge, redirectUri: callbackUrl });
  }

  /** The app link to return to for a pending connection, if the state is known. */
  returnUrlFor(state: string): string | undefined {
    const row = this.db.prepare('SELECT return_url FROM oauth_states WHERE state = ?').get(state) as
      | { return_url: string }
      | undefined;
    return row?.return_url;
  }

  async completeConnect(state: string, code: string): Promise<string> {
    const row = this.db
      .prepare('SELECT user_id, code_verifier, redirect_uri, created_at FROM oauth_states WHERE state = ?')
      .get(state) as { user_id: string; code_verifier: string; redirect_uri: string; created_at: string } | undefined;
    this.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    if (!row || Date.parse(row.created_at) < Date.now() - STATE_TTL_MS) {
      throw new Error('This Garmin link has expired — please try connecting again.');
    }

    const tokens = await this.provider.exchangeCode({
      code,
      codeVerifier: row.code_verifier,
      redirectUri: row.redirect_uri,
    });
    const garminUserId = await this.provider.getUserId(tokens.accessToken);
    // A Garmin account can only be linked to one user.
    this.db.prepare('DELETE FROM garmin_connections WHERE garmin_user_id = ? AND user_id != ?').run(garminUserId, row.user_id);
    this.db
      .prepare(
        `INSERT INTO garmin_connections (user_id, garmin_user_id, access_token, refresh_token, expires_at, connected_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET garmin_user_id = excluded.garmin_user_id, access_token = excluded.access_token,
           refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, connected_at = excluded.connected_at`,
      )
      .run(row.user_id, garminUserId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt.toISOString(), nowIso());
    return row.user_id;
  }

  async disconnect(userId: string): Promise<void> {
    const conn = this.connection(userId);
    if (!conn) return;
    try {
      await this.provider.deregister(await this.accessToken(userId));
    } catch {
      // Remove locally even if Garmin is unreachable.
    }
    this.db.prepare('DELETE FROM garmin_connections WHERE user_id = ?').run(userId);
    this.db
      .prepare('UPDATE workouts SET garmin_workout_id = NULL, garmin_scheduled_date = NULL, garmin_synced_at = NULL WHERE user_id = ?')
      .run(userId);
  }

  /** Called when Garmin tells us the user revoked access from their side. */
  removeByGarminUser(garminUserId: string): void {
    const conn = this.db
      .prepare('SELECT user_id FROM garmin_connections WHERE garmin_user_id = ?')
      .get(garminUserId) as { user_id: string } | undefined;
    if (conn) this.db.prepare('DELETE FROM garmin_connections WHERE user_id = ?').run(conn.user_id);
  }

  userForGarminId(garminUserId: string): string | undefined {
    const row = this.db
      .prepare('SELECT user_id FROM garmin_connections WHERE garmin_user_id = ?')
      .get(garminUserId) as { user_id: string } | undefined;
    return row?.user_id;
  }

  /** Push planned workouts in the next `days` days to the Garmin calendar. */
  async syncUpcoming(userId: string, today: string, days = 14): Promise<{ synced: number; total: number }> {
    const token = await this.accessToken(userId);
    const plan = getActivePlan(this.db, userId);
    if (!plan) return { synced: 0, total: 0 };

    const end = addDays(today, days);
    const upcoming = getPlanWorkouts(this.db, plan.id).filter(
      (w) => w.date >= today && w.date <= end && w.status === 'planned',
    );
    const stale = upcoming.filter((w) => !w.garmin_synced_at || w.garmin_scheduled_date !== w.date);

    for (const w of stale) await this.pushWorkout(token, w);
    return { synced: stale.length, total: upcoming.length };
  }

  async syncWorkout(userId: string, workout: WorkoutRow): Promise<void> {
    await this.pushWorkout(await this.accessToken(userId), workout);
  }

  /** Pull recent runs from Garmin, match them to the plan, then adapt. */
  async importRecent(userId: string, today: string, days = 7) {
    const token = await this.accessToken(userId);
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const activities = await this.provider.fetchActivities(token, from, to);
    return this.ingest(userId, activities, today);
  }

  /** Handle a Garmin push/ping notification for one user. */
  async ingestNotification(
    userId: string,
    payload: { activities?: NormalizedActivity[]; callbackUrl?: string },
    today: string,
  ) {
    let activities = payload.activities ?? [];
    if (payload.callbackUrl) {
      activities = await this.provider.fetchCallback(await this.accessToken(userId), payload.callbackUrl);
    }
    return this.ingest(userId, activities, today);
  }

  private ingest(userId: string, activities: NormalizedActivity[], today: string) {
    const results = activities.map((a) => ingestActivity(this.db, userId, a));
    const messages = runAdaptation(this.db, userId, today);
    return {
      imported: results.filter((r) => r.isNew).length,
      matched: results.filter((r) => r.isNew && r.workoutId).length,
      messages,
    };
  }

  private async pushWorkout(token: string, w: WorkoutRow): Promise<void> {
    if (w.garmin_workout_id) {
      try {
        await this.provider.deleteWorkout(token, w.garmin_workout_id);
      } catch {
        // Already gone on Garmin's side — fine.
      }
    }
    const garminId = await this.provider.createWorkout(
      token,
      toGarminWorkout({
        title: w.title,
        description: w.description,
        steps: JSON.parse(w.steps_json),
        distanceMeters: w.distance_m,
        estDurationSeconds: w.est_duration_s,
      }),
    );
    await this.provider.scheduleWorkout(token, garminId, w.date);
    this.db
      .prepare('UPDATE workouts SET garmin_workout_id = ?, garmin_scheduled_date = ?, garmin_synced_at = ? WHERE id = ?')
      .run(garminId, w.date, nowIso(), w.id);
  }

  private connection(userId: string): ConnectionRow | undefined {
    return this.db.prepare('SELECT * FROM garmin_connections WHERE user_id = ?').get(userId) as ConnectionRow | undefined;
  }

  /** A valid access token, refreshed when it is about to expire. */
  private async accessToken(userId: string): Promise<string> {
    const conn = this.connection(userId);
    if (!conn) throw new GarminNotConnectedError();
    if (Date.parse(conn.expires_at) > Date.now() + 5 * 60_000) return conn.access_token;

    const tokens = await this.provider.refresh(conn.refresh_token);
    this.db
      .prepare('UPDATE garmin_connections SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?')
      .run(tokens.accessToken, tokens.refreshToken, tokens.expiresAt.toISOString(), userId);
    return tokens.accessToken;
  }
}
