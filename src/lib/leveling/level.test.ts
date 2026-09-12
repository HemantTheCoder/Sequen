import { describe, expect, it } from "vitest";
import { addWorkingDays, nextWorkingDay, DEFAULT_CALENDAR } from "@/lib/cpm/calendar";
import type { CpmCalendarSet, CpmDependency } from "@/lib/cpm/types";
import { levelResources, type LevelingTaskInput, type ResourceDemand } from "./level";
import type { LevelingResourceInput } from "./conflicts";

// 2026-01-05 is a Monday.
const DATA_DATE = new Date(2026, 0, 5);
const CALENDARS: CpmCalendarSet = { dataDate: DATA_DATE, defaultCalendar: DEFAULT_CALENDAR };
const BASE = nextWorkingDay(DATA_DATE, DEFAULT_CALENDAR);

/** The date `n` working days after the project's own day zero, "yyyy-MM-dd". */
function wd(n: number): string {
  const d = addWorkingDays(BASE, n, DEFAULT_CALENDAR);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function task(overrides: Partial<LevelingTaskInput> & { id: string; duration: number }): LevelingTaskInput {
  return { isManuallyPinned: false, ...overrides };
}

function resource(overrides: Partial<LevelingResourceInput> & { id: string }): LevelingResourceInput {
  return { name: overrides.id, maxCapacityPercent: 100, calendar: DEFAULT_CALENDAR, ...overrides };
}

const NO_DEPS: CpmDependency[] = [];

describe("levelResources", () => {
  it("delays the task with float, not the critical one, and resolves fully within float", () => {
    // B -> C forms the critical chain (duration 2 + 6 = 8 working days), so B
    // is critical (float 0). A runs in parallel with duration 5, giving it
    // exactly 3 days of float (8 - 5). A and B are both assigned the same
    // 100%-capacity resource and both naturally start on day 0, so their
    // first two working days conflict (200%).
    const tasks: LevelingTaskInput[] = [
      task({ id: "A", duration: 5 }),
      task({ id: "B", duration: 2 }),
      task({ id: "C", duration: 6 }),
    ];
    const dependencies: CpmDependency[] = [{ predecessorId: "B", successorId: "C", type: "FS", lagDays: 0 }];
    const resources = [resource({ id: "r1" })];
    const demands: ResourceDemand[] = [
      { taskId: "A", resourceId: "r1", allocationPercent: 100 },
      { taskId: "B", resourceId: "r1", allocationPercent: 100 },
    ];

    const result = levelResources({
      tasks,
      dependencies,
      calendars: CALENDARS,
      resources,
      demands,
      mode: "within_float",
    });

    // B (critical) never moves.
    expect(result.moves.some((m) => m.taskId === "B")).toBe(false);
    expect(result.taskDates.get("B")!.earlyStart).toEqual(addWorkingDays(BASE, 0, DEFAULT_CALENDAR));

    // A (3 days float) is delayed by exactly 2 working days — just enough to
    // clear B's occupied window (offsets 0-1) — well within its 3-day float.
    const moveA = result.moves.find((m) => m.taskId === "A");
    expect(moveA).toBeDefined();
    expect(moveA!.movedByWorkingDays).toBe(2);
    expect(moveA!.originalStartDate).toBe(wd(0));
    expect(moveA!.newStartDate).toBe(wd(2));
    expect(result.taskDates.get("A")!.earlyStart).toEqual(addWorkingDays(BASE, 2, DEFAULT_CALENDAR));

    // Fully resolved — nothing left over capacity.
    expect(result.unresolvedConflicts).toEqual([]);
  });

  it("in within_float mode, refuses to delay past the task's float and reports the remainder unresolved", () => {
    // A (duration 8) and B (duration 5) are both independent (no successors),
    // so A — the longer one — is critical (float 0) and B has exactly 3
    // days of float. Both start day 0 and are fully assigned to the same
    // 100%-capacity resource, so B would need to move a full 8 working days
    // to clear A entirely — far more than its 3-day float allows.
    const tasks: LevelingTaskInput[] = [task({ id: "A", duration: 8 }), task({ id: "B", duration: 5 })];
    const resources = [resource({ id: "r1" })];
    const demands: ResourceDemand[] = [
      { taskId: "A", resourceId: "r1", allocationPercent: 100 },
      { taskId: "B", resourceId: "r1", allocationPercent: 100 },
    ];

    const result = levelResources({
      tasks,
      dependencies: NO_DEPS,
      calendars: CALENDARS,
      resources,
      demands,
      mode: "within_float",
    });

    // A (critical) never moves.
    expect(result.moves.some((m) => m.taskId === "A")).toBe(false);

    // B is pushed exactly to its float ceiling (3 working days) and no further.
    const moveB = result.moves.find((m) => m.taskId === "B");
    expect(moveB).toBeDefined();
    expect(moveB!.movedByWorkingDays).toBe(3);
    expect(moveB!.newStartDate).toBe(wd(3));

    // The project finish date must NOT have been silently pushed out to
    // resolve this — within_float mode reports it unresolved instead.
    expect(result.unresolvedConflicts.length).toBeGreaterThan(0);
    const conflict = result.unresolvedConflicts.find((c) => c.resourceId === "r1");
    expect(conflict).toBeDefined();
    expect(conflict!.ranges.length).toBeGreaterThan(0);
  });

  it("in allow_delay mode, keeps delaying past float until the conflict fully clears, pushing the finish date", () => {
    const tasks: LevelingTaskInput[] = [task({ id: "A", duration: 8 }), task({ id: "B", duration: 5 })];
    const resources = [resource({ id: "r1" })];
    const demands: ResourceDemand[] = [
      { taskId: "A", resourceId: "r1", allocationPercent: 100 },
      { taskId: "B", resourceId: "r1", allocationPercent: 100 },
    ];

    const result = levelResources({
      tasks,
      dependencies: NO_DEPS,
      calendars: CALENDARS,
      resources,
      demands,
      mode: "allow_delay",
    });

    const moveB = result.moves.find((m) => m.taskId === "B");
    expect(moveB).toBeDefined();
    expect(moveB!.movedByWorkingDays).toBe(8); // pushed all the way past A's 8-day window
    expect(result.taskDates.get("B")!.earlyStart).toEqual(addWorkingDays(BASE, 8, DEFAULT_CALENDAR));
    expect(result.unresolvedConflicts).toEqual([]);
  });

  it("never moves a manually pinned task, delaying the other task around it instead", () => {
    const tasks: LevelingTaskInput[] = [
      task({ id: "pinned", duration: 5, isManuallyPinned: true }),
      task({ id: "movable", duration: 5 }),
    ];
    const resources = [resource({ id: "r1" })];
    const demands: ResourceDemand[] = [
      { taskId: "pinned", resourceId: "r1", allocationPercent: 100 },
      { taskId: "movable", resourceId: "r1", allocationPercent: 100 },
    ];

    const result = levelResources({
      tasks,
      dependencies: NO_DEPS,
      calendars: CALENDARS,
      resources,
      demands,
      mode: "allow_delay",
    });

    expect(result.moves.some((m) => m.taskId === "pinned")).toBe(false);
    expect(result.taskDates.get("pinned")!.earlyStart).toEqual(addWorkingDays(BASE, 0, DEFAULT_CALENDAR));

    const moveMovable = result.moves.find((m) => m.taskId === "movable");
    expect(moveMovable).toBeDefined();
    expect(moveMovable!.movedByWorkingDays).toBe(5); // clears the pinned task's 5-day window
    expect(result.unresolvedConflicts).toEqual([]);
  });

  it("reports no moves and no conflicts when nothing is over capacity", () => {
    const tasks: LevelingTaskInput[] = [task({ id: "A", duration: 3 }), task({ id: "B", duration: 3 })];
    const resources = [resource({ id: "r1" })];
    const demands: ResourceDemand[] = [
      { taskId: "A", resourceId: "r1", allocationPercent: 40 },
      { taskId: "B", resourceId: "r1", allocationPercent: 40 },
    ];

    const result = levelResources({
      tasks,
      dependencies: NO_DEPS,
      calendars: CALENDARS,
      resources,
      demands,
      mode: "within_float",
    });

    expect(result.moves).toEqual([]);
    expect(result.unresolvedConflicts).toEqual([]);
  });
});
