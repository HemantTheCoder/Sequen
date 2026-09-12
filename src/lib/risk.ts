import { format, isSameDay } from "date-fns";
import { detectResourceConflicts, type LevelingAssignmentInput, type LevelingResourceInput } from "./leveling/conflicts";
import type { WorkingCalendar } from "./cpm/calendar";

export interface RiskTaskInput {
  id: string;
  name: string;
  durationDays: number;
  isMilestone: boolean;
  earlyStart: string | null;
  earlyFinish: string | null;
  hasPredecessors: boolean;
  hasSuccessors: boolean;
}

export interface RiskAssignmentInput {
  resourceId: string;
  resourceName: string;
  taskId: string;
  allocationPercent: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  /** Working weekdays (0=Sun..6=Sat) for the resource's own calendar; omit/null to assume Mon-Fri. */
  resourceWorkingDays?: number[] | null;
  /** Working weekdays for the task's calendar; omit/null to assume Mon-Fri. */
  taskWorkingDays?: number[] | null;
  /** Resource capacity as a percent of one full-time person (300 = a 3-person crew); omit/null to assume 100. */
  resourceMaxCapacityPercent?: number | null;
}

export type RiskSeverity = "high" | "medium" | "low";

export interface RiskFlag {
  severity: RiskSeverity;
  category:
    | "over-allocation"
    | "unrealistic-duration"
    | "missing-dependency"
    | "dangling-task"
    | "calendar-conflict";
  message: string;
  taskId?: string;
  resourceId?: string;
}

const MON_FRI = [1, 2, 3, 4, 5];

const LONG_DURATION_DAYS = 60;
const DANGLING_SLACK_DAYS = 3;

/**
 * Rule-based schedule risk checks — no AI involved. Fast enough to run after
 * every schedule mutation; an optional AI pass can layer nuance on top.
 */
export function runRuleBasedRiskChecks(
  tasks: RiskTaskInput[],
  assignments: RiskAssignmentInput[],
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // Unrealistic durations
  for (const t of tasks) {
    if (!t.isMilestone && t.durationDays <= 0) {
      flags.push({
        severity: "medium",
        category: "unrealistic-duration",
        message: `"${t.name}" has a duration of ${t.durationDays} days but isn't marked as a milestone.`,
        taskId: t.id,
      });
    }
    if (t.durationDays > LONG_DURATION_DAYS) {
      flags.push({
        severity: "low",
        category: "unrealistic-duration",
        message: `"${t.name}" runs ${t.durationDays} days — consider breaking it into smaller tasks.`,
        taskId: t.id,
      });
    }
  }

  // Missing / dangling dependencies
  const projectFinish = tasks.reduce<string | null>((max, t) => {
    if (!t.earlyFinish) return max;
    return !max || t.earlyFinish > max ? t.earlyFinish : max;
  }, null);

  for (const t of tasks) {
    if (!t.hasPredecessors && !t.hasSuccessors && tasks.length > 1) {
      flags.push({
        severity: "low",
        category: "missing-dependency",
        message: `"${t.name}" has no predecessors or successors — check whether it should be linked to the rest of the schedule.`,
        taskId: t.id,
      });
      continue;
    }
    if (
      !t.hasSuccessors &&
      !t.isMilestone &&
      projectFinish &&
      t.earlyFinish &&
      daysBetween(t.earlyFinish, projectFinish) > DANGLING_SLACK_DAYS
    ) {
      flags.push({
        severity: "medium",
        category: "dangling-task",
        message: `"${t.name}" finishes well before the project end and has no successors — it may be missing a downstream dependency.`,
        taskId: t.id,
      });
    }
  }

  // Resource over-allocation: day-level conflict detection shared with the
  // resource-leveling feature (src/lib/leveling/conflicts.ts), so there's
  // one source of truth for "who's over capacity when" instead of a
  // separate warning system computing it a second, coarser way.
  const resourceById = new Map<string, LevelingResourceInput>();
  const levelingAssignments: LevelingAssignmentInput[] = [];
  for (const a of assignments) {
    if (!a.earlyStart || !a.earlyFinish) continue;
    if (!resourceById.has(a.resourceId)) {
      const calendar: WorkingCalendar = { id: a.resourceId, workingDays: a.resourceWorkingDays ?? MON_FRI };
      resourceById.set(a.resourceId, {
        id: a.resourceId,
        name: a.resourceName,
        maxCapacityPercent: a.resourceMaxCapacityPercent ?? 100,
        calendar,
      });
    }
    levelingAssignments.push({
      taskId: a.taskId,
      resourceId: a.resourceId,
      allocationPercent: a.allocationPercent,
      startDate: new Date(a.earlyStart + "T00:00:00"),
      endDate: new Date(a.earlyFinish + "T00:00:00"),
    });
  }
  const resourceConflicts = detectResourceConflicts([...resourceById.values()], levelingAssignments);
  for (const conflict of resourceConflicts) {
    for (const range of conflict.ranges) {
      const start = new Date(range.startDate + "T00:00:00");
      const end = new Date(range.endDate + "T00:00:00");
      const dateLabel = isSameDay(start, end)
        ? format(start, "yyyy-MM-dd")
        : `${format(start, "yyyy-MM-dd")} to ${format(end, "yyyy-MM-dd")}`;
      flags.push({
        severity: "high",
        category: "over-allocation",
        message: `${conflict.resourceName} is allocated ${range.peakAllocationPercent}% (capacity ${conflict.maxCapacityPercent}%) around ${dateLabel} — over capacity.`,
        resourceId: conflict.resourceId,
      });
    }
  }

  // Calendar conflicts: a resource whose calendar has fewer working days
  // than the task it's assigned to is a potential availability conflict —
  // the schedule may expect work on a day the resource isn't available.
  const flaggedCalendarPairs = new Set<string>();
  for (const a of assignments) {
    const resourceDays = a.resourceWorkingDays ?? MON_FRI;
    const taskDays = a.taskWorkingDays ?? MON_FRI;
    const missingDays = taskDays.filter((d) => !resourceDays.includes(d));
    if (missingDays.length === 0) continue;
    const pairKey = `${a.resourceId}::${a.taskId}`;
    if (flaggedCalendarPairs.has(pairKey)) continue;
    flaggedCalendarPairs.add(pairKey);
    flags.push({
      severity: "medium",
      category: "calendar-conflict",
      message: `${a.resourceName}'s calendar has ${missingDays.length} fewer working day(s) per week than the task it's assigned to — check availability.`,
      taskId: a.taskId,
      resourceId: a.resourceId,
    });
  }

  return flags;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / msPerDay);
}
