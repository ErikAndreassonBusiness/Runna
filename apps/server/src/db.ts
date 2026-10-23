import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  input_json TEXT NOT NULL,
  weeks_json TEXT NOT NULL,
  start_vdot REAL NOT NULL,
  target_vdot REAL NOT NULL,
  vdot_adjustment REAL NOT NULL DEFAULT 0,
  predicted_race_seconds INTEGER NOT NULL,
  adapted_through TEXT,
  volume_adjusted_on TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_user ON plans(user_id, status);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  week INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  distance_m INTEGER NOT NULL,
  est_duration_s INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  activity_id TEXT,
  garmin_workout_id TEXT,
  garmin_scheduled_date TEXT,
  garmin_synced_at TEXT
);
CREATE INDEX IF NOT EXISTS workouts_plan_date ON workouts(plan_id, date);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  local_date TEXT NOT NULL,
  distance_m REAL NOT NULL,
  duration_s REAL NOT NULL,
  avg_hr REAL,
  laps_json TEXT,
  workout_id TEXT REFERENCES workouts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS activities_user_date ON activities(user_id, local_date);

CREATE TABLE IF NOT EXISTS garmin_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  garmin_user_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  connected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  return_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
