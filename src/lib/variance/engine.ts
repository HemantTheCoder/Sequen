import { differenceInCalendarDays } from "date-fns";
import type {
  BaselineTaskInput,
  CurrentTaskInput,
  RemovedScopeTask,
  TaskVariance,
  VarianceResult,
  VarianceStatus,
} from "./types";

function parseDate(d: string | null): Date | null {
  return d ? new Date(d + "T00:00:00") : null;
}

/** current - baseline, in days. Null if either date is missing. */
function dayDiff(current: string | null, baseline: string | null): number | null {
  const c = parseDate(current);
  const b = parseDate(baseline);
  if (!c || !b) return null;
  return differenceInCalendarDays(c, b);
}

/**
 * Compares the live schedule against a baseline snapshot, task by task.
 * Tasks with no baseline counterpart (added since the baseline was taken)
 * get `isNewScope: true` and null variances rather than a misleading
 * "variance" against nothing. Baseline tasks with no current counterpart
 * (deleted since) come back separately as `removedScope`.
 */
export function computeVariance(
  currentTasks: CurrentTaskInput[],
  baselineTasks: BaselineTaskInput[],
): VarianceResult {
  const baselineByTaskId = new Map(baselineTasks.map((b) => [b.taskId, b]));
  const currentIds = new Set(currentTasks.map((t) => t.id));

  const byTaskId = new Map<string, TaskVariance>();
  for (const task of currentTasks) {
    const baseline = baselineByTaskId.get(task.id);
    if (!baseline) {
      byTaskId.set(task.id, {
        taskId: task.id,
        isNewScope: true,
        baselineStartDate: null,
        baselineEndDate: null,
        baselineDurationDays: null,
        startVarianceDays: null,
        finishVarianceDays: null,
        durationVarianceDays: null,
      });
      continue;
    }

    byTaskId.set(task.id, {
      taskId: task.id,
      isNewScope: false,
      baselineStartDate: baseline.startDate,
      baselineEndDate: baseline.endDate,
      baselineDurationDays: baseline.durationDays,
      startVarianceDays: dayDiff(task.startDate, baseline.startDate),
      finishVarianceDays: dayDiff(task.endDate, baseline.endDate),
      durationVarianceDays: task.durationDays - baseline.durationDays,
    });
  }

  const removedScope: RemovedScopeTask[] = baselineTasks
    .filter((b) => !currentIds.has(b.taskId))
    .map((b) => ({
      taskId: b.taskId,
      name: b.name,
      wbsId: b.wbsId,
      baselineStartDate: b.startDate,
      baselineEndDate: b.endDate,
    }));

  return { byTaskId, removedScope };
}

/**
 * Classifies a variance value against a project-configurable threshold.
 * 0 or negative (on time or ahead) is on-track; beyond `thresholdPercent` of
 * the task's own duration is off-track; the range in between is at-risk.
 * A 0-duration milestone has a 0-day threshold, so any slip on it is
 * immediately off-track rather than getting a grace window — intentional,
 * since a milestone either lands on its date or it doesn't.
 */
export function varianceStatus(
  varianceDays: number | null,
  durationDays: number,
  thresholdPercent: number,
): VarianceStatus | null {
  if (varianceDays === null) return null;
  if (varianceDays <= 0) return "on-track";
  const thresholdDays = (durationDays * thresholdPercent) / 100;
  return varianceDays > thresholdDays ? "off-track" : "at-risk";
}
