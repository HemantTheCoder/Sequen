import { differenceInCalendarDays } from "date-fns";
import type { WbsTreeNode } from "@/lib/types";
import type { TaskVariance } from "./types";

export interface WbsVarianceRollup {
  wbsId: string;
  startVarianceDays: number | null;
  finishVarianceDays: number | null;
  durationVarianceDays: number | null;
  /** The branch's own current span (max finish - min start), for status-threshold purposes. */
  currentSpanDays: number | null;
}

export interface TaskDates {
  id: string;
  startDate: string | null;
  endDate: string | null;
}

function parseDate(d: string | null): Date | null {
  return d ? new Date(d + "T00:00:00") : null;
}

function dayDiff(a: string | null, b: string | null): number | null {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return differenceInCalendarDays(da, db);
}

function minDate(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => !!d);
  return valid.length === 0 ? null : valid.reduce((a, b) => (a < b ? a : b));
}

function maxDate(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => !!d);
  return valid.length === 0 ? null : valid.reduce((a, b) => (a > b ? a : b));
}

/**
 * Rolls up variance to a WBS node the same way this app already rolls up
 * WBS dates elsewhere (see buildWbsTree's rollup usage): a branch's current
 * span is [min current start, max current finish] across its descendant
 * tasks. Here that same idea is applied twice — once for current dates,
 * once for baseline dates over the same (tracked) task set — and the
 * variance is the difference between those two independently-computed
 * spans. This is deliberately NOT a sum of per-task variances: summing
 * variance across many tasks produces a number with no schedule meaning,
 * the same reason float isn't summed across a WBS branch either.
 *
 * Tasks with no baseline counterpart (new scope) are excluded from the
 * rollup entirely, since they have no variance to contribute. A branch
 * with no baseline-tracked tasks at all returns null.
 */
export function rollupWbsVariance(
  node: WbsTreeNode,
  taskDatesById: Map<string, TaskDates>,
  varianceByTaskId: Map<string, TaskVariance>,
): WbsVarianceRollup | null {
  const tracked = collectTrackedTaskIds(node, varianceByTaskId);
  if (tracked.length === 0) return null;

  const currentStarts: (string | null)[] = [];
  const currentFinishes: (string | null)[] = [];
  const baselineStarts: (string | null)[] = [];
  const baselineFinishes: (string | null)[] = [];

  for (const taskId of tracked) {
    const dates = taskDatesById.get(taskId);
    const variance = varianceByTaskId.get(taskId)!;
    currentStarts.push(dates?.startDate ?? null);
    currentFinishes.push(dates?.endDate ?? null);
    baselineStarts.push(variance.baselineStartDate);
    baselineFinishes.push(variance.baselineEndDate);
  }

  const currentStart = minDate(currentStarts);
  const currentFinish = maxDate(currentFinishes);
  const baselineStart = minDate(baselineStarts);
  const baselineFinish = maxDate(baselineFinishes);

  const startVarianceDays = dayDiff(currentStart, baselineStart);
  const finishVarianceDays = dayDiff(currentFinish, baselineFinish);
  const currentSpan = dayDiff(currentFinish, currentStart);
  const baselineSpan = dayDiff(baselineFinish, baselineStart);
  const durationVarianceDays =
    currentSpan !== null && baselineSpan !== null ? currentSpan - baselineSpan : null;

  return { wbsId: node.id, startVarianceDays, finishVarianceDays, durationVarianceDays, currentSpanDays: currentSpan };
}

function collectTrackedTaskIds(
  node: WbsTreeNode,
  varianceByTaskId: Map<string, TaskVariance>,
): string[] {
  const ids: string[] = [];
  for (const task of node.tasks) {
    const v = varianceByTaskId.get(task.id);
    if (v && !v.isNewScope) ids.push(task.id);
  }
  for (const child of node.children) {
    ids.push(...collectTrackedTaskIds(child, varianceByTaskId));
  }
  return ids;
}
