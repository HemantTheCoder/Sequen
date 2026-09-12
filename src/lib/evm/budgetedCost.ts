import type { BudgetedCostAssignment } from "./types";

/**
 * BAC for one task: its duration (working days) times the sum, over every
 * assigned resource, of that resource's allocated daily cost —
 * allocation% x cost/hour x hours worked per day on THAT resource's own
 * calendar. Computed once at baseline creation time and snapshotted into
 * baseline_tasks.budgeted_cost; never recomputed afterward, so a later rate
 * change doesn't retroactively change what was budgeted.
 */
export function computeBudgetedCost(durationDays: number, assignments: BudgetedCostAssignment[]): number {
  const dailyCost = assignments.reduce(
    (sum, a) => sum + (a.allocationPercent / 100) * a.costPerHour * a.hoursPerDay,
    0,
  );
  return durationDays * dailyCost;
}
