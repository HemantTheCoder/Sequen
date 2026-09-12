import { describe, expect, it } from "vitest";
import { runRuleBasedRiskChecks, type RiskAssignmentInput, type RiskTaskInput } from "./risk";

function task(overrides: Partial<RiskTaskInput> & { id: string; name: string }): RiskTaskInput {
  return {
    durationDays: 5,
    isMilestone: false,
    earlyStart: "2026-01-01",
    earlyFinish: "2026-01-06",
    hasPredecessors: true,
    hasSuccessors: true,
    ...overrides,
  };
}

describe("runRuleBasedRiskChecks", () => {
  it("flags a non-milestone task with zero duration", () => {
    const flags = runRuleBasedRiskChecks(
      [task({ id: "a", name: "A", durationDays: 0 })],
      [],
    );
    expect(flags.some((f) => f.category === "unrealistic-duration" && f.taskId === "a")).toBe(true);
  });

  it("does not flag a zero-duration milestone", () => {
    const flags = runRuleBasedRiskChecks(
      [task({ id: "a", name: "A", durationDays: 0, isMilestone: true })],
      [],
    );
    expect(flags.some((f) => f.taskId === "a")).toBe(false);
  });

  it("flags an unusually long task", () => {
    const flags = runRuleBasedRiskChecks(
      [task({ id: "a", name: "A", durationDays: 90 })],
      [],
    );
    expect(flags.some((f) => f.category === "unrealistic-duration" && f.taskId === "a")).toBe(true);
  });

  it("flags a fully isolated task (no predecessors, no successors) when other tasks exist", () => {
    const flags = runRuleBasedRiskChecks(
      [
        task({ id: "a", name: "A", hasPredecessors: false, hasSuccessors: false }),
        task({ id: "b", name: "B" }),
      ],
      [],
    );
    expect(flags.some((f) => f.category === "missing-dependency" && f.taskId === "a")).toBe(true);
  });

  it("flags a task with no successors that finishes well before project end", () => {
    const flags = runRuleBasedRiskChecks(
      [
        task({ id: "a", name: "A", hasSuccessors: false, earlyFinish: "2026-01-06" }),
        task({ id: "b", name: "B", earlyFinish: "2026-02-01" }),
      ],
      [],
    );
    expect(flags.some((f) => f.category === "dangling-task" && f.taskId === "a")).toBe(true);
  });

  it("does not flag the last task in the schedule for danging even with no successors", () => {
    const flags = runRuleBasedRiskChecks(
      [
        task({ id: "a", name: "A", hasSuccessors: true, earlyFinish: "2026-01-06" }),
        task({ id: "b", name: "B", hasSuccessors: false, earlyFinish: "2026-02-01" }),
      ],
      [],
    );
    expect(flags.some((f) => f.taskId === "b")).toBe(false);
  });

  it("flags a resource over-allocated beyond 100% in a shared week", () => {
    const assignments: RiskAssignmentInput[] = [
      {
        resourceId: "r1",
        resourceName: "Alice",
        taskId: "a",
        allocationPercent: 70,
        earlyStart: "2026-01-05",
        earlyFinish: "2026-01-09",
      },
      {
        resourceId: "r1",
        resourceName: "Alice",
        taskId: "b",
        allocationPercent: 60,
        earlyStart: "2026-01-06",
        earlyFinish: "2026-01-08",
      },
    ];
    const flags = runRuleBasedRiskChecks([], assignments);
    expect(flags.some((f) => f.category === "over-allocation" && f.resourceId === "r1")).toBe(true);
  });

  it("does not flag a resource within capacity", () => {
    const assignments: RiskAssignmentInput[] = [
      {
        resourceId: "r1",
        resourceName: "Alice",
        taskId: "a",
        allocationPercent: 50,
        earlyStart: "2026-01-05",
        earlyFinish: "2026-01-09",
      },
    ];
    const flags = runRuleBasedRiskChecks([], assignments);
    expect(flags.some((f) => f.category === "over-allocation")).toBe(false);
  });
});
