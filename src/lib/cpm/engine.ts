import { addWorkingDays, nextWorkingDay, previousWorkingDay, workingDaysBetween, type WorkingCalendar } from "./calendar";
import {
  CpmCalendarSet,
  CpmCycleError,
  CpmDependency,
  CpmResult,
  CpmTask,
  CpmTaskResult,
  CpmValidationError,
  DependencyType,
} from "./types";

interface Edge {
  otherId: string;
  type: DependencyType;
  lagDays: number;
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

/**
 * Forward-pass contribution: the earliest date `successor` could start (or,
 * for FF/SF, finish) given this single link from an already-scheduled
 * predecessor. Lag is stepped in working days on the PREDECESSOR's calendar
 * (keeping a uniform single-calendar project exactly additive, as before
 * calendars existed), then the result is snapped onto the SUCCESSOR's own
 * next working day — this is the cross-calendar handoff: a date that's a
 * working day for the predecessor may not be for the successor.
 */
function forwardContribution(
  type: DependencyType,
  predEarlyStart: Date,
  predEarlyFinish: Date,
  predCalendar: WorkingCalendar,
  lagDays: number,
  succCalendar: WorkingCalendar,
): { onStart?: Date; onFinish?: Date } {
  const base = type === "FS" || type === "FF" ? predEarlyFinish : predEarlyStart;
  const withLag = addWorkingDays(base, lagDays, predCalendar);
  const snapped = nextWorkingDay(withLag, succCalendar);
  if (type === "FS" || type === "SS") return { onStart: snapped };
  return { onFinish: snapped };
}

/**
 * Backward-pass mirror of forwardContribution: the latest date `this task`
 * could finish (or start) without delaying `successor`. Lag is stepped on
 * the SUCCESSOR's calendar, then the result snaps backward (the
 * conservative direction for a late date) onto this task's own calendar.
 */
function backwardContribution(
  type: DependencyType,
  succLateStart: Date,
  succLateFinish: Date,
  succCalendar: WorkingCalendar,
  lagDays: number,
  ownCalendar: WorkingCalendar,
): { onStart?: Date; onFinish?: Date } {
  const base = type === "FS" || type === "SS" ? succLateStart : succLateFinish;
  const withLag = addWorkingDays(base, -lagDays, succCalendar);
  const snapped = previousWorkingDay(withLag, ownCalendar);
  if (type === "FS" || type === "FF") return { onFinish: snapped };
  return { onStart: snapped };
}

function topologicalOrder(
  taskIds: string[],
  predecessorsOf: Map<string, Edge[]>,
  successorsOf: Map<string, Edge[]>,
): string[] {
  const inDegree = new Map<string, number>();
  for (const id of taskIds) inDegree.set(id, predecessorsOf.get(id)?.length ?? 0);

  const queue = taskIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of successorsOf.get(id) ?? []) {
      const next = (inDegree.get(edge.otherId) ?? 0) - 1;
      inDegree.set(edge.otherId, next);
      if (next === 0) queue.push(edge.otherId);
    }
  }

  if (order.length !== taskIds.length) {
    const remaining = new Set(taskIds.filter((id) => !order.includes(id)));
    const cyclePath = findCycle(remaining, successorsOf);
    throw new CpmCycleError(cyclePath);
  }

  return order;
}

/** DFS on the un-orderable remainder to surface one concrete cycle for error messages. */
function findCycle(
  remaining: Set<string>,
  successorsOf: Map<string, Edge[]>,
): string[] {
  const visiting = new Set<string>();
  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    stack.push(id);
    visiting.add(id);
    for (const edge of successorsOf.get(id) ?? []) {
      if (!remaining.has(edge.otherId)) continue;
      if (visiting.has(edge.otherId)) {
        const start = stack.indexOf(edge.otherId);
        return [...stack.slice(start), edge.otherId];
      }
      const found = dfs(edge.otherId);
      if (found) return found;
    }
    visiting.delete(id);
    stack.pop();
    return null;
  }

  for (const id of remaining) {
    const found = dfs(id);
    if (found) return found;
  }
  return [...remaining];
}

function calendarFor(task: CpmTask, calendars: CpmCalendarSet): WorkingCalendar {
  if (task.calendarId) {
    const found = calendars.calendarsById?.get(task.calendarId);
    if (found) return found;
  }
  return calendars.defaultCalendar;
}

/**
 * Runs the forward/backward pass over a task network and returns early/late
 * dates, total float, free float and criticality for every task.
 *
 * Every task is scheduled on its own working calendar (falling back to
 * `calendars.defaultCalendar` when unset). Durations and float are in
 * working days on that task's own calendar; dates are real calendar dates,
 * anchored at `calendars.dataDate`. Crossing a dependency edge between two
 * tasks on different calendars snaps the inherited date onto the
 * receiving task's own next (or, for late dates, previous) working day.
 */
export function calculateCPM(
  tasks: CpmTask[],
  dependencies: CpmDependency[],
  calendars: CpmCalendarSet,
): CpmResult {
  const taskIds = tasks.map((t) => t.id);
  const taskIdSet = new Set(taskIds);
  const durationOf = new Map(tasks.map((t) => [t.id, t.duration]));
  const calendarOf = new Map(tasks.map((t) => [t.id, calendarFor(t, calendars)]));
  const minStartOf = new Map(tasks.map((t) => [t.id, t.minStart]));

  const dupIds = taskIds.filter((id, i) => taskIds.indexOf(id) !== i);
  if (dupIds.length > 0) {
    throw new CpmValidationError(`Duplicate task ids: ${dupIds.join(", ")}`);
  }

  for (const dep of dependencies) {
    if (!taskIdSet.has(dep.predecessorId)) {
      throw new CpmValidationError(
        `Dependency references unknown predecessor task: ${dep.predecessorId}`,
      );
    }
    if (!taskIdSet.has(dep.successorId)) {
      throw new CpmValidationError(
        `Dependency references unknown successor task: ${dep.successorId}`,
      );
    }
    if (dep.predecessorId === dep.successorId) {
      throw new CpmValidationError(
        `Task ${dep.predecessorId} cannot depend on itself`,
      );
    }
  }

  const predecessorsOf = new Map<string, Edge[]>();
  const successorsOf = new Map<string, Edge[]>();
  for (const id of taskIds) {
    predecessorsOf.set(id, []);
    successorsOf.set(id, []);
  }
  for (const dep of dependencies) {
    predecessorsOf.get(dep.successorId)!.push({
      otherId: dep.predecessorId,
      type: dep.type,
      lagDays: dep.lagDays,
    });
    successorsOf.get(dep.predecessorId)!.push({
      otherId: dep.successorId,
      type: dep.type,
      lagDays: dep.lagDays,
    });
  }

  const order = topologicalOrder(taskIds, predecessorsOf, successorsOf);

  // Forward pass
  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();
  for (const id of order) {
    const cal = calendarOf.get(id)!;
    const duration = durationOf.get(id)!;
    const preds = predecessorsOf.get(id)!;
    const minStart = minStartOf.get(id);
    let es = nextWorkingDay(minStart ?? calendars.dataDate, cal);
    for (const edge of preds) {
      const predCal = calendarOf.get(edge.otherId)!;
      const predEs = earlyStart.get(edge.otherId)!;
      const predEf = earlyFinish.get(edge.otherId)!;
      const { onStart, onFinish } = forwardContribution(
        edge.type,
        predEs,
        predEf,
        predCal,
        edge.lagDays,
        cal,
      );
      const requiredEs = onStart ?? addWorkingDays(onFinish!, -duration, cal);
      es = maxDate(es, requiredEs);
    }
    earlyStart.set(id, es);
    earlyFinish.set(id, addWorkingDays(es, duration, cal));
  }

  let projectFinish = calendars.dataDate;
  for (const id of order) projectFinish = maxDate(projectFinish, earlyFinish.get(id)!);

  // Backward pass
  const lateStart = new Map<string, Date>();
  const lateFinish = new Map<string, Date>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const cal = calendarOf.get(id)!;
    const duration = durationOf.get(id)!;
    const succs = successorsOf.get(id)!;
    let lf = projectFinish;
    if (succs.length > 0) {
      let candidate: Date | null = null;
      for (const edge of succs) {
        const succCal = calendarOf.get(edge.otherId)!;
        const succLs = lateStart.get(edge.otherId)!;
        const succLf = lateFinish.get(edge.otherId)!;
        const { onStart, onFinish } = backwardContribution(
          edge.type,
          succLs,
          succLf,
          succCal,
          edge.lagDays,
          cal,
        );
        const allowedLf = onFinish ?? addWorkingDays(onStart!, duration, cal);
        candidate = candidate === null ? allowedLf : minDate(candidate, allowedLf);
      }
      lf = candidate!;
    }
    lateFinish.set(id, lf);
    lateStart.set(id, addWorkingDays(lf, -duration, cal));
  }

  // Free float: for each task, the smallest slack contributed to any single
  // successor link, or (for tasks with no successors) its total float.
  const freeFloat = new Map<string, number>();
  for (const id of order) {
    const cal = calendarOf.get(id)!;
    const succs = successorsOf.get(id)!;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    if (succs.length === 0) {
      freeFloat.set(id, workingDaysBetween(ef, lateFinish.get(id)!, cal));
      continue;
    }
    let ff: number | null = null;
    for (const edge of succs) {
      const succCal = calendarOf.get(edge.otherId)!;
      const { onStart, onFinish } = forwardContribution(
        edge.type,
        es,
        ef,
        cal,
        edge.lagDays,
        succCal,
      );
      const succEs = earlyStart.get(edge.otherId)!;
      const succEf = earlyFinish.get(edge.otherId)!;
      const slack =
        onStart !== undefined
          ? workingDaysBetween(onStart, succEs, succCal)
          : workingDaysBetween(onFinish!, succEf, succCal);
      ff = ff === null ? slack : Math.min(ff, slack);
    }
    freeFloat.set(id, ff!);
  }

  const results = new Map<string, CpmTaskResult>();
  for (const id of order) {
    const cal = calendarOf.get(id)!;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;
    const totalFloat = workingDaysBetween(es, ls, cal);
    results.set(id, {
      id,
      duration: durationOf.get(id)!,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      freeFloat: freeFloat.get(id)!,
      isCritical: totalFloat <= 0,
    });
  }

  return { tasks: results, projectFinish };
}
