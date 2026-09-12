"use server";

import { revalidatePath } from "next/cache";
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

export async function createCalendar(projectId: string, name: string, workingDays: number[]) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendars")
    .insert({ project_id: projectId, name, working_days: workingDays })
    .select()
    .single();
  if (error) throw new Error(error.message);
  for (const path of calendarPaths(projectId)) revalidatePath(path);
  return data;
}

export async function updateCalendar(
  projectId: string,
  id: string,
  updates: { name?: string; working_days?: number[] },
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
