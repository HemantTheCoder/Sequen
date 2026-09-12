import "server-only";
import { format } from "date-fns";
import { calculateCPM } from "@/lib/cpm/engine";
import { CpmCycleError, CpmDependency, CpmTask } from "@/lib/cpm/types";
import { createClient } from "@/lib/supabase/server";
import { loadCalendarSet } from "./calendar-lookup";

export interface RecalculateResult {
  ok: boolean;
  error?: string;
  criticalTaskIds?: string[];
}

/**
 * Re-runs CPM for a project and writes the resulting early/late dates,
 * float and criticality back onto each task row. Called after any mutation
 * to durations or dependencies so the schedule stays consistent.
 */
export async function recalculateProjectSchedule(
  projectId: string,
): Promise<RecalculateResult> {
  const supabase = await createClient();

  const [{ data: project, error: projectError }, { data: tasks, error: tasksError }, { data: deps, error: depsError }] =
    await Promise.all([
      supabase.from("projects").select("data_date").eq("id", projectId).single(),
      supabase
        .from("tasks")
        .select("id, duration_days, constraint_start, calendar_id")
        .eq("project_id", projectId),
      supabase
        .from("dependencies")
        .select("predecessor_id, successor_id, type, lag_days")
        .eq("project_id", projectId),
    ]);

  if (projectError) return { ok: false, error: projectError.message };
  if (tasksError) return { ok: false, error: tasksError.message };
  if (depsError) return { ok: false, error: depsError.message };
  if (!project) return { ok: false, error: "Project not found" };

  if (!tasks || tasks.length === 0) return { ok: true, criticalTaskIds: [] };

  const dataDate = new Date(project.data_date + "T00:00:00");
  const toDateString = (date: Date) => format(date, "yyyy-MM-dd");
  const calendars = await loadCalendarSet(projectId, dataDate);

  const cpmTasks: CpmTask[] = tasks.map((t) => ({
    id: t.id,
    duration: Number(t.duration_days),
    minStart: t.constraint_start ? new Date(t.constraint_start + "T00:00:00") : undefined,
    calendarId: t.calendar_id ?? undefined,
  }));
  const cpmDeps: CpmDependency[] = (deps ?? []).map((d) => ({
    predecessorId: d.predecessor_id,
    successorId: d.successor_id,
    type: d.type,
    lagDays: d.lag_days,
  }));

  let result;
  try {
    result = calculateCPM(cpmTasks, cpmDeps, calendars);
  } catch (err) {
    if (err instanceof CpmCycleError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : "CPM calculation failed" };
  }

  const criticalTaskIds: string[] = [];
  const updates = Array.from(result.tasks.values()).map((t) => {
    if (t.isCritical) criticalTaskIds.push(t.id);
    return {
      id: t.id,
      early_start: toDateString(t.earlyStart),
      early_finish: toDateString(t.earlyFinish),
      late_start: toDateString(t.lateStart),
      late_finish: toDateString(t.lateFinish),
      total_float: Math.round(t.totalFloat),
      free_float: Math.round(t.freeFloat),
      is_critical: t.isCritical,
      start_date: toDateString(t.earlyStart),
      end_date: toDateString(t.earlyFinish),
    };
  });

  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from("tasks")
        .update({
          early_start: u.early_start,
          early_finish: u.early_finish,
          late_start: u.late_start,
          late_finish: u.late_finish,
          total_float: u.total_float,
          free_float: u.free_float,
          is_critical: u.is_critical,
          start_date: u.start_date,
          end_date: u.end_date,
        })
        .eq("id", u.id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  return { ok: true, criticalTaskIds };
}
