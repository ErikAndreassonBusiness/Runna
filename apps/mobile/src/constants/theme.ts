import type { PaceZone, Phase, WorkoutType } from '@stride/core';
import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    background: '#F6F4F1',
    surface: '#FFFFFF',
    surfaceAlt: '#EFEBE6',
    border: '#E4DED6',
    text: '#14110F',
    textMuted: '#6E665E',
    accent: '#FF5A36',
    accentSoft: '#FFE5DE',
    onAccent: '#FFFFFF',
    success: '#1F9D55',
    danger: '#D93A2B',
  },
  dark: {
    background: '#0F0D0C',
    surface: '#1B1816',
    surfaceAlt: '#26221F',
    border: '#332D29',
    text: '#F6F2EE',
    textMuted: '#A39A91',
    accent: '#FF6A47',
    accentSoft: '#3A2119',
    onAccent: '#FFFFFF',
    success: '#3FCB7E',
    danger: '#FF6B5C',
  },
} as const;

export type Theme = (typeof palette)['light'] | (typeof palette)['dark'];

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const workoutColors: Record<WorkoutType, string> = {
  easy: '#3FB27F',
  recovery: '#4FB3C4',
  long: '#3D7BF7',
  tempo: '#F59E0B',
  intervals: '#EF4444',
  fartlek: '#A855F7',
  race: '#FF5A36',
};

export const workoutLabels: Record<WorkoutType, string> = {
  easy: 'Easy',
  recovery: 'Recovery',
  long: 'Long run',
  tempo: 'Tempo',
  intervals: 'Intervals',
  fartlek: 'Fartlek',
  race: 'Race',
};

export const zoneLabels: Record<PaceZone, string> = {
  recovery: 'Recovery',
  easy: 'Easy',
  long: 'Long run',
  marathon: 'Marathon',
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Repetition',
  race: 'Goal race',
};

export const phaseLabels: Record<Phase, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
};

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
