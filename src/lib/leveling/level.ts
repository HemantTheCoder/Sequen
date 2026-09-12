import { addDays, format } from "date-fns";
import { calculateCPM } from "@/lib/cpm/engine";
import { addWorkingDays, isWorkingDay, workingDaysBetween, type WorkingCalendar } from "@/lib/cpm/calendar";
import type { CpmCalendarSet, CpmDependency, CpmResult, CpmTask } from "@/lib/cpm/types";
import { detectResourceConflicts, type LevelingAssignmentInput, type LevelingResourceInput, type ResourceConflict } from "./conflicts";

export type LevelingMode = "within_float" | "allow_delay";

export interface LevelingTaskInput {
  id: string;
  duration: number;
  calendarId?: string;
  isManuallyPinned: boolean;
  /** An existing SNET constraint (e.g. constraint_start), if any — honored the same way the CPM engine already does. */
  minStart?: Date;
}

/** How much of a resource a task demands — one row per (task, resource) pair. */
export interface ResourceDemand {
  taskId: string;
  resourceId: string;
  allocationPercent: number;
}

export interface LevelResourcesInput {
  tasks: LevelingTaskInput[];
  dependencies: CpmDependency[];
  calendars: CpmCalendarSet;
  resources: LevelingResourceInput[];
  demands: ResourceDemand[];
  mode: LevelingMode;
}

export interface TaskDate {
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  totalFloat: number;
}

export interface TaskMove {
  taskId: string;
  originalStartDate: string;
  newStartDate: string;
  movedByWorkingDays: number;
}

export interface LevelResourcesResult {
  taskDates: Map<string, TaskDate>;
  moves: TaskMove[];
  unresolvedConflicts: ResourceConflict[];
  iterations: number;
  converged: boolean;
}

const MAX_ITERATIONS = 3;
/** Safety cap on how far `allow_delay` mode will push a task forward, to guarantee termination. */
const MAX_DELAY_WORKING_DAYS = 3650;

function calendarFor(calendarId: string | undefined, calendars: CpmCalendarSet): WorkingCalendar {
  if (calendarId) {
    const found = calendars.calendarsById?.get(calendarId);
    if (found) return found;
  }
  return calendars.defaultCalendar;
}

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function toCpmTasks(tasks: LevelingTaskInput[], startOverrides: Map<string, Date>): CpmTask[] {
  return tasks.map((t) => ({
    id: t.id,
    duration: t.duration,
    calendarId: t.calendarId,
    minStart: startOverrides.get(t.id) ?? t.minStart,
  }));
}

/**
 * Priority order for the serial method: manually pinned tasks first (they
 * can't move, so they act as fixed obstacles everyone else routes around),
 * then by early start ascending, then by total float ascending (the least
 * slack is the most critical), then by id for a deterministic tie-break.
 */
function buildPriorityOrder(tasks: LevelingTaskInput[], cpmResult: CpmResult): string[] {
  const pinnedById = new Map(tasks.map((t) => [t.id, t.isManuallyPinned]));
  return [...cpmResult.tasks.values()]
    .sort((a, b) => {
      const aPinned = pinnedById.get(a.id) ? 0 : 1;
      const bPinned = pinnedById.get(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      if (a.earlyStart.getTime() !== b.earlyStart.getTime()) return a.earlyStart.getTime() - b.earlyStart.getTime();
      if (a.totalFloat !== b.totalFloat) return a.totalFloat - b.totalFloat;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((t) => t.id);
}

/** Walks every calendar day (not just working days) in [start, end) so the caller can filter as needed. */
function forEachDayInRange(start: Date, end: Date, fn: (d: Date) => void) {
  for (let d = start; d < end; d = addDays(d, 1)) fn(d);
}

function commitAllocation(
  allocByDate: Map<string, number>,
  resourceCalendar: WorkingCalendar,
  start: Date,
  end: Date,
  allocationPercent: number,
) {
  forEachDayInRange(start, end, (d) => {
    if (!isWorkingDay(d, resourceCalendar)) return;
    const key = dateKey(d);
    allocByDate.set(key, (allocByDate.get(key) ?? 0) + allocationPercent);
  });
}

function checkFits(
  allocByDate: Map<string, number>,
  resourceCalendar: WorkingCalendar,
  maxCapacityPercent: number,
  start: Date,
  end: Date,
  allocationPercent: number,
): boolean {
  let fits = true;
  forEachDayInRange(start, end, (d) => {
    if (!fits) return;
    if (!isWorkingDay(d, resourceCalendar)) return;
    const existing = allocByDate.get(dateKey(d)) ?? 0;
    if (existing + allocationPercent > maxCapacityPercent) fits = false;
  });
  return fits;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Serial-method resource leveler. Pure — never mutates its inputs and never
 * writes anything; it only proposes new start dates for the caller to apply
 * (or discard) after user review, the same review-then-apply pattern used
 * for AI-generated schedule drafts elsewhere in the app.
 *
 * One pass = for each resource, walk its assigned tasks in priority order,
 * delaying any task that would push the resource over capacity to its own
 * next working day and rechecking, until it fits (or, in 'within_float'
 * mode, until doing so would exceed the task's own total float — at which
 * point it stops and the remaining overlap surfaces as an unresolved
 * conflict). After a pass, the CPM forward/backward pass re-runs with the
 * moved tasks' new starts as constraints, which can change float enough to
 * reorder priority — so passes repeat (capped at 3) until the priority
 * order stops changing.
 */
export function levelResources(input: LevelResourcesInput): LevelResourcesResult {
  const { tasks, dependencies, calendars, resources, demands, mode } = input;

  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const demandsByResource = new Map<string, ResourceDemand[]>();
  for (const d of demands) {
    const list = demandsByResource.get(d.resourceId) ?? [];
    list.push(d);
    demandsByResource.set(d.resourceId, list);
  }

  let cpmResult = calculateCPM(toCpmTasks(tasks, new Map()), dependencies, calendars);
  const baselineStarts = new Map(tasks.map((t) => [t.id, cpmResult.tasks.get(t.id)!.earlyStart]));

  let previousPriorityOrder: string[] | null = null;
  let iterations = 0;
  let converged = false;

  for (iterations = 1; iterations <= MAX_ITERATIONS; iterations++) {
    const priorityOrder = buildPriorityOrder(tasks, cpmResult);
    const iterationBaseline = new Map(tasks.map((t) => [t.id, cpmResult.tasks.get(t.id)!.earlyStart]));
    const newStarts = new Map(iterationBaseline);

    const sortedResourceIds = [...resourceById.keys()].sort();
    for (const resourceId of sortedResourceIds) {
      const resource = resourceById.get(resourceId)!;
      const resourceDemands = demandsByResource.get(resourceId) ?? [];
      if (resourceDemands.length === 0) continue;
      const demandByTask = new Map(resourceDemands.map((d) => [d.taskId, d.allocationPercent]));

      const orderedTaskIds = priorityOrder.filter((id) => demandByTask.has(id));
      const allocByDate = new Map<string, number>();

      for (const taskId of orderedTaskIds) {
        const task = taskById.get(taskId)!;
        const taskCalendar = calendarFor(task.calendarId, calendars);
        const allocationPercent = demandByTask.get(taskId)!;
        const cpmTaskResult = cpmResult.tasks.get(taskId)!;
        let start = newStarts.get(taskId)!;
        let end = addWorkingDays(start, task.duration, taskCalendar);

        if (!task.isManuallyPinned) {
          const baseline = iterationBaseline.get(taskId)!;
          let delayWorkingDays = workingDaysBetween(baseline, start, taskCalendar);

          while (!checkFits(allocByDate, resource.calendar, resource.maxCapacityPercent, start, end, allocationPercent)) {
            if (mode === "within_float" && delayWorkingDays >= cpmTaskResult.totalFloat) break;
            if (delayWorkingDays >= MAX_DELAY_WORKING_DAYS) break;
            start = addWorkingDays(start, 1, taskCalendar);
            end = addWorkingDays(start, task.duration, taskCalendar);
            delayWorkingDays = workingDaysBetween(baseline, start, taskCalendar);
          }
        }

        commitAllocation(allocByDate, resource.calendar, start, end, allocationPercent);
        newStarts.set(taskId, start);
      }
    }

    const leveledCpmTasks = toCpmTasks(tasks, newStarts);
    const newCpmResult = calculateCPM(leveledCpmTasks, dependencies, calendars);
    cpmResult = newCpmResult;

    const newPriorityOrder = buildPriorityOrder(tasks, newCpmResult);
    if (previousPriorityOrder && arraysEqual(previousPriorityOrder, newPriorityOrder)) {
      converged = true;
      break;
    }
    previousPriorityOrder = newPriorityOrder;
  }

  const moves: TaskMove[] = [];
  const taskDates = new Map<string, TaskDate>();
  for (const t of tasks) {
    const result = cpmResult.tasks.get(t.id)!;
    taskDates.set(t.id, {
      earlyStart: result.earlyStart,
      earlyFinish: result.earlyFinish,
      lateStart: result.lateStart,
      lateFinish: result.lateFinish,
      totalFloat: result.totalFloat,
    });

    const original = baselineStarts.get(t.id)!;
    const taskCalendar = calendarFor(t.calendarId, calendars);
    const movedByWorkingDays = workingDaysBetween(original, result.earlyStart, taskCalendar);
    if (movedByWorkingDays !== 0) {
      moves.push({
        taskId: t.id,
        originalStartDate: dateKey(original),
        newStartDate: dateKey(result.earlyStart),
        movedByWorkingDays,
      });
    }
  }

  const finalAssignments: LevelingAssignmentInput[] = demands.map((d) => {
    const result = cpmResult.tasks.get(d.taskId)!;
    return {
      taskId: d.taskId,
      resourceId: d.resourceId,
      allocationPercent: d.allocationPercent,
      startDate: result.earlyStart,
      endDate: result.earlyFinish,
    };
  });
  const unresolvedConflicts = detectResourceConflicts(resources, finalAssignments);

  return { taskDates, moves, unresolvedConflicts, iterations, converged };
}
