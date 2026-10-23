import { daysBetween } from '@stride/core';
import { newId, nowIso, type Db } from '../db';
import type { NormalizedActivity } from '../garmin/provider';
import { getActivePlan, getPlanWorkouts, type WorkoutRow } from './plans';

export interface IngestResult {
  activityId: string;
  workoutId: string | null;
  isNew: boolean;
}

/** Pick the planned workout this run most likely was: same day first, then ±1 day. */
function matchWorkout(workouts: WorkoutRow[], localDate: string): WorkoutRow | undefined {
  const candidates = workouts
    .filter((w) => w.status !== 'completed' && Math.abs(daysBetween(w.date, localDate)) <= 1)
    .sort((a, b) => Math.abs(daysBetween(a.date, localDate)) - Math.abs(daysBetween(b.date, localDate)));
  return candidates[0];
}

export function ingestActivity(db: Db, userId: string, activity: NormalizedActivity): IngestResult {
  const existing = db
    .prepare('SELECT id, workout_id FROM activities WHERE source = ? AND external_id = ?')
    .get(activity.source, activity.externalId) as { id: string; workout_id: string | null } | undefined;

  if (existing) {
    // Details (laps) often arrive after the summary — fill them in.
    if (activity.laps) {
      db.prepare('UPDATE activities SET laps_json = ? WHERE id = ?').run(JSON.stringify(activity.laps), existing.id);
    }
    return { activityId: existing.id, workoutId: existing.workout_id, isNew: false };
  }

  const plan = getActivePlan(db, userId);
  const workout = plan ? matchWorkout(getPlanWorkouts(db, plan.id), activity.localDate) : undefined;
  const id = newId();
  db.prepare(
    `INSERT INTO activities (id, user_id, source, external_id, name, start_time, local_date, distance_m, duration_s, avg_hr, laps_json, workout_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    activity.source,
    activity.externalId,
    activity.name,
    activity.startTime,
    activity.localDate,
    activity.distanceMeters,
    activity.durationSeconds,
    activity.avgHeartRate ?? null,
    activity.laps ? JSON.stringify(activity.laps) : null,
    workout?.id ?? null,
    nowIso(),
  );
  if (workout) {
    db.prepare("UPDATE workouts SET status = 'completed', activity_id = ? WHERE id = ?").run(id, workout.id);
  }
  return { activityId: id, workoutId: workout?.id ?? null, isNew: true };
}

/** Log a run by hand against a specific workout (no watch, or a missed sync). */
export function logManualActivity(
  db: Db,
  userId: string,
  workout: WorkoutRow,
  distanceMeters: number,
  durationSeconds: number,
): string {
  const id = newId();
  db.prepare(
    `INSERT INTO activities (id, user_id, source, external_id, name, start_time, local_date, distance_m, duration_s, workout_id, created_at)
     VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, id, workout.title, `${workout.date}T12:00:00.000Z`, workout.date, distanceMeters, durationSeconds, workout.id, nowIso());
  db.prepare("UPDATE workouts SET status = 'completed', activity_id = ? WHERE id = ?").run(id, workout.id);
  return id;
}

/** Undo completion/skip. Manual logs are deleted; synced runs are kept but unlinked. */
export function resetWorkout(db: Db, workout: WorkoutRow): void {
  if (workout.activity_id) {
    db.prepare("DELETE FROM activities WHERE id = ? AND source = 'manual'").run(workout.activity_id);
    db.prepare('UPDATE activities SET workout_id = NULL WHERE id = ?').run(workout.activity_id);
  }
  db.prepare("UPDATE workouts SET status = 'planned', activity_id = NULL WHERE id = ?").run(workout.id);
}
