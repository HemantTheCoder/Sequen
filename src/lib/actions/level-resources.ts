"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectSchedule } from "./recalculate";
import { loadCalendarSet } from "./calendar-lookup";
import { levelResources, type LevelingMode, type LevelingTaskInput, type ResourceDemand } from "@/lib/leveling/level";
import type { LevelingResourceInput, ResourceConflict } from "@/lib/leveling/conflicts";
import type { CpmDependency } from "@/lib/cpm/types";

export interface LevelingPreviewMove {
  taskId: string;
  taskName: string;
  originalStartDate: string;
  newStartDate: string;
  movedByWorkingDays: number;
}

export interface LevelingPreview {
  mode: LevelingMode;
  moves: LevelingPreviewMove[];
  unresolvedConflicts: ResourceConflict[];
  iterations: number;
  converged: boolean;
}

function levelingPaths(projectId: string) {
  return [`/projects/${projectId}/schedule`, `/projects/${projectId}/gantt`, `/projects/${projectId}/resources`];
}

/**
 * Runs the serial-method leveler and returns a proposed result for the user
 * to review — this never writes anything. See applyResourceLeveling for the
 * confirm step, the same review-then-apply pattern used for AI schedule
 * drafts.
 */
export async function previewResourceLeveling(projectId: string, mode: LevelingMode): Promise<LevelingPreview> {
  const supabase = await createClient();

  const [{ data: project }, { data: tasks }, { data: dependencies }, { data: resources }, { data: demandRows }] =
    await Promise.all([
      supabase.from("projects").select("data_date").eq("id", projectId).single(),
      supabase
        .from("tasks")
        .select("id, name, duration_days, calendar_id, is_manually_pinned, constraint_start")
        .eq("project_id", projectId),
      supabase
        .from("dependencies")
        .select("predecessor_id, successor_id, type, lag_days")
        .eq("project_id", projectId),
      supabase.from("resources").select("id, name, max_capacity_percent, calendar_id").eq("project_id", projectId),
      supabase
        .from("task_resources")
        .select("task_id, resource_id, allocation_percent, task:tasks!inner(project_id)")
        .eq("task.project_id", projectId),
    ]);

  if (!project || !tasks || tasks.length === 0) {
    return { mode, moves: [], unresolvedConflicts: [], iterations: 0, converged: true };
  }

  const dataDate = new Date(project.data_date + "T00:00:00");
  const calendarSet = await loadCalendarSet(projectId, dataDate);

  const levelingTasks: LevelingTaskInput[] = tasks.map((t) => ({
    id: t.id,
    duration: Number(t.duration_days),
    calendarId: t.calendar_id ?? undefined,
    isManuallyPinned: t.is_manually_pinned,
    minStart: t.constraint_start ? new Date(t.constraint_start + "T00:00:00") : undefined,
  }));

  const cpmDependencies: CpmDependency[] = (dependencies ?? []).map((d) => ({
    predecessorId: d.predecessor_id,
    successorId: d.successor_id,
    type: d.type,
    lagDays: d.lag_days,
  }));

  const calendarFor = (calendarId: string | null) =>
    (calendarId && calendarSet.calendarsById?.get(calendarId)) || calendarSet.defaultCalendar;
  const levelingResources: LevelingResourceInput[] = (resources ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    maxCapacityPercent: Number(r.max_capacity_percent),
    calendar: calendarFor(r.calendar_id),
  }));

  const demands: ResourceDemand[] = (demandRows ?? []).map((d) => ({
    taskId: d.task_id,
    resourceId: d.resource_id,
    allocationPercent: d.allocation_percent,
  }));

  const result = levelResources({
    tasks: levelingTasks,
    dependencies: cpmDependencies,
    calendars: calendarSet,
    resources: levelingResources,
    demands,
    mode,
  });

  const taskNameById = new Map(tasks.map((t) => [t.id, t.name]));
  const moves: LevelingPreviewMove[] = result.moves.map((m) => ({
    ...m,
    taskName: taskNameById.get(m.taskId) ?? "Untitled task",
  }));

  return {
    mode,
    moves,
    unresolvedConflicts: result.unresolvedConflicts,
    iterations: result.iterations,
    converged: result.converged,
  };
}

/** Persists a reviewed leveling proposal: pins each moved task's new start date, then recalculates the schedule. */
export async function applyResourceLeveling(
  projectId: string,
  moves: { taskId: string; newStartDate: string }[],
) {
  const supabase = await createClient();

  const results = await Promise.all(
    moves.map((m) =>
      supabase.from("tasks").update({ constraint_start: m.newStartDate }).eq("id", m.taskId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const result = await recalculateProjectSchedule(projectId);
  for (const path of levelingPaths(projectId)) revalidatePath(path);
  return result;
}

export async function updateLevelingMode(projectId: string, mode: LevelingMode) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ leveling_mode: mode }).eq("id", projectId);
  if (error) throw new Error(error.message);
  for (const path of levelingPaths(projectId)) revalidatePath(path);
}
