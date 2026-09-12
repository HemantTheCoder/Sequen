import { addDays, differenceInCalendarDays } from "date-fns";
import { CpmDependency, CpmResult, CpmTask } from "./types";

export interface ScheduleTaskInput {
  id: string;
  durationDays: number;
}

export interface ScheduleTaskDates {
  id: string;
  startDate: Date;
  endDate: Date;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
}

/**
 * Wraps calculateCPM to work in calendar dates instead of day offsets, so UI
 * and API code never has to think in day-offset space. `dataDate` is the
 * project's day 0.
 */
export function scheduleWithDates(
  tasks: ScheduleTaskInput[],
  dependencies: CpmDependency[],
  dataDate: Date,
  calculateCPM: (
    tasks: CpmTask[],
    dependencies: CpmDependency[],
  ) => CpmResult,
): Map<string, ScheduleTaskDates> {
  const cpmTasks: CpmTask[] = tasks.map((t) => ({
    id: t.id,
    duration: t.durationDays,
  }));
  const result = calculateCPM(cpmTasks, dependencies);

  const dated = new Map<string, ScheduleTaskDates>();
  for (const [id, task] of result.tasks) {
    dated.set(id, {
      id,
      startDate: addDays(dataDate, task.earlyStart),
      endDate: addDays(dataDate, task.earlyFinish),
      totalFloat: task.totalFloat,
      freeFloat: task.freeFloat,
      isCritical: task.isCritical,
    });
  }
  return dated;
}

/** Whole-day duration between two dates, minimum 1 (a task always spans at least a day). */
export function durationBetween(startDate: Date, endDate: Date): number {
  return Math.max(1, differenceInCalendarDays(endDate, startDate));
}
