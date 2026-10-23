import type {
  Lap,
  PaceZones,
  PlanInput,
  PlanWeek,
  RaceDistance,
  WorkoutItem,
  WorkoutStatus,
  WorkoutType,
} from '@stride/core';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface GarminStatus {
  connected: boolean;
  mode: 'mock' | 'live';
  connectedAt: string | null;
}

export interface MeResponse {
  user: User;
  garmin: GarminStatus;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Activity {
  id: string;
  name: string;
  source: 'garmin' | 'manual';
  startTime: string;
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  avgHeartRate?: number;
  laps?: Lap[];
}

export interface Workout {
  id: string;
  date: string;
  week: number;
  type: WorkoutType;
  title: string;
  description: string;
  steps: WorkoutItem[];
  distanceMeters: number;
  estDurationSeconds: number;
  status: WorkoutStatus;
  garminSynced: boolean;
  activity?: Activity;
}

export interface Plan {
  id: string;
  goal: RaceDistance;
  raceDate: string;
  input: PlanInput;
  weeks: PlanWeek[];
  currentWeek: number;
  vdot: number;
  vdotAdjustment: number;
  predictedRaceSeconds: number;
  paces: PaceZones;
  createdAt: string;
}

export interface PlanEvent {
  message: string;
  createdAt: string;
}

export interface PlanResponse {
  plan: Plan;
  workouts: Workout[];
  events: PlanEvent[];
}

export type NewPlanInput = Omit<PlanInput, 'startDate'>;
