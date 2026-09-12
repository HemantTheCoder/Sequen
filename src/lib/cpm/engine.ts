import {
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

/**
 * Forward-pass contribution: the earliest time `successor` could start (or,
 * for FF/SF, finish) given this single link from an already-scheduled
 * predecessor. Used both to drive ES(successor) and, in reverse, to compute
 * free float per link.
 */
function forwardContribution(
  type: DependencyType,
  predEarlyStart: number,
  predEarlyFinish: number,
  lagDays: number,
): { onStart?: number; onFinish?: number } {
  switch (type) {
    case "FS":
      return { onStart: predEarlyFinish + lagDays };
    case "SS":
      return { onStart: predEarlyStart + lagDays };
    case "FF":
      return { onFinish: predEarlyFinish + lagDays };
    case "SF":
      return { onFinish: predEarlyStart + lagDays };
  }
}

function backwardContribution(
  type: DependencyType,
  succLateStart: number,
  succLateFinish: number,
  lagDays: number,
): { onStart?: number; onFinish?: number } {
  switch (type) {
    case "FS":
      return { onFinish: succLateStart - lagDays };
    case "SS":
      return { onStart: succLateStart - lagDays };
    case "FF":
      return { onFinish: succLateFinish - lagDays };
    case "SF":
      return { onStart: succLateFinish - lagDays };
  }
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

/**
 * Runs the forward/backward pass over a task network and returns early/late
 * dates, total float, free float and criticality for every task.
 *
 * Durations, dates and lags are all in whole days, offset from an implicit
 * project data date of day 0. Callers map day offsets to calendar dates
 * (and back) outside this function so the algorithm stays pure and easy to
 * test.
 */
export function calculateCPM(
  tasks: CpmTask[],
  dependencies: CpmDependency[],
): CpmResult {
  const taskIds = tasks.map((t) => t.id);
  const taskIdSet = new Set(taskIds);
  const durationOf = new Map(tasks.map((t) => [t.id, t.duration]));
  const minStartOf = new Map(tasks.map((t) => [t.id, t.minStart ?? 0]));

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
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of order) {
    const duration = durationOf.get(id)!;
    const preds = predecessorsOf.get(id)!;
    let es = minStartOf.get(id)!;
    for (const edge of preds) {
      const predEs = earlyStart.get(edge.otherId)!;
      const predEf = earlyFinish.get(edge.otherId)!;
      const { onStart, onFinish } = forwardContribution(
        edge.type,
        predEs,
        predEf,
        edge.lagDays,
      );
      const requiredEs = onStart ?? (onFinish ?? 0) - duration;
      es = Math.max(es, requiredEs);
    }
    earlyStart.set(id, es);
    earlyFinish.set(id, es + duration);
  }

  const projectDuration = Math.max(0, ...order.map((id) => earlyFinish.get(id)!));

  // Backward pass
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const duration = durationOf.get(id)!;
    const succs = successorsOf.get(id)!;
    let lf = projectDuration;
    if (succs.length > 0) {
      lf = Infinity;
      for (const edge of succs) {
        const succLs = lateStart.get(edge.otherId)!;
        const succLf = lateFinish.get(edge.otherId)!;
        const { onStart, onFinish } = backwardContribution(
          edge.type,
          succLs,
          succLf,
          edge.lagDays,
        );
        const allowedLf = onFinish ?? (onStart ?? projectDuration) + duration;
        lf = Math.min(lf, allowedLf);
      }
    }
    lateFinish.set(id, lf);
    lateStart.set(id, lf - duration);
  }

  // Free float: for each task, the smallest slack contributed to any single
  // successor link, or (for tasks with no successors) its total float.
  const freeFloat = new Map<string, number>();
  for (const id of order) {
    const succs = successorsOf.get(id)!;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    if (succs.length === 0) {
      freeFloat.set(id, lateFinish.get(id)! - ef);
      continue;
    }
    let ff = Infinity;
    for (const edge of succs) {
      const succEs = earlyStart.get(edge.otherId)!;
      const succEf = earlyFinish.get(edge.otherId)!;
      const { onStart, onFinish } = forwardContribution(
        edge.type,
        es,
        ef,
        edge.lagDays,
      );
      const slack =
        onStart !== undefined ? succEs - onStart : succEf - onFinish!;
      ff = Math.min(ff, slack);
    }
    freeFloat.set(id, ff);
  }

  const results = new Map<string, CpmTaskResult>();
  for (const id of order) {
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;
    const totalFloat = ls - es;
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

  return { tasks: results, projectDuration };
}
