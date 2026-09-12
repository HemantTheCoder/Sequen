import type { WorkingCalendar } from "./calendar";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

/** A task as seen by the CPM engine. Durations are in working days, on the task's own calendar. */
export interface CpmTask {
  id: string;
  duration: number;
  /**
   * Optional "start no earlier than" constraint, as an actual date. Acts as
   * an extra lower bound on early start, alongside whatever dependencies
   * require — the same way a P6 SNET constraint interacts with logic-driven
   * dates. Snapped onto this task's own next working day.
   */
  minStart?: Date;
  /** Looked up in the calendar set passed to calculateCPM; falls back to its default calendar if unset or unknown. */
  calendarId?: string;
}

export interface CpmDependency {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /**
   * Lag in working days, measured on the predecessor's calendar before
   * crossing over to the successor (negative values represent lead time).
   * Treating lag as working days — not raw calendar days — keeps a uniform
   * single-calendar project exactly additive, the same as before calendars
   * existed.
   */
  lagDays: number;
}

/** The calendars available to a CPM run: a fallback default, plus any named calendars tasks opt into. */
export interface CpmCalendarSet {
  dataDate: Date;
  defaultCalendar: WorkingCalendar;
  calendarsById?: Map<string, WorkingCalendar>;
}

export interface CpmTaskResult {
  id: string;
  duration: number;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  /** Working days on this task's own calendar. */
  totalFloat: number;
  /** Working days on this task's own calendar. */
  freeFloat: number;
  isCritical: boolean;
}

export interface CpmResult {
  tasks: Map<string, CpmTaskResult>;
  /** The latest early finish across all tasks. */
  projectFinish: Date;
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
