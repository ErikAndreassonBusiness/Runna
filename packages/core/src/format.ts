import type { PaceRange, StepDuration } from './types';

export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatPaceRange(range: PaceRange): string {
  return `${formatPace(range.fast)}–${formatPace(range.slow)} /km`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)}km`;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatStepDuration(d: StepDuration): string {
  if (d.type === 'distance') return formatDistance(d.meters);
  if (d.type === 'time') {
    return d.seconds % 60 === 0 ? `${d.seconds / 60} min` : `${d.seconds}s`;
  }
  return 'Lap button';
}

/** Parse "mm:ss" or "h:mm:ss" into seconds; returns null when invalid. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  const seconds = nums.reduce((acc, n) => acc * 60 + n, 0);
  return seconds > 0 ? seconds : null;
}
