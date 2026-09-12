"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function resourcesPath(projectId: string) {
  return `/projects/${projectId}/resources`;
}

export async function createResource(
  projectId: string,
  name: string,
  role: string | null,
  costPerHour: number | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .insert({ project_id: projectId, name, role, cost_per_hour: costPerHour });
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}

export async function setResourceCalendar(projectId: string, id: string, calendarId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("resources").update({ calendar_id: calendarId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}

export async function setResourceCapacity(projectId: string, id: string, maxCapacityPercent: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .update({ max_capacity_percent: maxCapacityPercent })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}

export async function deleteResource(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}

export async function assignResource(
  projectId: string,
  taskId: string,
  resourceId: string,
  allocationPercent: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_resources")
    .insert({ task_id: taskId, resource_id: resourceId, allocation_percent: allocationPercent });
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}

export async function updateAssignment(
  projectId: string,
  id: string,
  allocationPercent: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_resources")
    .update({ allocation_percent: allocationPercent })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}

export async function deleteAssignment(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("task_resources").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(resourcesPath(projectId));
}
