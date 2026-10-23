import { formatDistance } from './format';
import {
  RACE_LABELS,
  RACE_METERS,
  type Experience,
  type PaceRange,
  type PaceZone,
  type PaceZones,
  type Phase,
  type RaceDistance,
  type StepDuration,
  type StepIntensity,
  type WorkoutItem,
  type WorkoutStep,
  type WorkoutType,
} from './types';

export interface WorkoutTemplate {
  type: WorkoutType;
  title: string;
  description: string;
  steps: WorkoutItem[];
}

export interface SessionContext {
  goal: RaceDistance;
  experience: Experience;
  phase: Phase;
  /** 0 → 1 progress through the current phase. */
  progress: number;
  weekMeters: number;
}

export const distance = (meters: number): StepDuration => ({ type: 'distance', meters });
export const time = (seconds: number): StepDuration => ({ type: 'time', seconds });

export function step(
  intensity: StepIntensity,
  duration: StepDuration,
  zone?: PaceZone,
  note?: string,
): WorkoutStep {
  return { kind: 'step', intensity, duration, zone, note };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const roundTo = (v: number, unit: number) => Math.round(v / unit) * unit;

function warmupMeters(experience: Experience): number {
  return experience === 'beginner' ? 1000 : 2000;
}

/** Fill in each step's pace from its zone. */
export function resolvePaces(items: WorkoutItem[], zones: PaceZones): WorkoutItem[] {
  const resolve = (s: WorkoutStep): WorkoutStep => (s.zone ? { ...s, pace: zones[s.zone] } : s);
  return items.map((item) =>
    item.kind === 'repeat' ? { ...item, steps: item.steps.map(resolve) } : resolve(item),
  );
}

/** Flatten repeat blocks into the sequence of steps the runner actually executes. */
export function expandSteps(items: WorkoutItem[]): WorkoutStep[] {
  return items.flatMap((item) =>
    item.kind === 'repeat' ? Array.from({ length: item.times }, () => item.steps).flat() : [item],
  );
}

const midPace = (p: PaceRange) => (p.fast + p.slow) / 2;

export function workoutMetrics(items: WorkoutItem[]): {
  distanceMeters: number;
  estDurationSeconds: number;
} {
  let meters = 0;
  let seconds = 0;
  for (const s of expandSteps(items)) {
    const pace = s.pace ? midPace(s.pace) : 360;
    if (s.duration.type === 'distance') {
      meters += s.duration.meters;
      seconds += (s.duration.meters / 1000) * pace;
    } else if (s.duration.type === 'time') {
      seconds += s.duration.seconds;
      meters += (s.duration.seconds / pace) * 1000;
    }
  }
  return { distanceMeters: Math.round(meters), estDurationSeconds: Math.round(seconds) };
}

export function easyRun(meters: number): WorkoutTemplate {
  return {
    type: 'easy',
    title: 'Easy Run',
    description:
      'Relaxed, conversational effort. Easy running builds your aerobic engine — resist the urge to speed up.',
    steps: [step('active', distance(meters), 'easy')],
  };
}

export function shakeout(meters: number): WorkoutTemplate {
  return {
    type: 'recovery',
    title: 'Shakeout Run',
    description: 'A short, very easy jog to stay loose before race day.',
    steps: [step('active', distance(meters), 'recovery')],
  };
}

export function longRun(meters: number, goalPaceFinishMeters = 0): WorkoutTemplate {
  if (goalPaceFinishMeters <= 0) {
    return {
      type: 'long',
      title: 'Long Run',
      description:
        'Steady and comfortable. Time on feet builds endurance — fuel and hydrate as you would on race day.',
      steps: [step('active', distance(meters), 'long')],
    };
  }
  return {
    type: 'long',
    title: 'Long Run with Goal Pace Finish',
    description: `Run easy, then finish the last ${formatDistance(goalPaceFinishMeters)} at goal race pace to practise running fast on tired legs.`,
    steps: [
      step('active', distance(meters - goalPaceFinishMeters), 'long'),
      step('active', distance(goalPaceFinishMeters), 'race', 'Goal race pace'),
    ],
  };
}

export function intervals(ctx: SessionContext): WorkoutTemplate {
  const ladder =
    ctx.goal === '5k' || ctx.goal === '10k' ? [400, 600, 800, 1000, 1200] : [800, 1000, 1200, 1600, 2000];
  const rep = ladder[Math.min(ladder.length - 1, Math.floor(ctx.progress * ladder.length))];
  const work = clamp(ctx.weekMeters * lerp(0.08, 0.12, ctx.progress), 2000, 8000);
  const reps = clamp(Math.round(work / rep), 3, 12);
  const recoverySeconds = clamp(roundTo(rep * 0.12, 15), 60, 180);
  const wu = warmupMeters(ctx.experience);
  return {
    type: 'intervals',
    title: `Intervals: ${reps} × ${formatDistance(rep)}`,
    description: `Hard but controlled reps at interval pace with ${recoverySeconds}s easy jog between. Aim to run every rep at the same pace.`,
    steps: [
      step('warmup', distance(wu), 'easy'),
      {
        kind: 'repeat',
        times: reps,
        steps: [
          step('active', distance(rep), 'interval'),
          step('recovery', time(recoverySeconds), 'recovery', 'Easy jog'),
        ],
      },
      step('cooldown', distance(wu), 'easy'),
    ],
  };
}

export function tempo(ctx: SessionContext): WorkoutTemplate {
  const wu = warmupMeters(ctx.experience);
  const minutes = roundTo(clamp((ctx.weekMeters / 1000) * lerp(0.4, 0.55, ctx.progress), 15, 40), 5);

  if (ctx.phase === 'peak' && ctx.goal === 'marathon') {
    const blockKm = ctx.progress < 0.5 ? 3 : 4;
    const blocks = clamp(Math.round(lerp(2, 3, ctx.progress)), 2, 3);
    return {
      type: 'tempo',
      title: `Marathon Pace: ${blocks} × ${blockKm}km`,
      description: 'Lock into marathon pace and practise holding it with 1km easy floats between blocks.',
      steps: [
        step('warmup', distance(wu), 'easy'),
        {
          kind: 'repeat',
          times: blocks,
          steps: [
            step('active', distance(blockKm * 1000), 'marathon'),
            step('recovery', distance(1000), 'easy', 'Easy float'),
          ],
        },
        step('cooldown', distance(wu), 'easy'),
      ],
    };
  }

  if (ctx.phase === 'base') {
    return {
      type: 'tempo',
      title: `Tempo Run: ${minutes} min`,
      description: 'Comfortably hard — you could say a few words, but not hold a conversation.',
      steps: [
        step('warmup', distance(wu), 'easy'),
        step('active', time(minutes * 60), 'threshold'),
        step('cooldown', distance(wu), 'easy'),
      ],
    };
  }

  const blockMinutes = ctx.progress < 0.5 ? 8 : 10;
  const blocks = clamp(Math.round(minutes / blockMinutes), 2, 4);
  return {
    type: 'tempo',
    title: `Threshold: ${blocks} × ${blockMinutes} min`,
    description: 'Cruise intervals at threshold pace with 2 min easy jog recovery. Smooth and controlled.',
    steps: [
      step('warmup', distance(wu), 'easy'),
      {
        kind: 'repeat',
        times: blocks,
        steps: [
          step('active', time(blockMinutes * 60), 'threshold'),
          step('recovery', time(120), 'recovery', 'Easy jog'),
        ],
      },
      step('cooldown', distance(wu), 'easy'),
    ],
  };
}

export function fartlek(ctx: SessionContext): WorkoutTemplate {
  const reps = Math.round(lerp(6, 12, ctx.progress));
  const wu = warmupMeters(ctx.experience);
  return {
    type: 'fartlek',
    title: `Fartlek: ${reps} × 1 min`,
    description: 'Playful speed: 1 minute quick, 1 minute easy. Run the fast bits by feel, around 5K effort.',
    steps: [
      step('warmup', distance(wu), 'easy'),
      {
        kind: 'repeat',
        times: reps,
        steps: [
          step('active', time(60), 'interval'),
          step('recovery', time(60), 'recovery', 'Easy jog'),
        ],
      },
      step('cooldown', distance(wu), 'easy'),
    ],
  };
}

export function sharpener(ctx: SessionContext): WorkoutTemplate {
  const reps = ctx.goal === 'marathon' || ctx.goal === 'half' ? 4 : 5;
  const rep = ctx.goal === 'marathon' || ctx.goal === 'half' ? 1000 : 400;
  const wu = warmupMeters(ctx.experience);
  return {
    type: 'intervals',
    title: `Sharpener: ${reps} × ${formatDistance(rep)}`,
    description: 'A short session at goal race pace to keep your legs sharp while you taper.',
    steps: [
      step('warmup', distance(wu), 'easy'),
      {
        kind: 'repeat',
        times: reps,
        steps: [
          step('active', distance(rep), 'race', 'Goal race pace'),
          step('recovery', time(90), 'recovery', 'Easy jog'),
        ],
      },
      step('cooldown', distance(wu), 'easy'),
    ],
  };
}

export function race(goal: RaceDistance): WorkoutTemplate {
  return {
    type: 'race',
    title: `Race Day: ${RACE_LABELS[goal]}`,
    description: 'This is what you trained for. Start controlled, settle into goal pace, and finish strong.',
    steps: [step('active', distance(RACE_METERS[goal]), 'race', 'Goal race pace')],
  };
}
