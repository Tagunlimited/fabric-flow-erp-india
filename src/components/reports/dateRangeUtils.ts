import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import type { DateRangePreset } from './types';

export function normalizeDayRange(from: Date, to: Date): { from: Date; to: Date } {
  if (from.getTime() > to.getTime()) {
    return { from: startOfDay(to), to: endOfDay(from) };
  }
  return { from: startOfDay(from), to: endOfDay(to) };
}

export function rangeForPreset(preset: DateRangePreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'last7':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'last30':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'this_week':
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'this_month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'this_quarter':
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'this_year':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'custom':
    default:
      return { from: startOfMonth(now), to: endOfDay(now) };
  }
}
