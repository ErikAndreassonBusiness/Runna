import { daysBetween, parseDate, today } from '@stride/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Today", "Tomorrow", or "Tue 14 Jan". */
export function formatDay(date: string, relative = true): string {
  const diff = daysBetween(today(), date);
  if (relative && diff === 0) return 'Today';
  if (relative && diff === 1) return 'Tomorrow';
  if (relative && diff === -1) return 'Yesterday';
  const d = parseDate(date);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatLongDate(date: string): string {
  const d = parseDate(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthLabel(year: number, month: number): string {
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month]} ${year}`;
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`;
}
