import { describe, expect, it } from "vitest";
import { actualCost, earnedValue, evmSummary, plannedValue } from "./engine";

describe("plannedValue", () => {
  it("contributes exactly half a task's budgeted cost when it's half-elapsed at the status date", () => {
    // 2026-01-01 to 2026-01-11 is a 10-day baseline span; 2026-01-06 is
    // exactly 5 days (half) into it.
    const result = plannedValue(
      [{ taskId: "a", wbsId: null, startDate: "2026-01-01", endDate: "2026-01-11", budgetedCost: 1000 }],
      "2026-01-06",
    );
    expect(result.byTaskId.get("a")).toBe(500);
    expect(result.plannedValue).toBe(500);
  });

  it("counts the full budgeted cost once the status date is past the task's end", () => {
    const result = plannedValue(
      [{ taskId: "a", wbsId: null, startDate: "2026-01-01", endDate: "2026-01-11", budgetedCost: 1000 }],
      "2026-02-01",
    );
    expect(result.byTaskId.get("a")).toBe(1000);
  });

  it("counts zero for a task entirely after the status date", () => {
    const result = plannedValue(
      [{ taskId: "a", wbsId: null, startDate: "2026-01-01", endDate: "2026-01-11", budgetedCost: 1000 }],
      "2025-12-01",
    );
    expect(result.byTaskId.get("a")).toBe(0);
  });

  it("sums across multiple tasks in different states", () => {
    const result = plannedValue(
      [
        { taskId: "past", wbsId: null, startDate: "2026-01-01", endDate: "2026-01-05", budgetedCost: 400 }, // fully elapsed
        { taskId: "future", wbsId: null, startDate: "2026-02-01", endDate: "2026-02-05", budgetedCost: 400 }, // not started
        { taskId: "half", wbsId: null, startDate: "2026-01-01", endDate: "2026-01-11", budgetedCost: 1000 }, // half elapsed
      ],
      "2026-01-06",
    );
    expect(result.plannedValue).toBe(400 + 0 + 500);
  });

  it("treats a zero-duration milestone as fully counted once its date has passed, zero before", () => {
    const result = plannedValue(
      [{ taskId: "m", wbsId: null, startDate: "2026-01-05", endDate: "2026-01-05", budgetedCost: 200 }],
      "2026-01-06",
    );
    expect(result.byTaskId.get("m")).toBe(200);

    const before = plannedValue(
      [{ taskId: "m", wbsId: null, startDate: "2026-01-05", endDate: "2026-01-05", budgetedCost: 200 }],
      "2026-01-01",
    );
    expect(before.byTaskId.get("m")).toBe(0);
  });

  it("counts zero for a task with no dates in the snapshot", () => {
    const result = plannedValue(
      [{ taskId: "a", wbsId: null, startDate: null, endDate: null, budgetedCost: 1000 }],
      "2026-01-06",
    );
    expect(result.byTaskId.get("a")).toBe(0);
  });
});

describe("earnedValue", () => {
  it("computes EV as percent_complete times the baseline budgeted cost", () => {
    const result = earnedValue(
      [{ id: "a", wbsId: null, percentComplete: 40, actualCost: 0 }],
      [{ taskId: "a", budgetedCost: 1000 }],
      "2026-01-06",
    );
    expect(result.byTaskId.get("a")).toBe(400);
    expect(result.earnedValue).toBe(400);
    expect(result.unbudgetedWork).toBe(0);
  });

  it("excludes a task with no baseline counterpart from EV and reports it as unbudgeted work instead", () => {
    const result = earnedValue(
      [
        { id: "in-baseline", wbsId: null, percentComplete: 50, actualCost: 100 },
        { id: "added-later", wbsId: null, percentComplete: 100, actualCost: 750 },
      ],
      [{ taskId: "in-baseline", budgetedCost: 1000 }],
      "2026-01-06",
    );

    // Only the in-baseline task contributes to EV.
    expect(result.byTaskId.has("added-later")).toBe(false);
    expect(result.earnedValue).toBe(500);

    // The out-of-baseline task's actual cost shows up separately, not merged into EV.
    expect(result.unbudgetedWork).toBe(750);
  });
});

describe("actualCost", () => {
  it("sums actual cost across tasks", () => {
    expect(actualCost([{ actualCost: 100 }, { actualCost: 250 }, { actualCost: 0 }])).toBe(350);
  });

  it("returns 0 for no tasks", () => {
    expect(actualCost([])).toBe(0);
  });
});

describe("evmSummary", () => {
  it("computes the standard EVM ratios and variances", () => {
    const s = evmSummary(1000, 800, 1000, 5000);
    expect(s.cv).toBe(-200);
    expect(s.sv).toBe(-200);
    expect(s.cpi).toBe(0.8);
    expect(s.spi).toBe(0.8);
    expect(s.eac).toBe(6250); // 5000 / 0.8
    expect(s.etc).toBeCloseTo(5250); // 6250 - 1000
  });

  it("guards against divide-by-zero when ac is 0 (nothing spent yet)", () => {
    const s = evmSummary(0, 0, 0, 5000);
    expect(s.cpi).toBeNull();
    expect(s.eac).toBeNull();
    expect(s.etc).toBeNull();
    expect(s.cv).toBe(0);
  });

  it("guards against divide-by-zero when pv is 0 (nothing planned yet as of the status date)", () => {
    const s = evmSummary(0, 0, 100, 5000);
    expect(s.spi).toBeNull();
    // ac is nonzero here, so cpi is still computed (0 / 100 = 0) — and since
    // cpi is exactly 0, eac would be a division by zero too, so it's guarded.
    expect(s.cpi).toBe(0);
    expect(s.eac).toBeNull();
    expect(s.etc).toBeNull();
  });

  it("returns finite numbers, never Infinity or NaN, across the zero-guard cases", () => {
    const s = evmSummary(0, 0, 0, 0);
    for (const v of [s.cpi, s.spi, s.eac, s.etc]) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});
