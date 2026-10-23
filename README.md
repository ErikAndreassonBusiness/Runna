# Stride

Personalised running plans that adapt to you, with structured workouts sent to Garmin watches. Free, iOS + Android (Expo), with a Node API.

> "Stride" is a working name — change it in `apps/mobile/app.json` and the copy in `apps/mobile/src`.

## What it does

- **Onboarding → plan**: goal race (5K / 10K / half / marathon), race date, experience, recent race time, weekly volume and run days produce a week‑by‑week plan with base → build → peak → taper phases, cutback weeks every 4th week, and ≤10% weekly progression.
- **Structured workouts** with pace targets: easy, long (with goal‑pace finishes), tempo / cruise intervals, VO2 intervals, fartlek, marathon‑pace blocks, taper sharpeners, race day.
- **Pace zones** from Jack Daniels' VDOT model; paces progress week by week toward a realistic target.
- **Adaptation**: completed runs are compared against target paces (per lap when the watch recorded laps). Consistently ahead → faster paces; behind → eased paces; many missed runs → lighter next week. Logging a race result recalibrates everything.
- **Garmin**: OAuth 2.0 PKCE connect, push the next 14 days of workouts to the Garmin calendar, import completed runs (pull or webhook), deregistration handling.
- Move / swap sessions, skip, log runs manually, progress charts, account deletion.

## Layout

```
packages/core   Training logic (pure TS, unit-tested): VDOT, plan generator, adaptation
apps/server     Fastify API + SQLite (node:sqlite), auth, Garmin integration
apps/mobile     Expo Router app (SDK 58)
```

## Run it

Requires Node 24+ (uses the built‑in `node:sqlite`).

```bash
npm install
cp apps/server/.env.example apps/server/.env

npm run server    # API on http://localhost:4000 (Garmin in mock mode)
npm run mobile    # Expo dev server — press i / a, or scan the QR code with Expo Go
npm test          # core + server tests
```

The app finds the API on the same machine Metro runs on. To point elsewhere, set `EXPO_PUBLIC_API_URL`.

### Mock Garmin

With `GARMIN_MODE=mock` (default) everything works without Garmin credentials: "Connect Garmin" opens a simulated consent page, pushed workouts are stored in memory, and **Import runs** generates realistic runs (with per‑lap data and some skipped sessions) for past planned workouts, so you can watch the plan adapt.

## Going live with Garmin

1. Apply to the [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/) and request the **Training API** (workouts) and **Activity API** (runs).
2. In the developer portal, set the OAuth redirect URL to `https://<your-server>/garmin/callback`, and the webhook endpoints:
   - Activities / Activity Details → `https://<your-server>/garmin/webhooks/activities?token=<GARMIN_WEBHOOK_SECRET>`
   - Deregistrations → `https://<your-server>/garmin/webhooks/deregistrations?token=<GARMIN_WEBHOOK_SECRET>`
3. Set `GARMIN_MODE=live`, `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `PUBLIC_URL`, `GARMIN_WEBHOOK_SECRET`.
4. **Verify the Training API payload.** The OAuth flow follows Garmin's published PKCE spec, but the Training API spec is only available to approved developers. Check the endpoint URLs in `apps/server/src/garmin/live.ts` and the workout JSON in `apps/server/src/garmin/format.ts` (both marked `VERIFY`) against it, and test with Garmin's evaluation environment before launch.

## Before shipping to the stores

- Replace the placeholder icon and splash assets in `apps/mobile/assets`.
- Host the API with HTTPS and a persistent volume for the SQLite file (or move to Postgres).
- Add rate limiting on `/auth/*` and a password‑reset flow.
- Build with EAS: `npx eas-cli@latest build`.
