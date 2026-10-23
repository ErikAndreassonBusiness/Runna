export type RaceDistance = '5k' | '10k' | 'half' | 'marathon';

export const RACE_METERS: Record<RaceDistance, number> = {
  '5k': 5000,
  '10k': 10000,
  half: 21097.5,
  marathon: 42195,
};

export const RACE_LABELS: Record<RaceDistance, string> = {
  '5k': '5K',
  '10k': '10K',
  half: 'Half Marathon',
  marathon: 'Marathon',
};

export type Experience = 'beginner' | 'intermediate' | 'advanced';

export type PaceZone =
  | 'recovery'
  | 'easy'
  | 'long'
  | 'marathon'
  | 'threshold'
  | 'interval'
  | 'repetition'
  | 'race';

/** Pace range in seconds per kilometre. `fast` is the lower number. */
export interface PaceRange {
  fast: number;
  slow: number;
}

export type PaceZones = Record<PaceZone, PaceRange>;

export type StepDuration =
  | { type: 'distance'; meters: number }
  | { type: 'time'; seconds: number }
  | { type: 'open' };

export type StepIntensity = 'warmup' | 'active' | 'recovery' | 'cooldown' | 'rest';

export interface WorkoutStep {
  kind: 'step';
  intensity: StepIntensity;
  duration: StepDuration;
  /** Zone drives the pace; `pace` is the zone resolved for the workout's fitness level. */
  zone?: PaceZone;
  pace?: PaceRange;
  note?: string;
}

export interface RepeatBlock {
  kind: 'repeat';
  times: number;
  steps: WorkoutStep[];
}

export type WorkoutItem = WorkoutStep | RepeatBlock;

export type WorkoutType =
  | 'easy'
  | 'recovery'
  | 'long'
  | 'tempo'
  | 'intervals'
  | 'fartlek'
  | 'race';

export const QUALITY_TYPES: WorkoutType[] = ['tempo', 'intervals', 'fartlek'];

export type Phase = 'base' | 'build' | 'peak' | 'taper';

export interface PlannedWorkout {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  week: number;
  type: WorkoutType;
  title: string;
  description: string;
  steps: WorkoutItem[];
  distanceMeters: number;
  estDurationSeconds: number;
}

export interface PlanWeek {
  week: number;
  phase: Phase;
  startDate: string;
  targetMeters: number;
}

export interface RaceResult {
  distanceMeters: number;
  timeSeconds: number;
}

export interface PlanInput {
  goal: RaceDistance;
  raceDate: string;
  /** First day the runner can train (usually today). */
  startDate: string;
  experience: Experience;
  /** Recent race or time trial. When absent, fitness is estimated from experience. */
  recentRace?: RaceResult;
  /** Optional target finish time for the goal race. */
  goalTimeSeconds?: number;
  /** Current average weekly running volume. */
  weeklyKm: number;
  /** Training days, 0 = Monday … 6 = Sunday. */
  runDays: number[];
  longRunDay: number;
}

export interface GeneratedPlan {
  startVdot: number;
  targetVdot: number;
  predictedRaceSeconds: number;
  weeks: PlanWeek[];
  workouts: PlannedWorkout[];
}
