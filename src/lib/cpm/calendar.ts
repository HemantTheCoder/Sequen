import { addDays, format } from "date-fns";

/**
 * A working-day pattern: which weekdays (0=Sun..6=Sat) count as working days,
 * plus specific-date overrides (a holiday on an otherwise-working day, or a
 * catch-up shift on an otherwise-off day).
 */
export interface WorkingCalendar {
  id: string;
  workingDays: number[];
  /** date ("yyyy-MM-dd") -> isWorking, overriding the weekday pattern for that date. */
  exceptions?: Map<string, boolean>;
}

/** The implicit calendar used throughout the app before calendars existed. */
export const DEFAULT_CALENDAR: WorkingCalendar = {
  id: "default",
  workingDays: [1, 2, 3, 4, 5],
};

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isWorkingDay(date: Date, calendar: WorkingCalendar): boolean {
  const override = calendar.exceptions?.get(dateKey(date));
  if (override !== undefined) return override;
  return calendar.workingDays.includes(date.getDay());
}

/** The nearest working day on or after `date` (returns `date` itself if already working). */
export function nextWorkingDay(date: Date, calendar: WorkingCalendar): Date {
  let d = date;
  while (!isWorkingDay(d, calendar)) d = addDays(d, 1);
  return d;
}

/** The nearest working day on or before `date` (returns `date` itself if already working). */
export function previousWorkingDay(date: Date, calendar: WorkingCalendar): Date {
  let d = date;
  while (!isWorkingDay(d, calendar)) d = addDays(d, -1);
  return d;
}

/**
 * Steps `date` forward (or, for a negative count, backward) by `count`
 * working days, each step landing on a working day. `addWorkingDays(d, 0, c)`
 * returns `d` unchanged — it does not snap `d` onto a working day itself,
 * since callers that need a guaranteed-working anchor use nextWorkingDay
 * first.
 */
export function addWorkingDays(date: Date, count: number, calendar: WorkingCalendar): Date {
  let d = date;
  let remaining = Math.abs(count);
  const step = count >= 0 ? 1 : -1;
  while (remaining > 0) {
    d = addDays(d, step);
    if (isWorkingDay(d, calendar)) remaining--;
  }
  return d;
}

/**
 * Counts the working days strictly between `start` and `end` (i.e. the
 * number of working-day steps addWorkingDays would take to get from `start`
 * to `end`). Signed: negative when `end` is before `start`.
 */
export function workingDaysBetween(start: Date, end: Date, calendar: WorkingCalendar): number {
  if (end < start) return -workingDaysBetween(end, start, calendar);
  let d = start;
  let count = 0;
  while (d < end) {
    d = addDays(d, 1);
    if (isWorkingDay(d, calendar)) count++;
  }
  return count;
}
