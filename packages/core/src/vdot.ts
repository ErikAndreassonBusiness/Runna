import type { Experience, PaceRange, PaceZones } from './types';

/**
 * Jack Daniels' running formula. VDOT is an effective VO2max derived from a race
 * performance; training paces are expressed as fractions of it.
 */

/** Oxygen cost (ml/kg/min) of running at `v` metres per minute. */
function oxygenCost(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max sustainable for a race lasting `minutes`. */
function sustainableFraction(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/** Speed in metres per minute whose oxygen cost equals `vo2`. */
function velocityForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

export function vdotFromRace(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  return oxygenCost(distanceMeters / minutes) / sustainableFraction(minutes);
}

/** Predicted race time for a distance at a given VDOT (bisection on the formula). */
export function predictRaceSeconds(vdot: number, distanceMeters: number): number {
  let lo = (distanceMeters / 1000) * 120; // 2:00/km
  let hi = (distanceMeters / 1000) * 900; // 15:00/km
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // A longer time means a lower VDOT.
    if (vdotFromRace(distanceMeters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Seconds per km when running at `fraction` of VDOT. */
function paceAtFraction(vdot: number, fraction: number): number {
  return 60000 / velocityForVo2(vdot * fraction);
}

function rangeAt(vdot: number, slowFraction: number, fastFraction: number): PaceRange {
  return {
    fast: Math.round(paceAtFraction(vdot, fastFraction)),
    slow: Math.round(paceAtFraction(vdot, slowFraction)),
  };
}

export function paceZones(vdot: number, raceMeters?: number): PaceZones {
  const marathonPace = predictRaceSeconds(vdot, 42195) / 42.195;
  const racePace = raceMeters ? predictRaceSeconds(vdot, raceMeters) / (raceMeters / 1000) : marathonPace;
  return {
    recovery: rangeAt(vdot, 0.58, 0.65),
    easy: rangeAt(vdot, 0.65, 0.74),
    long: rangeAt(vdot, 0.65, 0.72),
    marathon: { fast: Math.round(marathonPace - 4), slow: Math.round(marathonPace + 4) },
    threshold: rangeAt(vdot, 0.86, 0.89),
    interval: rangeAt(vdot, 0.96, 0.99),
    repetition: rangeAt(vdot, 1.03, 1.06),
    race: { fast: Math.round(racePace - 2), slow: Math.round(racePace + 2) },
  };
}

/** Conservative starting fitness when the runner has no recent race. */
export const DEFAULT_VDOT: Record<Experience, number> = {
  beginner: 30,
  intermediate: 40,
  advanced: 50,
};

/** VDOT the runner can realistically gain over a training block. */
export function maxVdotGain(weeks: number, experience: Experience): number {
  const perWeek = experience === 'beginner' ? 0.35 : experience === 'intermediate' ? 0.25 : 0.15;
  return Math.min(weeks * perWeek, experience === 'beginner' ? 6 : 4);
}
