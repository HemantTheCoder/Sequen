import { describe, expect, it } from "vitest";
import { computeVariance, varianceStatus } from "./engine";
import type { BaselineTaskInput, CurrentTaskInput } from "./types";

function current(overrides: Partial<CurrentTaskInput> & { id: string }): CurrentTaskInput {
  return {
    startDate: "2026-01-01",
    endDate: "2026-01-06",
    durationDays: 5,
    ...overrides,
  };
}

function baseline(overrides: Partial<BaselineTaskInput> & { taskId: string }): BaselineTaskInput {
  return {
    name: "Task",
    wbsId: null,
    startDate: "2026-01-01",
    endDate: "2026-01-06",
    durationDays: 5,
    ...overrides,
  };
}

describe("computeVariance", () => {
  it("reports zero variance when current matches baseline exactly", () => {
    const result = computeVariance(
      [current({ id: "a" })],
      [baseline({ taskId: "a" })],
    );
    const v = result.byTaskId.get("a")!;
    expect(v.isNewScope).toBe(false);
    expect(v.startVarianceDays).toBe(0);
    expect(v.finishVarianceDays).toBe(0);
    expect(v.durationVarianceDays).toBe(0);
  });

  it("reports positive variance when a task slipped later and got longer", () => {
    const result = computeVariance(
      [current({ id: "a", startDate: "2026-01-03", endDate: "2026-01-10", durationDays: 7 })],
      [baseline({ taskId: "a", startDate: "2026-01-01", endDate: "2026-01-06", durationDays: 5 })],
    );
    const v = result.byTaskId.get("a")!;
    expect(v.startVarianceDays).toBe(2);
    expect(v.finishVarianceDays).toBe(4);
    expect(v.durationVarianceDays).toBe(2);
  });

  it("reports negative variance when a task finished early", () => {
    const result = computeVariance(
      [current({ id: "a", startDate: "2025-12-30", endDate: "2026-01-04", durationDays: 5 })],
      [baseline({ taskId: "a", startDate: "2026-01-01", endDate: "2026-01-06", durationDays: 5 })],
    );
    const v = result.byTaskId.get("a")!;
    expect(v.startVarianceDays).toBe(-2);
    expect(v.finishVarianceDays).toBe(-2);
  });

  it("flags a task added after the baseline as new scope with null variance", () => {
    const result = computeVariance(
      [current({ id: "a" }), current({ id: "new-task" })],
      [baseline({ taskId: "a" })],
    );
    const v = result.byTaskId.get("new-task")!;
    expect(v.isNewScope).toBe(true);
    expect(v.startVarianceDays).toBeNull();
    expect(v.finishVarianceDays).toBeNull();
    expect(v.durationVarianceDays).toBeNull();
    expect(result.byTaskId.get("a")!.isNewScope).toBe(false);
  });

  it("flags a baseline task deleted since as removed scope, not as a current task variance", () => {
    const result = computeVariance(
      [current({ id: "a" })],
      [baseline({ taskId: "a" }), baseline({ taskId: "deleted-task", name: "Old task" })],
    );
    expect(result.byTaskId.has("deleted-task")).toBe(false);
    expect(result.removedScope).toHaveLength(1);
    expect(result.removedScope[0]).toMatchObject({ taskId: "deleted-task", name: "Old task" });
  });

  it("handles a task with no baseline and no current counterpart existing simultaneously", () => {
    const result = computeVariance(
      [current({ id: "kept" }), current({ id: "added" })],
      [baseline({ taskId: "kept" }), baseline({ taskId: "removed", name: "Gone" })],
    );
    expect(result.byTaskId.get("added")!.isNewScope).toBe(true);
    expect(result.removedScope.map((r) => r.taskId)).toEqual(["removed"]);
    expect(result.byTaskId.get("kept")!.isNewScope).toBe(false);
  });

  it("returns null variance when a date is missing on either side", () => {
    const result = computeVariance(
      [current({ id: "a", startDate: null })],
      [baseline({ taskId: "a" })],
    );
    const v = result.byTaskId.get("a")!;
    expect(v.startVarianceDays).toBeNull();
    expect(v.finishVarianceDays).toBe(0);
  });
});

describe("varianceStatus", () => {
  it("is on-track for zero or negative variance", () => {
    expect(varianceStatus(0, 10, 20)).toBe("on-track");
    expect(varianceStatus(-3, 10, 20)).toBe("on-track");
  });

  it("is at-risk within the threshold and off-track beyond it", () => {
    // 20% of a 10-day task = 2 days
    expect(varianceStatus(1, 10, 20)).toBe("at-risk");
    expect(varianceStatus(2, 10, 20)).toBe("at-risk");
    expect(varianceStatus(3, 10, 20)).toBe("off-track");
  });

  it("treats any slip on a zero-duration milestone as off-track", () => {
    expect(varianceStatus(1, 0, 20)).toBe("off-track");
  });

  it("returns null when variance is null (new scope)", () => {
    expect(varianceStatus(null, 10, 20)).toBeNull();
  });

  it("respects a project-specific threshold", () => {
    // 50% of a 10-day task = 5 days
    expect(varianceStatus(4, 10, 50)).toBe("at-risk");
    expect(varianceStatus(6, 10, 50)).toBe("off-track");
  });
});
