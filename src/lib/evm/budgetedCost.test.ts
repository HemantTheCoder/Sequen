import { describe, expect, it } from "vitest";
import { computeBudgetedCost } from "./budgetedCost";

describe("computeBudgetedCost", () => {
  it("multiplies duration by one resource's allocated daily cost", () => {
    // 100% allocation, $50/hr, 8 hours/day = $400/day, over 5 days = $2000.
    const cost = computeBudgetedCost(5, [{ allocationPercent: 100, costPerHour: 50, hoursPerDay: 8 }]);
    expect(cost).toBe(2000);
  });

  it("prorates by allocation percent", () => {
    // 50% allocation, $50/hr, 8 hours/day = $200/day, over 5 days = $1000.
    const cost = computeBudgetedCost(5, [{ allocationPercent: 50, costPerHour: 50, hoursPerDay: 8 }]);
    expect(cost).toBe(1000);
  });

  it("sums across multiple assigned resources", () => {
    const cost = computeBudgetedCost(2, [
      { allocationPercent: 100, costPerHour: 50, hoursPerDay: 8 }, // $400/day
      { allocationPercent: 100, costPerHour: 25, hoursPerDay: 6 }, // $150/day
    ]);
    expect(cost).toBe(2 * (400 + 150));
  });

  it("respects a resource's own hours-per-day, not a global default", () => {
    const cost = computeBudgetedCost(1, [{ allocationPercent: 100, costPerHour: 10, hoursPerDay: 12 }]);
    expect(cost).toBe(120);
  });

  it("is zero for a task with no assigned resources", () => {
    expect(computeBudgetedCost(10, [])).toBe(0);
  });

  it("is zero for a zero-duration milestone regardless of assignments", () => {
    const cost = computeBudgetedCost(0, [{ allocationPercent: 100, costPerHour: 50, hoursPerDay: 8 }]);
    expect(cost).toBe(0);
  });
});
