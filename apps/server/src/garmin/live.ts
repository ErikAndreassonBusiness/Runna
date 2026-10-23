import {
  normalizeBatch,
  type GarminActivityDetails,
  type GarminActivitySummary,
  type GarminWorkout,
} from './format';
import type { GarminProvider, GarminTokens, NormalizedActivity } from './provider';

// OAuth 2.0 PKCE — from Garmin's "OAuth2.0 PKCE" specification.
const AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
const TOKEN_URL = 'https://connectapi.garmin.com/di-oauth2-service/oauth/token';
const API = 'https://apis.garmin.com';

// VERIFY: Training API paths, from the Training API V2 spec (developer portal only).
const WORKOUT_URL = `${API}/workoutportal/workout/v2`;
const SCHEDULE_URL = `${API}/training-api/schedule/`;

/** Garmin's pull endpoints accept at most 24h upload windows. */
const MAX_WINDOW_SECONDS = 86_400;

export class GarminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class LiveGarminProvider implements GarminProvider {
  readonly mode = 'live' as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    if (!clientId || !clientSecret) {
      throw new Error('GARMIN_CLIENT_ID and GARMIN_CLIENT_SECRET are required when GARMIN_MODE=live');
    }
  }

  authorizeUrl({ state, codeChallenge, redirectUri }: { state: string; codeChallenge: string; redirectUri: string }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  exchangeCode({ code, codeVerifier, redirectUri }: { code: string; codeVerifier: string; redirectUri: string }) {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });
  }

  refresh(refreshToken: string) {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async getUserId(accessToken: string) {
    const body = await this.request<{ userId: string }>(accessToken, 'GET', `${API}/wellness-api/rest/user/id`);
    return body.userId;
  }

  async deregister(accessToken: string) {
    await this.request(accessToken, 'DELETE', `${API}/wellness-api/rest/user/registration`);
  }

  async createWorkout(accessToken: string, workout: GarminWorkout) {
    const body = await this.request<{ workoutId: number | string }>(accessToken, 'POST', WORKOUT_URL, workout);
    return String(body.workoutId);
  }

  async scheduleWorkout(accessToken: string, workoutId: string, date: string) {
    await this.request(accessToken, 'POST', SCHEDULE_URL, { workoutId: Number(workoutId), date });
  }

  async deleteWorkout(accessToken: string, workoutId: string) {
    await this.request(accessToken, 'DELETE', `${WORKOUT_URL}/${workoutId}`);
  }

  async fetchActivities(accessToken: string, from: Date, to: Date): Promise<NormalizedActivity[]> {
    const results: NormalizedActivity[] = [];
    let start = Math.floor(from.getTime() / 1000);
    const end = Math.floor(to.getTime() / 1000);
    while (start < end) {
      const windowEnd = Math.min(start + MAX_WINDOW_SECONDS, end);
      const query = `uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${windowEnd}`;
      const [summaries, details] = await Promise.all([
        this.request<GarminActivitySummary[]>(accessToken, 'GET', `${API}/wellness-api/rest/activities?${query}`),
        this.request<GarminActivityDetails[]>(accessToken, 'GET', `${API}/wellness-api/rest/activityDetails?${query}`),
      ]);
      results.push(...normalizeBatch(summaries ?? [], details ?? []));
      start = windowEnd;
    }
    return results;
  }

  async fetchCallback(accessToken: string, callbackUrl: string) {
    if (!callbackUrl.startsWith(`${API}/`)) throw new Error('Unexpected Garmin callback host');
    const body = await this.request<GarminActivitySummary[] | GarminActivityDetails[]>(accessToken, 'GET', callbackUrl);
    const items = body ?? [];
    const isDetails = (x: unknown): x is GarminActivityDetails => typeof x === 'object' && x !== null && 'summary' in x;
    return items.every(isDetails)
      ? normalizeBatch([], items as GarminActivityDetails[])
      : normalizeBatch(items as GarminActivitySummary[]);
  }

  private async tokenRequest(params: Record<string, string>): Promise<GarminTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: this.clientId, client_secret: this.clientSecret }),
    });
    if (!res.ok) throw new GarminApiError(`Garmin token request failed: ${await res.text()}`, res.status);
    const body = (await res.json()) as TokenResponse;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(Date.now() + body.expires_in * 1000),
    };
  }

  private async request<T = unknown>(accessToken: string, method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new GarminApiError(`Garmin ${method} ${url} failed: ${await res.text()}`, res.status);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
