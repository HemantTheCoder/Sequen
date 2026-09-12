export type DependencyType = "FS" | "SS" | "FF" | "SF";

/** A task as seen by the CPM engine. Durations and floats are in whole days. */
export interface CpmTask {
  id: string;
  duration: number;
  /**
   * Optional "start no earlier than" constraint, as a day offset from the
   * project data date. Acts as an extra lower bound on early start,
   * alongside whatever dependencies require — the same way a P6 SNET
   * constraint interacts with logic-driven dates.
   */
  minStart?: number;
}

export interface CpmDependency {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Lag in days. Negative values represent lead time. */
  lagDays: number;
}

export interface CpmTaskResult {
  id: string;
  duration: number;
  /** Day offsets from the project data date (day 0). */
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
}

export interface CpmResult {
  tasks: Map<string, CpmTaskResult>;
  /** Project duration in days, i.e. the max early finish across all tasks. */
  projectDuration: number;
}

export class CpmCycleError extends Error {
  constructor(public readonly cycleTaskIds: string[]) {
    super(
      `Dependency cycle detected among tasks: ${cycleTaskIds.join(" -> ")}`,
    );
    this.name = "CpmCycleError";
  }
}

export class CpmValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CpmValidationError";
  }
}
