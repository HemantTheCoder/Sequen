import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadCalendarSet } from "./calendar-lookup";
import {
  detectResourceConflicts,
  type LevelingAssignmentInput,
  type LevelingResourceInput,
  type ResourceConflict,
} from "@/lib/leveling/conflicts";

/**
 * Loads every resource, task and assignment for a project and runs the pure
 * day-level conflict detector against them, resolving each resource's and
 * task's calendar (including holidays) along the way.
 */
export async function loadResourceConflicts(projectId: string): Promise<ResourceConflict[]> {
  const supabase = await createClient();

  const [{ data: project }, { data: resources }, { data: tasks }, { data: assignments }] = await Promise.all([
    supabase.from("projects").select("data_date").eq("id", projectId).single(),
    supabase.from("resources").select("id, name, max_capacity_percent, calendar_id").eq("project_id", projectId),
    supabase
      .from("tasks")
      .select("id, early_start, early_finish")
      .eq("project_id", projectId),
    supabase
      .from("task_resources")
      .select("task_id, resource_id, allocation_percent, task:tasks!inner(project_id)")
      .eq("task.project_id", projectId),
  ]);

  if (!project || !resources || resources.length === 0) return [];

  const dataDate = new Date(project.data_date + "T00:00:00");
  const calendarSet = await loadCalendarSet(projectId, dataDate);
  const calendarFor = (calendarId: string | null) =>
    (calendarId && calendarSet.calendarsById?.get(calendarId)) || calendarSet.defaultCalendar;

  const resourceInputs: LevelingResourceInput[] = resources.map((r) => ({
    id: r.id,
    name: r.name,
    maxCapacityPercent: Number(r.max_capacity_percent),
    calendar: calendarFor(r.calendar_id),
  }));

  const taskById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const levelingAssignments: LevelingAssignmentInput[] = [];
  for (const a of assignments ?? []) {
    const task = taskById.get(a.task_id);
    if (!task || !task.early_start || !task.early_finish) continue;
    levelingAssignments.push({
      taskId: task.id,
      resourceId: a.resource_id,
      allocationPercent: a.allocation_percent,
      startDate: new Date(task.early_start + "T00:00:00"),
      endDate: new Date(task.early_finish + "T00:00:00"),
    });
  }

  return detectResourceConflicts(resourceInputs, levelingAssignments);
}
