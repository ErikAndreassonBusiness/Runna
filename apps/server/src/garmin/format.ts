import type { Lap, PaceRange, StepDuration, WorkoutItem, WorkoutStep } from '@stride/core';
import type { NormalizedActivity } from './provider';

/**
 * Conversion between our workout model and Garmin's Training / Activity API JSON.
 *
 * VERIFY: field names follow Garmin's Training API V2 spec as we understand it.
 * The spec is only published to approved developers — once you have access,
 * diff this against "Training API" in the developer portal before going live.
 */

type GarminStep = Record<string, unknown>;

export interface GarminWorkout {
  workoutName: string;
  description: string;
  sport: 'RUNNING';
  workoutProvider: string;
  workoutSourceId: string;
  estimatedDurationInSecs: number;
  estimatedDistanceInMeters: number;
  segments: {
    segmentOrder: number;
    sport: 'RUNNING';
    estimatedDurationInSecs: number;
    estimatedDistanceInMeters: number;
    steps: GarminStep[];
  }[];
}

const INTENSITY: Record<WorkoutStep['intensity'], string> = {
  warmup: 'WARMUP',
  active: 'ACTIVE',
  recovery: 'RECOVERY',
  cooldown: 'COOLDOWN',
  rest: 'REST',
};

function duration(d: StepDuration): GarminStep {
  if (d.type === 'distance') return { durationType: 'DISTANCE', durationValue: d.meters, durationValueType: 'METER' };
  if (d.type === 'time') return { durationType: 'TIME', durationValue: d.seconds };
  return { durationType: 'OPEN', durationValue: null };
}

/** Garmin pace targets are speeds in m/s; the slower pace is the lower bound. */
function target(pace?: PaceRange): GarminStep {
  if (!pace) return { targetType: 'OPEN' };
  return {
    targetType: 'PACE',
    targetValueLow: Number((1000 / pace.slow).toFixed(3)),
    targetValueHigh: Number((1000 / pace.fast).toFixed(3)),
  };
}

export function toGarminWorkout(w: {
  title: string;
  description: string;
  steps: WorkoutItem[];
  distanceMeters: number;
  estDurationSeconds: number;
}): GarminWorkout {
  let order = 0;
  const convertStep = (s: WorkoutStep, inRepeat: boolean): GarminStep => ({
    type: 'WorkoutStep',
    stepOrder: ++order,
    intensity: inRepeat && s.intensity === 'active' ? 'INTERVAL' : INTENSITY[s.intensity],
    description: s.note ?? null,
    ...duration(s.duration),
    ...target(s.pace),
  });

  const steps = w.steps.map((item) => {
    if (item.kind === 'step') return convertStep(item, false);
    const repeatOrder = ++order;
    return {
      type: 'WorkoutRepeatStep',
      stepOrder: repeatOrder,
      repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
      repeatValue: item.times,
      steps: item.steps.map((s) => convertStep(s, true)),
    };
  });

  return {
    workoutName: w.title.slice(0, 50),
    description: w.description.slice(0, 500),
    sport: 'RUNNING',
    workoutProvider: 'Stride',
    workoutSourceId: 'Stride',
    estimatedDurationInSecs: w.estDurationSeconds,
    estimatedDistanceInMeters: w.distanceMeters,
    segments: [
      {
        segmentOrder: 1,
        sport: 'RUNNING',
        estimatedDurationInSecs: w.estDurationSeconds,
        estimatedDistanceInMeters: w.distanceMeters,
        steps,
      },
    ],
  };
}

/** Activity summary as sent by Garmin's Activity API (push or pull). */
export interface GarminActivitySummary {
  summaryId: string;
  activityId?: number;
  activityName?: string;
  activityType: string;
  startTimeInSeconds: number;
  startTimeOffsetInSeconds?: number;
  durationInSeconds: number;
  distanceInMeters?: number;
  averageHeartRateInBeatsPerMinute?: number;
}

export interface GarminActivityDetails {
  summaryId: string;
  activityId?: number;
  summary: GarminActivitySummary;
  samples?: { startTimeInSeconds: number; totalDistanceInMeters?: number }[];
  laps?: { startTimeInSeconds: number }[];
}

export const isRunning = (activityType: string) => /RUN/i.test(activityType);

/** Lap distances are not sent directly; derive them from cumulative distance samples. */
export function lapsFromDetails(details: GarminActivityDetails): Lap[] | undefined {
  const laps = [...(details.laps ?? [])].sort((a, b) => a.startTimeInSeconds - b.startTimeInSeconds);
  const samples = (details.samples ?? []).filter((s) => s.totalDistanceInMeters !== undefined);
  if (laps.length === 0 || samples.length === 0) return undefined;

  const end = details.summary.startTimeInSeconds + details.summary.durationInSeconds;
  const distanceAt = (t: number) => {
    let d = 0;
    for (const s of samples) {
      if (s.startTimeInSeconds > t) break;
      d = s.totalDistanceInMeters!;
    }
    return d;
  };

  return laps.map((lap, i) => {
    const t0 = lap.startTimeInSeconds;
    const t1 = laps[i + 1]?.startTimeInSeconds ?? end;
    return { distanceMeters: distanceAt(t1) - distanceAt(t0), durationSeconds: t1 - t0 };
  });
}

export function normalizeGarminActivity(
  summary: GarminActivitySummary,
  details?: GarminActivityDetails,
): NormalizedActivity {
  const offset = summary.startTimeOffsetInSeconds ?? 0;
  return {
    source: 'garmin',
    externalId: String(summary.activityId ?? summary.summaryId),
    name: summary.activityName ?? 'Run',
    startTime: new Date(summary.startTimeInSeconds * 1000).toISOString(),
    localDate: new Date((summary.startTimeInSeconds + offset) * 1000).toISOString().slice(0, 10),
    distanceMeters: summary.distanceInMeters ?? 0,
    durationSeconds: summary.durationInSeconds,
    avgHeartRate: summary.averageHeartRateInBeatsPerMinute,
    laps: details ? lapsFromDetails(details) : undefined,
  };
}

/** Turn a batch of summaries (and optional details) into running activities. */
export function normalizeBatch(
  summaries: GarminActivitySummary[],
  details: GarminActivityDetails[] = [],
): NormalizedActivity[] {
  const detailsById = new Map(details.map((d) => [String(d.activityId ?? d.summary.activityId), d]));
  // A details-only push still carries the summary.
  const all = new Map<string, GarminActivitySummary>();
  for (const d of details) all.set(String(d.activityId ?? d.summary.activityId ?? d.summaryId), d.summary);
  for (const s of summaries) all.set(String(s.activityId ?? s.summaryId), s);

  return [...all.entries()]
    .filter(([, s]) => isRunning(s.activityType))
    .map(([id, s]) => normalizeGarminActivity(s, detailsById.get(id)));
}
