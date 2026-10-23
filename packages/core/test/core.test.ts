import { describe, expect, it } from 'vitest';
import {
  adaptPlan,
  addDays,
  expandSteps,
  generatePlan,
  paceZones,
  parseDuration,
  pickQualityDays,
  PlanInputError,
  predictRaceSeconds,
  sessionPerformance,
  vdotFromRace,
  weekday,
  type PlanInput,
  type WorkoutRecord,
} from '../src';

const baseInput: PlanInput = {
  goal: 'half',
  raceDate: '2027-03-21', // Sunday
  startDate: '2026-11-02', // Monday
  experience: 'intermediate',
  recentRace: { distanceMeters: 5000, timeSeconds: 22 * 60 },
  weeklyKm: 30,
  runDays: [1, 3, 4, 6],
  longRunDay: 6,
};

describe('vdot', () => {
  it('matches published Daniels values', () => {
    expect(vdotFromRace(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    // VDOT 50 marathon ≈ 3:10:49
    expect(predictRaceSeconds(50, 42195) / 60).toBeCloseTo(190.8, 0);
  });

  it('round-trips race time through VDOT', () => {
    const vdot = vdotFromRace(10000, 45 * 60);
    expect(predictRaceSeconds(vdot, 10000)).toBeCloseTo(45 * 60, 0);
  });

  it('orders pace zones from slow to fast', () => {
    const z = paceZones(50);
    expect(z.threshold.fast).toBeGreaterThanOrEqual(250);
    expect(z.threshold.fast).toBeLessThanOrEqual(258); // ≈4:15/km
    expect(z.easy.fast).toBeGreaterThan(z.marathon.slow);
    expect(z.marathon.fast).toBeGreaterThan(z.threshold.slow);
    expect(z.threshold.fast).toBeGreaterThan(z.interval.slow);
    expect(z.interval.fast).toBeGreaterThan(z.repetition.slow);
  });
});

describe('generatePlan', () => {
  const plan = generatePlan(baseInput);

  it('ends with the race on race day', () => {
    const last = plan.workouts.at(-1)!;
    expect(last.date).toBe(baseInput.raceDate);
    expect(last.type).toBe('race');
    expect(last.distanceMeters).toBe(21098);
  });

  it('schedules only on run days (plus race day) and never before the start date', () => {
    for (const w of plan.workouts) {
      expect(w.date >= baseInput.startDate).toBe(true);
      if (w.type !== 'race') expect(baseInput.runDays).toContain(weekday(w.date));
    }
    const dates = plan.workouts.map((w) => w.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('puts long runs on the long run day', () => {
    for (const w of plan.workouts.filter((w) => w.type === 'long')) {
      expect(weekday(w.date)).toBe(baseInput.longRunDay);
    }
  });

  it('progresses volume by at most 10% and tapers into race week', () => {
    const volumes = plan.weeks.map((w) => w.targetMeters);
    for (let i = 1; i < volumes.length; i++) {
      // Returning from a cutback week is fine; never exceed the previous high by >10%.
      expect(volumes[i]).toBeLessThanOrEqual(Math.max(...volumes.slice(0, i)) * 1.1 + 500);
    }
    const peak = Math.max(...volumes);
    expect(volumes.at(-1)!).toBeLessThan(peak * 0.6);
    expect(plan.weeks.at(-1)!.phase).toBe('taper');
    expect(plan.weeks[0].phase).toBe('base');
  });

  it('includes cutback weeks', () => {
    const volumes = plan.weeks.map((w) => w.targetMeters);
    expect(volumes[3]).toBeLessThan(volumes[2]);
  });

  it('gets faster over the block', () => {
    const tempos = plan.workouts.filter((w) => w.type === 'tempo');
    const pace = (w: (typeof tempos)[number]) =>
      expandSteps(w.steps).find((s) => s.zone === 'threshold')!.pace!.fast;
    expect(pace(tempos.at(-1)!)).toBeLessThan(pace(tempos[0]));
    expect(plan.targetVdot).toBeGreaterThan(plan.startVdot);
  });

  it('caps unrealistic goal times', () => {
    const p = generatePlan({ ...baseInput, goalTimeSeconds: 70 * 60 });
    expect(p.targetVdot - p.startVdot).toBeLessThanOrEqual(4);
  });

  it('rejects invalid input', () => {
    expect(() => generatePlan({ ...baseInput, longRunDay: 0 })).toThrow(PlanInputError);
    expect(() => generatePlan({ ...baseInput, raceDate: addDays(baseInput.startDate, 10) })).toThrow(
      PlanInputError,
    );
    expect(() => generatePlan({ ...baseInput, runDays: [6] })).toThrow(PlanInputError);
  });

  it('works for every goal and frequency', () => {
    for (const goal of ['5k', '10k', 'half', 'marathon'] as const) {
      for (const runDays of [[2, 5], [1, 3, 6], [0, 1, 3, 4, 6], [0, 1, 2, 3, 4, 5, 6]]) {
        const p = generatePlan({ ...baseInput, goal, runDays, longRunDay: runDays.at(-1)!, recentRace: undefined });
        expect(p.workouts.length).toBeGreaterThan(0);
        for (const w of p.workouts) {
          expect(w.distanceMeters).toBeGreaterThan(0);
          expect(w.estDurationSeconds).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('pickQualityDays', () => {
  it('keeps hard days away from the long run and each other', () => {
    expect(pickQualityDays([0, 1, 2, 3, 4, 5], 6, 2)).toEqual([2, 4]);
    expect(pickQualityDays([1, 3, 4], 6, 1)).toEqual([3]);
  });
});

describe('adaptPlan', () => {
  const plan = generatePlan(baseInput);
  const quality = plan.workouts.filter((w) => w.type === 'tempo' || w.type === 'intervals').slice(0, 3);
  const today = addDays(quality[2].date, 1);

  const record = (speedFactor: number) =>
    quality.map<WorkoutRecord>((w) => ({
      ...w,
      status: 'completed',
      activity: {
        distanceMeters: w.distanceMeters,
        durationSeconds: w.estDurationSeconds / speedFactor,
      },
    }));

  it('speeds paces up when the runner is consistently ahead', () => {
    const result = adaptPlan({ today, workouts: record(1.06), currentAdjustment: 0 });
    expect(result.vdotAdjustment).toBe(0.5);
    expect(result.consumedThrough).toBe(quality[2].date);
  });

  it('slows paces down when the runner is consistently behind', () => {
    const result = adaptPlan({ today, workouts: record(0.9), currentAdjustment: 0 });
    expect(result.vdotAdjustment).toBe(-0.5);
  });

  it('does not reuse sessions already consumed', () => {
    const result = adaptPlan({ today, workouts: record(1.06), currentAdjustment: 0.5, since: quality[2].date });
    expect(result.vdotAdjustment).toBe(0.5);
  });

  it('eases volume when most recent runs were missed', () => {
    const recent = plan.workouts.filter((w) => w.date < today).slice(-6);
    const workouts = recent.map<WorkoutRecord>((w, i) => ({ ...w, status: i === 0 ? 'completed' : 'planned' }));
    expect(adaptPlan({ today, workouts, currentAdjustment: 0 }).nextWeekVolumeScale).toBe(0.9);
  });

  it('uses per-step laps when available', () => {
    const w = quality[0];
    const steps = expandSteps(w.steps);
    const laps = steps.map((s) => {
      const meters = s.duration.type === 'distance' ? s.duration.meters : 300;
      const pace = (s.pace!.fast + s.pace!.slow) / 2;
      // Work steps 5% fast, everything else very slow — only work steps should count.
      const factor = s.intensity === 'active' ? 1 / 1.05 : 2;
      return { distanceMeters: meters, durationSeconds: (meters / 1000) * pace * factor };
    });
    const perf = sessionPerformance({
      ...w,
      status: 'completed',
      activity: { distanceMeters: 1, durationSeconds: 1, laps },
    });
    expect(perf).toBeCloseTo(1.05, 2);
  });
});

describe('parseDuration', () => {
  it('parses mm:ss and h:mm:ss', () => {
    expect(parseDuration('22:30')).toBe(1350);
    expect(parseDuration('1:45:00')).toBe(6300);
    expect(parseDuration('22:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });
});

describe('low-frequency plans', () => {
  it('keeps two-run weeks close to the runner\'s current volume', () => {
    const p = generatePlan({ ...baseInput, runDays: [1, 6], longRunDay: 6, weeklyKm: 25 });
    const week2 = p.workouts.filter((w) => w.week === 2).reduce((s, w) => s + w.distanceMeters, 0);
    expect(week2).toBeGreaterThan(20_000);
  });
});
