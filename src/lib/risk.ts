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
}

export type RiskSeverity = "high" | "medium" | "low";

export interface RiskFlag {
  severity: RiskSeverity;
  category: "over-allocation" | "unrealistic-duration" | "missing-dependency" | "dangling-task";
  message: string;
  taskId?: string;
  resourceId?: string;
}

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

  // Resource over-allocation: bucket by ISO week using each assignment's task dates.
  const byResourceWeek = new Map<string, { resourceName: string; total: number }>();
  for (const a of assignments) {
    if (!a.earlyStart || !a.earlyFinish) continue;
    for (const week of weeksBetween(a.earlyStart, a.earlyFinish)) {
      const key = `${a.resourceId}::${week}`;
      const entry = byResourceWeek.get(key) ?? { resourceName: a.resourceName, total: 0 };
      entry.total += a.allocationPercent;
      byResourceWeek.set(key, entry);
    }
  }
  for (const [key, entry] of byResourceWeek) {
    if (entry.total > 100) {
      const [resourceId, week] = key.split("::");
      flags.push({
        severity: "high",
        category: "over-allocation",
        message: `${entry.resourceName} is allocated ${entry.total}% in the week of ${week} — over capacity.`,
        resourceId,
      });
    }
  }

  return flags;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / msPerDay);
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weeksBetween(start: string, end: string): string[] {
  const weeks: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  cur.setDate(cur.getDate() - cur.getDay()); // snap to week start (Sunday)
  while (cur < endDate) {
    weeks.push(toLocalDateString(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks.length > 0 ? weeks : [start];
}
