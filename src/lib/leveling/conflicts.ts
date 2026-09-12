import { addDays, format, isSameDay } from "date-fns";
import { addWorkingDays, isWorkingDay, type WorkingCalendar } from "@/lib/cpm/calendar";

export interface LevelingResourceInput {
  id: string;
  name: string;
  maxCapacityPercent: number;
  calendar: WorkingCalendar;
}

export interface LevelingAssignmentInput {
  taskId: string;
  resourceId: string;
  allocationPercent: number;
  /** The task's active window: [startDate, endDate) on its own schedule. */
  startDate: Date;
  endDate: Date;
}

export interface ConflictRange {
  /** "yyyy-MM-dd", inclusive. */
  startDate: string;
  /** "yyyy-MM-dd", inclusive — the last conflicted working day, not exclusive like a task's endDate. */
  endDate: string;
  peakAllocationPercent: number;
  taskIds: string[];
}

export interface ResourceConflict {
  resourceId: string;
  resourceName: string;
  maxCapacityPercent: number;
  ranges: ConflictRange[];
}

interface ConflictDay {
  date: Date;
  totalAllocationPercent: number;
  taskIds: string[];
}

/**
 * Computes per-resource, per-working-day total allocation and flags any day
 * where it exceeds the resource's max capacity. Conflicted days are grouped
 * into contiguous ranges (contiguous meaning no working day of the
 * resource's own calendar falls between them, so a weekend or holiday
 * doesn't split what's really one ongoing conflict).
 *
 * Pure — the caller resolves resource/task calendars and dates from the DB
 * (see src/lib/actions/leveling.ts) and resolves task names for display.
 */
export function detectResourceConflicts(
  resources: LevelingResourceInput[],
  assignments: LevelingAssignmentInput[],
): ResourceConflict[] {
  const assignmentsByResource = new Map<string, LevelingAssignmentInput[]>();
  for (const a of assignments) {
    const list = assignmentsByResource.get(a.resourceId) ?? [];
    list.push(a);
    assignmentsByResource.set(a.resourceId, list);
  }

  const conflicts: ResourceConflict[] = [];
  for (const resource of resources) {
    const resourceAssignments = assignmentsByResource.get(resource.id) ?? [];
    if (resourceAssignments.length === 0) continue;

    const conflictDays = computeConflictDays(resource, resourceAssignments);
    if (conflictDays.length === 0) continue;

    conflicts.push({
      resourceId: resource.id,
      resourceName: resource.name,
      maxCapacityPercent: resource.maxCapacityPercent,
      ranges: groupIntoRanges(conflictDays, resource.calendar),
    });
  }

  return conflicts;
}

function computeConflictDays(
  resource: LevelingResourceInput,
  assignments: LevelingAssignmentInput[],
): ConflictDay[] {
  let spanStart = assignments[0].startDate;
  let spanEnd = assignments[0].endDate;
  for (const a of assignments) {
    if (a.startDate < spanStart) spanStart = a.startDate;
    if (a.endDate > spanEnd) spanEnd = a.endDate;
  }

  const days: ConflictDay[] = [];
  for (let d = spanStart; d < spanEnd; d = addDays(d, 1)) {
    if (!isWorkingDay(d, resource.calendar)) continue;
    const active = assignments.filter((a) => a.startDate <= d && d < a.endDate);
    const total = active.reduce((sum, a) => sum + a.allocationPercent, 0);
    if (total > resource.maxCapacityPercent) {
      days.push({ date: d, totalAllocationPercent: total, taskIds: active.map((a) => a.taskId) });
    }
  }
  return days;
}

function groupIntoRanges(days: ConflictDay[], calendar: WorkingCalendar): ConflictRange[] {
  const ranges: ConflictRange[] = [];
  let current: ConflictDay[] = [];

  function flush() {
    if (current.length === 0) return;
    ranges.push({
      startDate: format(current[0].date, "yyyy-MM-dd"),
      endDate: format(current[current.length - 1].date, "yyyy-MM-dd"),
      peakAllocationPercent: Math.max(...current.map((d) => d.totalAllocationPercent)),
      taskIds: [...new Set(current.flatMap((d) => d.taskIds))],
    });
    current = [];
  }

  for (const day of days) {
    const prev = current[current.length - 1];
    if (prev && !isSameDay(addWorkingDays(prev.date, 1, calendar), day.date)) flush();
    current.push(day);
  }
  flush();

  return ranges;
}
