import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/lib/cpm/calendar";
import { detectResourceConflicts, type LevelingAssignmentInput, type LevelingResourceInput } from "./conflicts";

// 2026-01-05 is a Monday.
const MON = new Date(2026, 0, 5);
const WED = new Date(2026, 0, 7);
const THU = new Date(2026, 0, 8);
const FRI = new Date(2026, 0, 9);

function resource(overrides: Partial<LevelingResourceInput> & { id: string }): LevelingResourceInput {
  return {
    name: overrides.id,
    maxCapacityPercent: 100,
    calendar: DEFAULT_CALENDAR,
    ...overrides,
  };
}

describe("detectResourceConflicts", () => {
  it("surfaces one conflict when two tasks need the same 100%-capacity resource on overlapping days", () => {
    const resources = [resource({ id: "r1", name: "Alice" })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "r1", allocationPercent: 100, startDate: MON, endDate: THU }, // Mon,Tue,Wed
      { taskId: "b", resourceId: "r1", allocationPercent: 100, startDate: WED, endDate: FRI }, // Wed,Thu
    ];

    const conflicts = detectResourceConflicts(resources, assignments);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].resourceId).toBe("r1");
    // Only Wednesday overlaps (a spans Mon-Wed, b spans Wed-Thu) — one conflict range, one day.
    expect(conflicts[0].ranges).toHaveLength(1);
    expect(conflicts[0].ranges[0].startDate).toBe("2026-01-07");
    expect(conflicts[0].ranges[0].endDate).toBe("2026-01-07");
    expect(conflicts[0].ranges[0].peakAllocationPercent).toBe(200);
    expect(conflicts[0].ranges[0].taskIds.sort()).toEqual(["a", "b"]);
  });

  it("does not flag two tasks that fit within capacity", () => {
    const resources = [resource({ id: "r1" })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "r1", allocationPercent: 40, startDate: MON, endDate: THU },
      { taskId: "b", resourceId: "r1", allocationPercent: 50, startDate: WED, endDate: FRI },
    ];

    expect(detectResourceConflicts(resources, assignments)).toEqual([]);
  });

  it("does not flag overlap that stays within a multi-person crew's capacity", () => {
    const resources = [resource({ id: "crew", maxCapacityPercent: 300 })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "crew", allocationPercent: 100, startDate: MON, endDate: FRI },
      { taskId: "b", resourceId: "crew", allocationPercent: 100, startDate: MON, endDate: FRI },
      { taskId: "c", resourceId: "crew", allocationPercent: 100, startDate: MON, endDate: FRI },
    ];

    expect(detectResourceConflicts(resources, assignments)).toEqual([]);
  });

  it("flags a crew once its combined allocation exceeds its capacity", () => {
    const resources = [resource({ id: "crew", maxCapacityPercent: 300 })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "crew", allocationPercent: 100, startDate: MON, endDate: FRI },
      { taskId: "b", resourceId: "crew", allocationPercent: 100, startDate: MON, endDate: FRI },
      { taskId: "c", resourceId: "crew", allocationPercent: 100, startDate: MON, endDate: FRI },
      { taskId: "d", resourceId: "crew", allocationPercent: 50, startDate: MON, endDate: FRI },
    ];

    const conflicts = detectResourceConflicts(resources, assignments);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ranges[0].peakAllocationPercent).toBe(350);
  });

  it("merges conflicted days that skip a weekend into a single range", () => {
    // Friday and the following Monday are the resource's next two working
    // days — the weekend between them shouldn't split one ongoing conflict
    // into two separate ranges.
    const resources = [resource({ id: "r1" })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "r1", allocationPercent: 100, startDate: FRI, endDate: new Date(2026, 0, 13) },
      { taskId: "b", resourceId: "r1", allocationPercent: 100, startDate: FRI, endDate: new Date(2026, 0, 13) },
    ];

    const conflicts = detectResourceConflicts(resources, assignments);
    expect(conflicts[0].ranges).toHaveLength(1);
    expect(conflicts[0].ranges[0].startDate).toBe("2026-01-09");
    expect(conflicts[0].ranges[0].endDate).toBe("2026-01-12");
  });

  it("keeps two separate conflicts for two different resources", () => {
    const resources = [resource({ id: "r1" }), resource({ id: "r2" })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "r1", allocationPercent: 60, startDate: MON, endDate: WED },
      { taskId: "b", resourceId: "r1", allocationPercent: 60, startDate: MON, endDate: WED },
      { taskId: "c", resourceId: "r2", allocationPercent: 70, startDate: MON, endDate: WED },
      { taskId: "d", resourceId: "r2", allocationPercent: 70, startDate: MON, endDate: WED },
    ];

    const conflicts = detectResourceConflicts(resources, assignments);
    expect(conflicts.map((c) => c.resourceId).sort()).toEqual(["r1", "r2"]);
  });

  it("ignores resources with no assignments at all", () => {
    const resources = [resource({ id: "r1" }), resource({ id: "idle" })];
    const assignments: LevelingAssignmentInput[] = [
      { taskId: "a", resourceId: "r1", allocationPercent: 60, startDate: MON, endDate: WED },
      { taskId: "b", resourceId: "r1", allocationPercent: 60, startDate: MON, endDate: WED },
    ];

    const conflicts = detectResourceConflicts(resources, assignments);
    expect(conflicts.map((c) => c.resourceId)).toEqual(["r1"]);
  });
});
