/** One resource's contribution toward a task's budgeted cost. */
export interface BudgetedCostAssignment {
  allocationPercent: number;
  costPerHour: number;
  /** Hours worked per working day on this resource's own calendar. */
  hoursPerDay: number;
}

export interface PlannedValueBaselineTaskInput {
  taskId: string;
  wbsId: string | null;
  startDate: string | null;
  /** Exclusive, matching the app-wide [startDate, endDate) convention. */
  endDate: string | null;
  budgetedCost: number;
}

export interface EarnedValueTaskInput {
  id: string;
  wbsId: string | null;
  percentComplete: number;
  actualCost: number;
}

/** A task's snapshotted budget from the baseline being measured against. */
export interface BaselineCostInput {
  taskId: string;
  budgetedCost: number;
}

export interface EvmSummary {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  /** Cost variance: ev - ac. Positive = under budget. */
  cv: number;
  /** Schedule variance: ev - pv. Positive = ahead of schedule. */
  sv: number;
  /** Cost performance index: ev / ac. null when ac is 0 (nothing spent yet). */
  cpi: number | null;
  /** Schedule performance index: ev / pv. null when pv is 0 (nothing planned yet). */
  spi: number | null;
  /** Estimate at completion: bac / cpi. null when cpi is null or 0. */
  eac: number | null;
  /** Estimate to complete: eac - ac. null when eac is null. */
  etc: number | null;
}
