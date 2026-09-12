"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectSchedule } from "./recalculate";
import type { DependencyType } from "@/lib/cpm/types";

function schedulePath(projectId: string) {
  return `/projects/${projectId}/schedule`;
}

// ---- WBS nodes ----

export async function createWbsNode(
  projectId: string,
  parentId: string | null,
  name: string,
  sortOrder: number,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wbs_nodes")
    .insert({ project_id: projectId, parent_id: parentId, name, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(schedulePath(projectId));
  return data;
}

export async function renameWbsNode(projectId: string, id: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("wbs_nodes").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(schedulePath(projectId));
}

export async function moveWbsNode(
  projectId: string,
  id: string,
  parentId: string | null,
  sortOrder: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wbs_nodes")
    .update({ parent_id: parentId, sort_order: sortOrder })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(schedulePath(projectId));
}

export async function deleteWbsNode(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("wbs_nodes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await recalculateProjectSchedule(projectId);
  revalidatePath(schedulePath(projectId));
}

// ---- Tasks ----

export async function createTask(
  projectId: string,
  wbsId: string | null,
  name: string,
  sortOrder: number,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      wbs_id: wbsId,
      name,
      sort_order: sortOrder,
      duration_days: 1,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await recalculateProjectSchedule(projectId);
  revalidatePath(schedulePath(projectId));
  return data;
}

export interface TaskUpdateInput {
  name?: string;
  duration_days?: number;
  percent_complete?: number;
  status?: "not_started" | "in_progress" | "complete";
  is_milestone?: boolean;
  wbs_id?: string | null;
  constraint_start?: string | null;
  calendar_id?: string | null;
  is_manually_pinned?: boolean;
  actual_cost?: number | null;
}

export async function updateTask(
  projectId: string,
  id: string,
  updates: TaskUpdateInput,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(updates).eq("id", id);
  if (error) throw new Error(error.message);

  const needsRecalc =
    "duration_days" in updates || "constraint_start" in updates || "calendar_id" in updates;
  if (needsRecalc) await recalculateProjectSchedule(projectId);

  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
}

export async function deleteTask(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await recalculateProjectSchedule(projectId);
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
}

export async function deleteTasks(projectId: string, ids: string[]) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().in("id", ids);
  if (error) throw new Error(error.message);
  await recalculateProjectSchedule(projectId);
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
}

export async function moveTasksToWbs(projectId: string, ids: string[], wbsId: string | null) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ wbs_id: wbsId }).in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
}

// ---- Dependencies ----

export async function createDependency(
  projectId: string,
  predecessorId: string,
  successorId: string,
  type: DependencyType,
  lagDays: number,
) {
  if (predecessorId === successorId) {
    throw new Error("A task cannot depend on itself");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("dependencies").insert({
    project_id: projectId,
    predecessor_id: predecessorId,
    successor_id: successorId,
    type,
    lag_days: lagDays,
  });
  if (error) throw new Error(error.message);

  const result = await recalculateProjectSchedule(projectId);
  if (!result.ok) {
    // Roll back: this dependency likely introduced a cycle.
    await supabase
      .from("dependencies")
      .delete()
      .eq("predecessor_id", predecessorId)
      .eq("successor_id", successorId);
    await recalculateProjectSchedule(projectId);
    throw new Error(result.error ?? "Could not add dependency");
  }

  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
}

export async function deleteDependency(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("dependencies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await recalculateProjectSchedule(projectId);
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
}

export async function recalculate(projectId: string) {
  const result = await recalculateProjectSchedule(projectId);
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}/gantt`);
  return result;
}
