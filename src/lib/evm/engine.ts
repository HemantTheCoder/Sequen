import { differenceInCalendarDays } from "date-fns";
import type {
  BaselineCostInput,
  EarnedValueTaskInput,
  EvmSummary,
  PlannedValueBaselineTaskInput,
} from "./types";

function parseDate(d: string | null): Date | null {
  return d ? new Date(d + "T00:00:00") : null;
}

export interface PlannedValueResult {
  plannedValue: number;
  byTaskId: Map<string, number>;
}

/**
 * PV as of `statusDate`: a baseline task whose whole [startDate, endDate)
 * span is before the status date contributes its full budgeted cost, one
 * entirely after contributes zero, and one spanning the status date is
 * prorated linearly by the fraction of its baseline span elapsed. A
 * zero-cost or dateless task (e.g. a milestone snapshot with no span)
 * never reaches the proration branch — it's caught by the entirely-before
 * or entirely-after checks first.
 */
export function plannedValue(
  baselineTasks: PlannedValueBaselineTaskInput[],
  statusDate: string,
): PlannedValueResult {
  const status = parseDate(statusDate)!;
  const byTaskId = new Map<string, number>();
  let total = 0;

  for (const t of baselineTasks) {
    const start = parseDate(t.startDate);
    const end = parseDate(t.endDate);
    let pv = 0;

    if (start && end && t.budgetedCost !== 0) {
      if (status >= end) {
        pv = t.budgetedCost;
      } else if (status > start) {
        const totalSpanDays = differenceInCalendarDays(end, start);
        const elapsedDays = differenceInCalendarDays(status, start);
        pv = t.budgetedCost * (elapsedDays / totalSpanDays);
      }
      // status <= start: pv stays 0 (entirely in the future).
    }

    byTaskId.set(t.taskId, pv);
    total += pv;
  }

  return { plannedValue: total, byTaskId };
}

export interface EarnedValueResult {
  earnedValue: number;
  /** Actual cost incurred on tasks with no counterpart in this baseline — surfaced separately, never folded into EV. */
  unbudgetedWork: number;
  byTaskId: Map<string, number>;
}

/**
 * EV against one baseline: percent_complete x that task's baseline BAC, for
 * every task that exists in the baseline. A task added since the baseline
 * was taken has no budgeted_cost to earn against — rather than silently
 * omit it or fold its progress into EV against a budget it was never part
 * of, its actual cost is totalled separately as `unbudgetedWork`.
 *
 * `statusDate` is accepted for signature symmetry with plannedValue (and
 * any future historical tracking) but doesn't affect the result today:
 * percent_complete has no history in this app, so EV always reflects
 * current progress regardless of which status date is being viewed — only
 * PV can be meaningfully reconstructed for a past date, since it's derived
 * purely from the fixed baseline schedule.
 */
export function earnedValue(
  tasks: EarnedValueTaskInput[],
  baselineTasks: BaselineCostInput[],
  statusDate: string,
): EarnedValueResult {
  void statusDate;
  const budgetByTaskId = new Map(baselineTasks.map((b) => [b.taskId, b.budgetedCost]));
  const byTaskId = new Map<string, number>();
  let total = 0;
  let unbudgetedWork = 0;

  for (const t of tasks) {
    const budgetedCost = budgetByTaskId.get(t.id);
    if (budgetedCost === undefined) {
      unbudgetedWork += t.actualCost;
      continue;
    }
    const earned = (t.percentComplete / 100) * budgetedCost;
    byTaskId.set(t.id, earned);
    total += earned;
  }

  return { earnedValue: total, unbudgetedWork, byTaskId };
}

/** Sum of actual_cost across tasks — a live total, not backdated per status date (no timesheet history to prorate from). */
export function actualCost(tasks: { actualCost: number }[]): number {
  return tasks.reduce((sum, t) => sum + t.actualCost, 0);
}

/**
 * Derives the EVM ratios from PV/EV/AC/BAC. ac = 0 (nothing spent yet) or
 * pv = 0 (nothing planned yet as of the status date) would otherwise
 * produce Infinity or NaN — guarded to null so callers/UI can show "—"
 * instead of a crash or a misleading number.
 */
export function evmSummary(pv: number, ev: number, ac: number, bac: number): EvmSummary {
  const cpi = ac === 0 ? null : ev / ac;
  const spi = pv === 0 ? null : ev / pv;
  const eac = cpi === null || cpi === 0 ? null : bac / cpi;
  const etc = eac === null ? null : eac - ac;
  return { pv, ev, ac, bac, cv: ev - ac, sv: ev - pv, cpi, spi, eac, etc };
}
