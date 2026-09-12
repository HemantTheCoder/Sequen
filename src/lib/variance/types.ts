export interface CurrentTaskInput {
  id: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
}

export interface BaselineTaskInput {
  taskId: string;
  name: string;
  wbsId: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
}

export interface TaskVariance {
  taskId: string;
  /** True when this current task has no counterpart in the baseline (added after it was taken). */
  isNewScope: boolean;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  baselineDurationDays: number | null;
  /** current - baseline, in days. Positive = later/longer than planned. Null when isNewScope. */
  startVarianceDays: number | null;
  finishVarianceDays: number | null;
  durationVarianceDays: number | null;
}

/** A task that existed in the baseline but has since been deleted from the live schedule. */
export interface RemovedScopeTask {
  taskId: string;
  name: string;
  wbsId: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
}

export interface VarianceResult {
  byTaskId: Map<string, TaskVariance>;
  removedScope: RemovedScopeTask[];
}

export type VarianceStatus = "on-track" | "at-risk" | "off-track";
