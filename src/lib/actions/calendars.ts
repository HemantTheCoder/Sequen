"use server";

import { revalidatePath } from "next/cache";
import { eachDayOfInterval, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectSchedule } from "./recalculate";

function calendarPaths(projectId: string) {
  return [
    `/projects/${projectId}/calendars`,
    `/projects/${projectId}/schedule`,
    `/projects/${projectId}/gantt`,
    `/projects/${projectId}/resources`,
  ];
}

async function afterCalendarChange(projectId: string) {
  await recalculateProjectSchedule(projectId);
  for (const path of calendarPaths(projectId)) revalidatePath(path);
}

export async function createCalendar(
  projectId: string,
  name: string,
  workingDays: number[],
  hoursPerDay: number = 8,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendars")
    .insert({ project_id: projectId, name, working_days: workingDays, hours_per_day: hoursPerDay })
    .select()
    .single();
  if (error) throw new Error(error.message);
  for (const path of calendarPaths(projectId)) revalidatePath(path);
  return data;
}

export async function updateCalendar(
  projectId: string,
  id: string,
  updates: { name?: string; working_days?: number[]; hours_per_day?: number },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("calendars").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  await afterCalendarChange(projectId);
}

export async function deleteCalendar(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("calendars").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await afterCalendarChange(projectId);
}

export async function setDefaultCalendar(projectId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("calendars").update({ is_default: false }).eq("project_id", projectId).eq("is_default", true);
  const { error } = await supabase
    .from("calendars")
    .update({ is_default: true })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  await afterCalendarChange(projectId);
}

export async function setCalendarException(
  projectId: string,
  calendarId: string,
  date: string,
  isWorking: boolean,
  note?: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_exceptions")
    .upsert(
      { calendar_id: calendarId, date, is_working: isWorking, note: note ?? null },
      { onConflict: "calendar_id,date" },
    );
  if (error) throw new Error(error.message);
  await afterCalendarChange(projectId);
}

export async function clearCalendarException(projectId: string, calendarId: string, date: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_exceptions")
    .delete()
    .eq("calendar_id", calendarId)
    .eq("date", date);
  if (error) throw new Error(error.message);
  await afterCalendarChange(projectId);
}

/**
 * Applies one override (holiday, or an extra working day) across every date
 * in [startDate, endDate] and every calendar in calendarIds — e.g. blocking
 * off a multi-day holiday like Dec 24-Jan 2, optionally on every calendar in
 * the project at once rather than one calendar and one date at a time.
 */
export async function applyCalendarExceptionRange(
  projectId: string,
  calendarIds: string[],
  startDate: string,
  endDate: string,
  isWorking: boolean,
  note?: string | null,
) {
  if (calendarIds.length === 0) return;
  const supabase = await createClient();
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (end < start) throw new Error("End date must be on or after the start date");

  const dates = eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
  const rows = calendarIds.flatMap((calendarId) =>
    dates.map((date) => ({ calendar_id: calendarId, date, is_working: isWorking, note: note ?? null })),
  );

  const { error } = await supabase
    .from("calendar_exceptions")
    .upsert(rows, { onConflict: "calendar_id,date" });
  if (error) throw new Error(error.message);
  await afterCalendarChange(projectId);
}
