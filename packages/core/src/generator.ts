import { addDays, daysBetween, startOfWeek, weekday } from './dates';
import {
  RACE_METERS,
  type Experience,
  type GeneratedPlan,
  type Phase,
  type PlanInput,
  type PlannedWorkout,
  type PlanWeek,
  type RaceDistance,
} from './types';
import { DEFAULT_VDOT, maxVdotGain, paceZones, predictRaceSeconds, vdotFromRace } from './vdot';
import {
  easyRun,
  fartlek,
  intervals,
  longRun,
  race,
  resolvePaces,
  roundTo,
  sharpener,
  shakeout,
  tempo,
  workoutMetrics,
  type SessionContext,
  type WorkoutTemplate,
} from './workouts';

export const MIN_PLAN_WEEKS = 3;
export const MAX_PLAN_WEEKS = 30;

const TAPER_WEEKS: Record<RaceDistance, number> = { '5k': 1, '10k': 1, half: 2, marathon: 3 };

/** Taper volume as a fraction of peak, last entry is race week. */
const TAPER_VOLUME: Record<RaceDistance, number[]> = {
  '5k': [0.55],
  '10k': [0.55],
  half: [0.7, 0.45],
  marathon: [0.75, 0.6, 0.4],
};

const PEAK_KM: Record<RaceDistance, Record<Experience, number>> = {
  '5k': { beginner: 30, intermediate: 45, advanced: 65 },
  '10k': { beginner: 35, intermediate: 50, advanced: 70 },
  half: { beginner: 40, intermediate: 58, advanced: 80 },
  marathon: { beginner: 50, intermediate: 70, advanced: 95 },
};

const LONG_RUN_CAP_KM: Record<RaceDistance, number> = { '5k': 16, '10k': 18, half: 22, marathon: 32 };
const LONG_RUN_SHARE: Record<RaceDistance, number> = { '5k': 0.28, '10k': 0.28, half: 0.3, marathon: 0.33 };

export class PlanInputError extends Error {}

function validate(input: PlanInput): void {
  const days = new Set(input.runDays);
  if (days.size !== input.runDays.length) throw new PlanInputError('Run days must be unique');
  if (input.runDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new PlanInputError('Run days must be 0 (Mon) to 6 (Sun)');
  }
  if (input.runDays.length < 2) throw new PlanInputError('Choose at least 2 run days per week');
  if (!days.has(input.longRunDay)) throw new PlanInputError('Long run day must be one of your run days');
  if (daysBetween(input.startDate, input.raceDate) < 7) {
    throw new PlanInputError('Race date must be at least a week away');
  }
}

export function planWeekCount(startDate: string, raceDate: string): number {
  return Math.floor(daysBetween(startOfWeek(startDate), raceDate) / 7) + 1;
}

export function assignPhases(totalWeeks: number, goal: RaceDistance): Phase[] {
  const taper = Math.min(TAPER_WEEKS[goal], Math.max(1, Math.floor(totalWeeks / 4)));
  const rest = totalWeeks - taper;
  const base = Math.round(rest * 0.35);
  const peak = Math.round(rest * 0.25);
  const build = rest - base - peak;
  return [
    ...Array<Phase>(base).fill('base'),
    ...Array<Phase>(build).fill('build'),
    ...Array<Phase>(peak).fill('peak'),
    ...Array<Phase>(taper).fill('taper'),
  ];
}

export function weeklyVolumes(input: PlanInput, phases: Phase[]): number[] {
  const runs = input.runDays.length;
  const startKm = Math.max(input.weeklyKm, runs * 3);
  const freqFactor = runs <= 3 ? 0.8 : runs >= 6 ? 1.1 : 1;
  const peakKm = Math.max(PEAK_KM[input.goal][input.experience] * freqFactor, startKm);
  const buildWeeks = phases.filter((p) => p !== 'taper').length;

  const volumes: number[] = [];
  let prev = startKm;
  for (let i = 0; i < buildWeeks; i++) {
    const ramp = buildWeeks > 1 ? startKm + (peakKm - startKm) * (i / (buildWeeks - 1)) : startKm;
    // Never progress by more than 10% week on week.
    const km = i === 0 ? startKm : Math.min(ramp, prev * 1.1);
    prev = km;
    const isCutback = i % 4 === 3 && i !== buildWeeks - 1;
    volumes.push(isCutback ? km * 0.8 : km);
  }
  const peakReached = prev;
  const taper = TAPER_VOLUME[input.goal].slice(-(phases.length - buildWeeks));
  for (const factor of taper) volumes.push(peakReached * factor);
  return volumes.map((km) => roundTo(km * 1000, 500));
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
}

/** Spread hard sessions out: maximise the gap to the long run and to each other. */
export function pickQualityDays(candidates: number[], longRunDay: number, count: number): number[] {
  const chosen: number[] = [];
  const pool = [...candidates].sort((a, b) => a - b);
  while (chosen.length < count && pool.length > 0) {
    let best = pool[0];
    let bestScore = -1;
    for (const day of pool) {
      const score = Math.min(...[longRunDay, ...chosen].map((o) => circularDistance(day, o)));
      if (score > bestScore) {
        best = day;
        bestScore = score;
      }
    }
    chosen.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return chosen.sort((a, b) => a - b);
}

/** Fitness the plan targets for a given week, before adaptation adjustments. */
export function vdotForWeek(startVdot: number, targetVdot: number, week: number, totalWeeks: number): number {
  const progress = totalWeeks > 1 ? (week - 1) / (totalWeeks - 1) : 1;
  return startVdot + (targetVdot - startVdot) * progress;
}

export function targetVdotFor(input: PlanInput, startVdot: number, totalWeeks: number): number {
  const ceiling = startVdot + maxVdotGain(totalWeeks, input.experience);
  if (input.goalTimeSeconds) {
    const goalVdot = vdotFromRace(RACE_METERS[input.goal], input.goalTimeSeconds);
    return Math.min(Math.max(goalVdot, startVdot), ceiling);
  }
  return startVdot + (ceiling - startVdot) * 0.5;
}

function qualitySessionCount(phase: Phase, runs: number, experience: Experience): number {
  if (runs <= 2 || phase === 'base' || phase === 'taper') return 1;
  if (experience === 'beginner') return runs >= 5 && phase === 'peak' ? 2 : 1;
  return runs >= 4 ? 2 : 1;
}

function phaseProgress(phases: Phase[], index: number): number {
  const phase = phases[index];
  const first = phases.indexOf(phase);
  const count = phases.lastIndexOf(phase) - first + 1;
  return count > 1 ? (index - first) / (count - 1) : 0.5;
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  validate(input);
  const totalWeeks = planWeekCount(input.startDate, input.raceDate);
  if (totalWeeks < MIN_PLAN_WEEKS) {
    throw new PlanInputError(`Plans need at least ${MIN_PLAN_WEEKS} weeks before race day`);
  }
  if (totalWeeks > MAX_PLAN_WEEKS) {
    throw new PlanInputError(`Plans can be at most ${MAX_PLAN_WEEKS} weeks long`);
  }

  const raceMeters = RACE_METERS[input.goal];
  const startVdot = input.recentRace
    ? vdotFromRace(input.recentRace.distanceMeters, input.recentRace.timeSeconds)
    : DEFAULT_VDOT[input.experience];
  const targetVdot = targetVdotFor(input, startVdot, totalWeeks);

  const phases = assignPhases(totalWeeks, input.goal);
  const volumes = weeklyVolumes(input, phases);
  const planStart = startOfWeek(input.startDate);
  const runDays = [...input.runDays].sort((a, b) => a - b);

  const weeks: PlanWeek[] = [];
  const workouts: PlannedWorkout[] = [];

  for (let i = 0; i < totalWeeks; i++) {
    const week = i + 1;
    const phase = phases[i];
    const weekStart = addDays(planStart, i * 7);
    const targetMeters = volumes[i];
    weeks.push({ week, phase, startDate: weekStart, targetMeters });

    const zones = paceZones(vdotForWeek(startVdot, targetVdot, week, totalWeeks), raceMeters);
    const ctx: SessionContext = {
      goal: input.goal,
      experience: input.experience,
      phase,
      progress: phaseProgress(phases, i),
      weekMeters: targetMeters,
    };
    const isRaceWeek = week === totalWeeks;
    const sessions = isRaceWeek
      ? raceWeekSessions(input, runDays, ctx)
      : trainingWeekSessions(input, runDays, ctx, week);

    for (const [day, template] of sessions) {
      const date = addDays(weekStart, day);
      if (date < input.startDate) continue;
      const steps = resolvePaces(template.steps, zones);
      workouts.push({
        date,
        week,
        type: template.type,
        title: template.title,
        description: template.description,
        steps,
        ...workoutMetrics(steps),
      });
    }
  }

  return {
    startVdot,
    targetVdot,
    predictedRaceSeconds: Math.round(predictRaceSeconds(targetVdot, raceMeters)),
    weeks,
    workouts: workouts.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function trainingWeekSessions(
  input: PlanInput,
  runDays: number[],
  ctx: SessionContext,
  week: number,
): Map<number, WorkoutTemplate> {
  const sessions = new Map<number, WorkoutTemplate>();
  const others = runDays.filter((d) => d !== input.longRunDay);
  const qualityDays = pickQualityDays(
    others,
    input.longRunDay,
    qualitySessionCount(ctx.phase, runDays.length, input.experience),
  );

  qualityDays.forEach((day, idx) => {
    let template: WorkoutTemplate;
    if (ctx.phase === 'base') template = week % 2 === 1 ? fartlek(ctx) : tempo(ctx);
    else if (ctx.phase === 'taper') template = sharpener(ctx);
    else if (qualityDays.length === 2) template = idx === 0 ? intervals(ctx) : tempo(ctx);
    else template = week % 2 === 1 ? intervals(ctx) : tempo(ctx);
    sessions.set(day, template);
  });

  const longCap = LONG_RUN_CAP_KM[input.goal] * (input.experience === 'beginner' ? 0.9 : 1) * 1000;
  let longMeters = Math.max(5000, ctx.weekMeters * LONG_RUN_SHARE[input.goal]);
  if (sessions.size === others.length) {
    // No easy days left to absorb volume, so the long run carries the remainder.
    const qualityMeters = [...sessions.values()].reduce((s, t) => s + workoutMetrics(t.steps).distanceMeters, 0);
    longMeters = Math.max(longMeters, ctx.weekMeters - qualityMeters);
  }
  longMeters = roundTo(Math.min(longCap, longMeters), 500);
  const goalPaceFinish =
    ctx.phase === 'peak' && (input.goal === 'half' || input.goal === 'marathon') && week % 2 === 0
      ? roundTo(longMeters * 0.3, 1000)
      : 0;
  sessions.set(input.longRunDay, longRun(longMeters, goalPaceFinish));

  fillEasyRuns(sessions, runDays, ctx.weekMeters, longMeters * 0.8);
  return sessions;
}

function raceWeekSessions(
  input: PlanInput,
  runDays: number[],
  ctx: SessionContext,
): Map<number, WorkoutTemplate> {
  const sessions = new Map<number, WorkoutTemplate>();
  const raceDay = weekday(input.raceDate);
  const before = runDays.filter((d) => d < raceDay);

  const sharpenerDay = before.find((d) => raceDay - d >= 3);
  if (sharpenerDay !== undefined) sessions.set(sharpenerDay, sharpener(ctx));
  const dayBefore = before.at(-1);
  if (dayBefore !== undefined && raceDay - dayBefore === 1 && dayBefore !== sharpenerDay) {
    sessions.set(dayBefore, shakeout(3000));
  }

  const remaining = Math.max(0, ctx.weekMeters - RACE_METERS[input.goal]);
  fillEasyRuns(sessions, before, remaining, 8000);
  sessions.set(raceDay, race(input.goal));
  return sessions;
}

/** Spread the week's leftover volume over the run days that have no session yet. */
function fillEasyRuns(
  sessions: Map<number, WorkoutTemplate>,
  runDays: number[],
  weekMeters: number,
  maxEasyMeters: number,
): void {
  const free = runDays.filter((d) => !sessions.has(d));
  if (free.length === 0) return;
  // Estimate fixed sessions at their nominal distance (paces are resolved later).
  const used = [...sessions.values()].reduce((sum, t) => sum + workoutMetrics(t.steps).distanceMeters, 0);
  const each = roundTo(Math.min(maxEasyMeters, Math.max(3000, (weekMeters - used) / free.length)), 500);
  for (const day of free) sessions.set(day, easyRun(each));
}
