"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadCalendarSet } from "./calendar-lookup";
import { computeBudgetedCost } from "@/lib/evm/budgetedCost";
import { DEFAULT_CALENDAR } from "@/lib/cpm/calendar";

function projectPaths(projectId: string) {
  return [
    `/projects/${projectId}/schedule`,
    `/projects/${projectId}/gantt`,
    `/projects/${projectId}/baselines`,
  ];
}

/**
 * Snapshots every current task in the project into a new baseline —
 * dates, duration, and its predecessor structure, so the baseline remains a
 * true point-in-time record even if tasks are later renamed, rescheduled,
 * rewired, or deleted. The new baseline becomes active; prior baselines are
 * kept, only deactivated.
 */
export async function createBaseline(projectId: string, name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [{ data: project }, { data: tasks, error: tasksError }, { data: dependencies, error: depsError }, { data: assignments }] =
    await Promise.all([
      supabase.from("projects").select("data_date").eq("id", projectId).single(),
      supabase.from("tasks").select("*").eq("project_id", projectId),
      supabase.from("dependencies").select("*").eq("project_id", projectId),
      supabase
        .from("task_resources")
        .select("task_id, allocation_percent, resource:resources!inner(cost_per_hour, calendar_id, project_id)")
        .eq("resource.project_id", projectId),
    ]);
  if (tasksError) throw new Error(tasksError.message);
  if (depsError) throw new Error(depsError.message);
  if (!tasks || tasks.length === 0) {
    throw new Error("This project has no tasks to baseline yet");
  }

  const depsBySuccessor = new Map<string, { predecessor_id: string; type: string; lag_days: number }[]>();
  for (const dep of dependencies ?? []) {
    const list = depsBySuccessor.get(dep.successor_id) ?? [];
    list.push({ predecessor_id: dep.predecessor_id, type: dep.type, lag_days: dep.lag_days });
    depsBySuccessor.set(dep.successor_id, list);
  }

  const dataDate = new Date((project?.data_date ?? new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const calendarSet = await loadCalendarSet(projectId, dataDate);
  const calendarFor = (calendarId: string | null) =>
    (calendarId && calendarSet.calendarsById?.get(calendarId)) || calendarSet.defaultCalendar;

  const assignmentsByTask = new Map<string, { allocationPercent: number; costPerHour: number; hoursPerDay: number }[]>();
  for (const a of assignments ?? []) {
    if (!a.resource || a.resource.cost_per_hour == null) continue;
    const list = assignmentsByTask.get(a.task_id) ?? [];
    list.push({
      allocationPercent: a.allocation_percent,
      costPerHour: Number(a.resource.cost_per_hour),
      hoursPerDay: calendarFor(a.resource.calendar_id).hoursPerDay ?? DEFAULT_CALENDAR.hoursPerDay!,
    });
    assignmentsByTask.set(a.task_id, list);
  }

  await supabase.from("baselines").update({ is_active: false }).eq("project_id", projectId).eq("is_active", true);

  const { data: baseline, error: baselineError } = await supabase
    .from("baselines")
    .insert({ project_id: projectId, name, created_by: user.id, is_active: true })
    .select("id")
    .single();
  if (baselineError) throw new Error(baselineError.message);

  const baselineTasks = tasks.map((t) => ({
    baseline_id: baseline.id,
    task_id: t.id,
    wbs_id: t.wbs_id,
    name: t.name,
    start_date: t.start_date,
    end_date: t.end_date,
    duration_days: t.duration_days,
    predecessor_snapshot: depsBySuccessor.get(t.id) ?? [],
    budgeted_cost: computeBudgetedCost(Number(t.duration_days), assignmentsByTask.get(t.id) ?? []),
  }));

  const { error: snapshotError } = await supabase.from("baseline_tasks").insert(baselineTasks);
  if (snapshotError) throw new Error(snapshotError.message);

  for (const path of projectPaths(projectId)) revalidatePath(path);

  return baseline;
}

export async function setActiveBaseline(projectId: string, baselineId: string) {
  const supabase = await createClient();

  await supabase.from("baselines").update({ is_active: false }).eq("project_id", projectId).eq("is_active", true);
  const { error } = await supabase
    .from("baselines")
    .update({ is_active: true })
    .eq("id", baselineId)
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);

  for (const path of projectPaths(projectId)) revalidatePath(path);
}

export async function updateVarianceThreshold(projectId: string, thresholdPercent: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ variance_threshold_percent: thresholdPercent })
    .eq("id", projectId);
  if (error) throw new Error(error.message);

  for (const path of projectPaths(projectId)) revalidatePath(path);
}
