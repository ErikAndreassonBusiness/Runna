import { addDays } from './dates';
import { QUALITY_TYPES, type WorkoutItem, type WorkoutType } from './types';
import { expandSteps } from './workouts';

export interface Lap {
  distanceMeters: number;
  durationSeconds: number;
}

export interface ActivitySummary {
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  /** Laps recorded by the watch. A structured workout produces one lap per step. */
  laps?: Lap[];
}

export type WorkoutStatus = 'planned' | 'completed' | 'skipped';

export interface WorkoutRecord {
  date: string;
  type: WorkoutType;
  status: WorkoutStatus;
  steps: WorkoutItem[];
  distanceMeters: number;
  estDurationSeconds: number;
  activity?: ActivitySummary;
}

export interface AdaptationInput {
  today: string;
  workouts: WorkoutRecord[];
  currentAdjustment: number;
  /** Sessions on or before this date were already used for a fitness change. */
  since?: string;
}

export interface Adaptation {
  vdotAdjustment: number;
  /** Multiplier for easy and long run volume over the next 7 days. */
  nextWeekVolumeScale: number;
  /** Date of the newest session that drove a fitness change, if any. */
  consumedThrough?: string;
  reasons: string[];
}

export const MAX_ADJUSTMENT = 3;
const AHEAD = 1.03;
const BEHIND = 0.96;

/**
 * How fast the runner went relative to target: >1 is faster than planned.
 * Uses per-step laps when the watch recorded them, otherwise the whole activity.
 */
export function sessionPerformance(w: WorkoutRecord): number | null {
  const activity = w.activity;
  if (!activity || activity.distanceMeters <= 0 || activity.durationSeconds <= 0) return null;

  const steps = expandSteps(w.steps);
  if (activity.laps && activity.laps.length === steps.length) {
    let targetSeconds = 0;
    let actualSeconds = 0;
    steps.forEach((s, i) => {
      const lap = activity.laps![i];
      if (s.intensity !== 'active' || !s.pace || lap.distanceMeters <= 0) return;
      targetSeconds += (lap.distanceMeters / 1000) * ((s.pace.fast + s.pace.slow) / 2);
      actualSeconds += lap.durationSeconds;
    });
    if (actualSeconds > 0) return targetSeconds / actualSeconds;
  }

  const distanceRatio = activity.distanceMeters / w.distanceMeters;
  if (distanceRatio < 0.7 || distanceRatio > 1.3) return null;
  const plannedPace = w.estDurationSeconds / w.distanceMeters;
  const actualPace = activity.durationSeconds / activity.distanceMeters;
  return plannedPace / actualPace;
}

export function adaptPlan(input: AdaptationInput): Adaptation {
  const reasons: string[] = [];
  let adjustment = input.currentAdjustment;
  let consumedThrough: string | undefined;

  const recentQuality = input.workouts
    .filter(
      (w) =>
        w.status === 'completed' &&
        QUALITY_TYPES.includes(w.type) &&
        w.date <= input.today &&
        (!input.since || w.date > input.since),
    )
    .map((w) => ({ date: w.date, perf: sessionPerformance(w) }))
    .filter((s): s is { date: string; perf: number } => s.perf !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  const ahead = recentQuality.filter((s) => s.perf >= AHEAD).length;
  const behind = recentQuality.filter((s) => s.perf <= BEHIND).length;

  if (ahead >= 2 && behind === 0 && adjustment < MAX_ADJUSTMENT) {
    adjustment = Math.min(MAX_ADJUSTMENT, adjustment + 0.5);
    consumedThrough = recentQuality[0].date;
    reasons.push("You've been beating your target paces — your upcoming paces are now a little faster.");
  } else if (behind >= 2 && adjustment > -MAX_ADJUSTMENT) {
    adjustment = Math.max(-MAX_ADJUSTMENT, adjustment - 0.5);
    consumedThrough = recentQuality[0].date;
    reasons.push('Recent sessions felt tougher than planned — we eased your upcoming paces slightly.');
  }

  const windowStart = addDays(input.today, -14);
  const pastTwoWeeks = input.workouts.filter((w) => w.date >= windowStart && w.date < input.today);
  const done = pastTwoWeeks.filter((w) => w.status === 'completed').length;
  let nextWeekVolumeScale = 1;
  if (pastTwoWeeks.length >= 3 && done / pastTwoWeeks.length < 0.5) {
    nextWeekVolumeScale = 0.9;
    reasons.push("You've missed a few runs lately — next week's easy and long runs are a bit shorter to ease you back in.");
  }

  return { vdotAdjustment: adjustment, nextWeekVolumeScale, consumedThrough, reasons };
}
