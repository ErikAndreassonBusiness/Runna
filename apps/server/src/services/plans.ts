import {
  adaptPlan,
  addDays,
  generatePlan,
  paceZones,
  predictRaceSeconds,
  RACE_METERS,
  resolvePaces,
  roundTo,
  vdotForWeek,
  vdotFromRace,
  workoutMetrics,
  type ActivitySummary,
  type PlanInput,
  type PlanWeek,
  type RaceResult,
  type WorkoutItem,
  type WorkoutRecord,
  type WorkoutStatus,
  type WorkoutType,
} from '@stride/core';
import { newId, nowIso, transaction, type Db } from '../db';

export interface PlanRow {
  id: string;
  user_id: string;
  status: string;
  input_json: string;
  weeks_json: string;
  start_vdot: number;
  target_vdot: number;
  vdot_adjustment: number;
  predicted_race_seconds: number;
  adapted_through: string | null;
  volume_adjusted_on: string | null;
  created_at: string;
}

export interface WorkoutRow {
  id: string;
  plan_id: string;
  user_id: string;
  date: string;
  week: number;
  type: WorkoutType;
  title: string;
  description: string;
  steps_json: string;
  distance_m: number;
  est_duration_s: number;
  status: WorkoutStatus;
  activity_id: string | null;
  garmin_workout_id: string | null;
  garmin_scheduled_date: string | null;
  garmin_synced_at: string | null;
}

interface ActivityRow {
  id: string;
  name: string;
  source: string;
  start_time: string;
  local_date: string;
  distance_m: number;
  duration_s: number;
  avg_hr: number | null;
  laps_json: string | null;
  workout_id: string | null;
}

export function activityDto(a: ActivityRow) {
  return {
    id: a.id,
    name: a.name,
    source: a.source,
    startTime: a.start_time,
    date: a.local_date,
    distanceMeters: a.distance_m,
    durationSeconds: a.duration_s,
    avgHeartRate: a.avg_hr ?? undefined,
    laps: a.laps_json ? JSON.parse(a.laps_json) : undefined,
  };
}

export function workoutDto(w: WorkoutRow, activity?: ActivityRow) {
  return {
    id: w.id,
    date: w.date,
    week: w.week,
    type: w.type,
    title: w.title,
    description: w.description,
    steps: JSON.parse(w.steps_json) as WorkoutItem[],
    distanceMeters: w.distance_m,
    estDurationSeconds: w.est_duration_s,
    status: w.status,
    garminSynced: Boolean(w.garmin_synced_at) && w.garmin_scheduled_date === w.date,
    activity: activity ? activityDto(activity) : undefined,
  };
}

export function planDto(p: PlanRow, today: string) {
  const input = JSON.parse(p.input_json) as PlanInput;
  const weeks = JSON.parse(p.weeks_json) as PlanWeek[];
  const currentWeek = weeks.findLast((w) => w.startDate <= today)?.week ?? 1;
  const raceMeters = RACE_METERS[input.goal];
  const currentVdot = weekVdot(p, currentWeek);
  return {
    id: p.id,
    goal: input.goal,
    raceDate: input.raceDate,
    input,
    weeks,
    currentWeek,
    vdot: Number(currentVdot.toFixed(1)),
    vdotAdjustment: p.vdot_adjustment,
    predictedRaceSeconds: Math.round(predictRaceSeconds(p.target_vdot + p.vdot_adjustment, raceMeters)),
    paces: paceZones(currentVdot, raceMeters),
    createdAt: p.created_at,
  };
}

export function getActivePlan(db: Db, userId: string): PlanRow | undefined {
  return db
    .prepare("SELECT * FROM plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(userId) as PlanRow | undefined;
}

export function getPlanWorkouts(db: Db, planId: string): WorkoutRow[] {
  return db.prepare('SELECT * FROM workouts WHERE plan_id = ? ORDER BY date').all(planId) as unknown as WorkoutRow[];
}

export function getActivitiesForPlan(db: Db, planId: string): Map<string, ActivityRow> {
  const rows = db
    .prepare(
      `SELECT a.* FROM activities a JOIN workouts w ON w.id = a.workout_id WHERE w.plan_id = ?`,
    )
    .all(planId) as unknown as ActivityRow[];
  return new Map(rows.map((a) => [a.workout_id!, a]));
}

export function getActivity(db: Db, id: string): ActivityRow | undefined {
  return db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as ActivityRow | undefined;
}

export function createPlan(db: Db, userId: string, input: PlanInput): string {
  const generated = generatePlan(input);
  const planId = newId();
  transaction(db, () => {
    db.prepare("UPDATE plans SET status = 'archived' WHERE user_id = ? AND status = 'active'").run(userId);
    db.prepare(
      `INSERT INTO plans (id, user_id, input_json, weeks_json, start_vdot, target_vdot, predicted_race_seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      planId,
      userId,
      JSON.stringify(input),
      JSON.stringify(generated.weeks),
      generated.startVdot,
      generated.targetVdot,
      generated.predictedRaceSeconds,
      nowIso(),
    );
    const insert = db.prepare(
      `INSERT INTO workouts (id, plan_id, user_id, date, week, type, title, description, steps_json, distance_m, est_duration_s)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const w of generated.workouts) {
      insert.run(
        newId(),
        planId,
        userId,
        w.date,
        w.week,
        w.type,
        w.title,
        w.description,
        JSON.stringify(w.steps),
        w.distanceMeters,
        w.estDurationSeconds,
      );
    }
  });
  return planId;
}

export function addPlanEvent(db: Db, planId: string, message: string): void {
  db.prepare('INSERT INTO plan_events (id, plan_id, message, created_at) VALUES (?, ?, ?, ?)').run(
    newId(),
    planId,
    message,
    nowIso(),
  );
}

export function getPlanEvents(db: Db, planId: string, limit = 10) {
  return db
    .prepare('SELECT message, created_at AS createdAt FROM plan_events WHERE plan_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(planId, limit) as { message: string; createdAt: string }[];
}

function updateWorkoutSteps(db: Db, id: string, steps: WorkoutItem[]): void {
  const metrics = workoutMetrics(steps);
  // Steps changed, so whatever is on the watch is stale.
  db.prepare(
    'UPDATE workouts SET steps_json = ?, distance_m = ?, est_duration_s = ?, garmin_synced_at = NULL WHERE id = ?',
  ).run(JSON.stringify(steps), metrics.distanceMeters, metrics.estDurationSeconds, id);
}

function weekVdot(plan: PlanRow, week: number): number {
  const weeks = JSON.parse(plan.weeks_json) as PlanWeek[];
  return vdotForWeek(plan.start_vdot, plan.target_vdot, week, weeks.length) + plan.vdot_adjustment;
}

/** Recompute paces for planned workouts from `fromDate` onwards using the plan's current fitness. */
export function repaceFutureWorkouts(db: Db, plan: PlanRow, fromDate: string): void {
  const input = JSON.parse(plan.input_json) as PlanInput;
  const raceMeters = RACE_METERS[input.goal];
  const rows = getPlanWorkouts(db, plan.id).filter((w) => w.date >= fromDate && w.status === 'planned');
  for (const w of rows) {
    const zones = paceZones(weekVdot(plan, w.week), raceMeters);
    updateWorkoutSteps(db, w.id, resolvePaces(JSON.parse(w.steps_json), zones));
  }
}

/** Shorten easy and long runs in the next week by `factor`. */
function scaleUpcomingVolume(db: Db, plan: PlanRow, today: string, factor: number): void {
  const end = addDays(today, 7);
  const rows = getPlanWorkouts(db, plan.id).filter(
    (w) => w.date > today && w.date <= end && w.status === 'planned' && ['easy', 'long', 'recovery'].includes(w.type),
  );
  for (const w of rows) {
    const steps = (JSON.parse(w.steps_json) as WorkoutItem[]).map((item) =>
      item.kind === 'step' && item.duration.type === 'distance'
        ? { ...item, duration: { type: 'distance' as const, meters: Math.max(2000, roundTo(item.duration.meters * factor, 500)) } }
        : item,
    );
    updateWorkoutSteps(db, w.id, steps);
  }
}

export function toWorkoutRecord(w: WorkoutRow, activity?: ActivityRow): WorkoutRecord {
  const summary: ActivitySummary | undefined = activity && {
    distanceMeters: activity.distance_m,
    durationSeconds: activity.duration_s,
    avgHeartRate: activity.avg_hr ?? undefined,
    laps: activity.laps_json ? JSON.parse(activity.laps_json) : undefined,
  };
  return {
    date: w.date,
    type: w.type,
    status: w.status,
    steps: JSON.parse(w.steps_json),
    distanceMeters: w.distance_m,
    estDurationSeconds: w.est_duration_s,
    activity: summary,
  };
}

/** Look at recent training and adjust paces / volume. Returns messages for the runner. */
export function runAdaptation(db: Db, userId: string, today: string): string[] {
  const plan = getActivePlan(db, userId);
  if (!plan) return [];
  const activities = getActivitiesForPlan(db, plan.id);
  const records = getPlanWorkouts(db, plan.id).map((w) => toWorkoutRecord(w, activities.get(w.id)));

  const result = adaptPlan({
    today,
    workouts: records,
    currentAdjustment: plan.vdot_adjustment,
    since: plan.adapted_through ?? undefined,
  });

  const messages: string[] = [];
  transaction(db, () => {
    if (result.vdotAdjustment !== plan.vdot_adjustment) {
      db.prepare('UPDATE plans SET vdot_adjustment = ?, adapted_through = ? WHERE id = ?').run(
        result.vdotAdjustment,
        result.consumedThrough ?? today,
        plan.id,
      );
      repaceFutureWorkouts(db, { ...plan, vdot_adjustment: result.vdotAdjustment }, addDays(today, 1));
      messages.push(result.reasons[0]);
    }
    const lastVolumeChange = plan.volume_adjusted_on;
    if (result.nextWeekVolumeScale < 1 && (!lastVolumeChange || lastVolumeChange <= addDays(today, -7))) {
      scaleUpcomingVolume(db, plan, today, result.nextWeekVolumeScale);
      db.prepare('UPDATE plans SET volume_adjusted_on = ? WHERE id = ?').run(today, plan.id);
      messages.push(result.reasons.at(-1)!);
    }
    for (const m of messages) addPlanEvent(db, plan.id, m);
  });
  return messages;
}

/** A new race or time trial resets fitness: future paces are recalculated from it. */
export function applyRaceResult(db: Db, plan: PlanRow, result: RaceResult, today: string): string {
  const measured = vdotFromRace(result.distanceMeters, result.timeSeconds);
  const workouts = getPlanWorkouts(db, plan.id);
  const currentWeek = workouts.find((w) => w.date >= today)?.week ?? 1;
  const adjustment = measured - (weekVdot(plan, currentWeek) - plan.vdot_adjustment);
  const message =
    measured >= weekVdot(plan, currentWeek)
      ? 'New race result logged — your paces have been updated to match your improved fitness.'
      : 'New race result logged — your paces have been recalibrated.';
  transaction(db, () => {
    db.prepare('UPDATE plans SET vdot_adjustment = ?, adapted_through = ? WHERE id = ?').run(adjustment, today, plan.id);
    repaceFutureWorkouts(db, { ...plan, vdot_adjustment: adjustment }, today);
    addPlanEvent(db, plan.id, message);
  });
  return message;
}
