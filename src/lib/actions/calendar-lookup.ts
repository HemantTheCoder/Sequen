import "server-only";
import type { WorkingCalendar } from "@/lib/cpm/calendar";
import type { CpmCalendarSet } from "@/lib/cpm/types";
import { DEFAULT_CALENDAR } from "@/lib/cpm/calendar";
import { createClient } from "@/lib/supabase/server";

/**
 * Loads every calendar defined for a project (plus its date exceptions) and
 * assembles the CpmCalendarSet the CPM engine needs: a default calendar
 * (the project's is_default calendar, or the implicit Mon-Fri week if none
 * has been created yet) plus a lookup for every other named calendar.
 */
export async function loadCalendarSet(projectId: string, dataDate: Date): Promise<CpmCalendarSet> {
  const supabase = await createClient();
  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, name, working_days, is_default")
    .eq("project_id", projectId);

  if (!calendars || calendars.length === 0) {
    return { dataDate, defaultCalendar: DEFAULT_CALENDAR };
  }

  const { data: exceptions } = await supabase
    .from("calendar_exceptions")
    .select("calendar_id, date, is_working")
    .in("calendar_id", calendars.map((c) => c.id));

  const exceptionsByCalendar = new Map<string, Map<string, boolean>>();
  for (const ex of exceptions ?? []) {
    const map = exceptionsByCalendar.get(ex.calendar_id) ?? new Map<string, boolean>();
    map.set(ex.date, ex.is_working);
    exceptionsByCalendar.set(ex.calendar_id, map);
  }

  const calendarsById = new Map<string, WorkingCalendar>();
  let defaultCalendar: WorkingCalendar | null = null;
  for (const row of calendars) {
    const workingCalendar: WorkingCalendar = {
      id: row.id,
      workingDays: Array.isArray(row.working_days) ? (row.working_days as number[]) : DEFAULT_CALENDAR.workingDays,
      exceptions: exceptionsByCalendar.get(row.id),
    };
    calendarsById.set(row.id, workingCalendar);
    if (row.is_default) defaultCalendar = workingCalendar;
  }

  return { dataDate, defaultCalendar: defaultCalendar ?? DEFAULT_CALENDAR, calendarsById };
}
