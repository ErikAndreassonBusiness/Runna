import type { Lap } from '@stride/core';
import type { GarminWorkout } from './format';

export interface GarminTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/** An activity in our own shape, independent of where it came from. */
export interface NormalizedActivity {
  source: 'garmin' | 'manual';
  externalId: string;
  name: string;
  startTime: string;
  localDate: string;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  laps?: Lap[];
}

/**
 * Everything the app needs from Garmin. `LiveGarminProvider` talks to the real
 * Garmin Connect Developer Program APIs; `MockGarminProvider` simulates them so
 * the full flow works before Garmin approves the app.
 */
export interface GarminProvider {
  readonly mode: 'mock' | 'live';
  authorizeUrl(params: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(params: { code: string; codeVerifier: string; redirectUri: string }): Promise<GarminTokens>;
  refresh(refreshToken: string): Promise<GarminTokens>;
  getUserId(accessToken: string): Promise<string>;
  deregister(accessToken: string): Promise<void>;
  createWorkout(accessToken: string, workout: GarminWorkout): Promise<string>;
  scheduleWorkout(accessToken: string, workoutId: string, date: string): Promise<void>;
  deleteWorkout(accessToken: string, workoutId: string): Promise<void>;
  /** Pull running activities uploaded in [from, to). */
  fetchActivities(accessToken: string, from: Date, to: Date): Promise<NormalizedActivity[]>;
  /** Resolve a ping notification's callback URL into activities. */
  fetchCallback(accessToken: string, callbackUrl: string): Promise<NormalizedActivity[]>;
}
