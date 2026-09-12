import { describe, expect, it } from "vitest";
import { calculateCPM } from "./engine";
import { CpmCycleError, CpmDependency, CpmTask, CpmValidationError } from "./types";

function fs(predecessorId: string, successorId: string, lagDays = 0): CpmDependency {
  return { predecessorId, successorId, type: "FS", lagDays };
}

describe("calculateCPM", () => {
  it("computes a simple linear FS chain with zero float throughout", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 3 },
      { id: "B", duration: 5 },
      { id: "C", duration: 2 },
    ];
    const deps = [fs("A", "B"), fs("B", "C")];

    const result = calculateCPM(tasks, deps);

    expect(result.projectDuration).toBe(10);
    expect(result.tasks.get("A")).toMatchObject({
      earlyStart: 0,
      earlyFinish: 3,
      lateStart: 0,
      lateFinish: 3,
      totalFloat: 0,
      isCritical: true,
    });
    expect(result.tasks.get("B")).toMatchObject({
      earlyStart: 3,
      earlyFinish: 8,
      totalFloat: 0,
      isCritical: true,
    });
    expect(result.tasks.get("C")).toMatchObject({
      earlyStart: 8,
      earlyFinish: 10,
      totalFloat: 0,
      isCritical: true,
    });
  });

  it("identifies the critical path among parallel branches and gives float to the slack branch", () => {
    // A -> B -> D (critical, 3+5+2=10)
    // A -> C -> D (slack,   3+2+2=7, so C has float 3)
    const tasks: CpmTask[] = [
      { id: "A", duration: 3 },
      { id: "B", duration: 5 },
      { id: "C", duration: 2 },
      { id: "D", duration: 2 },
    ];
    const deps = [fs("A", "B"), fs("A", "C"), fs("B", "D"), fs("C", "D")];

    const result = calculateCPM(tasks, deps);

    expect(result.projectDuration).toBe(10);
    expect(result.tasks.get("B")!.isCritical).toBe(true);
    expect(result.tasks.get("C")!.isCritical).toBe(false);
    expect(result.tasks.get("C")!.totalFloat).toBe(3);
    expect(result.tasks.get("D")!.isCritical).toBe(true);
  });

  it("applies FS lag", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 2 },
      { id: "B", duration: 2 },
    ];
    const deps = [fs("A", "B", 4)];

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("B")!.earlyStart).toBe(6); // EF(A)=2 + lag 4
    expect(result.tasks.get("B")!.earlyFinish).toBe(8);
  });

  it("handles SS (start-to-start) dependencies", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 5 },
      { id: "B", duration: 3 },
    ];
    const deps: CpmDependency[] = [
      { predecessorId: "A", successorId: "B", type: "SS", lagDays: 2 },
    ];

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("B")!.earlyStart).toBe(2); // ES(A)=0 + lag 2
    expect(result.tasks.get("B")!.earlyFinish).toBe(5);
  });

  it("handles FF (finish-to-finish) dependencies", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 5 },
      { id: "B", duration: 3 },
    ];
    const deps: CpmDependency[] = [
      { predecessorId: "A", successorId: "B", type: "FF", lagDays: 1 },
    ];

    const result = calculateCPM(tasks, deps);

    // EF(B) must be >= EF(A) + 1 = 6, so ES(B) = 6 - 3 = 3
    expect(result.tasks.get("B")!.earlyFinish).toBe(6);
    expect(result.tasks.get("B")!.earlyStart).toBe(3);
  });

  it("handles SF (start-to-finish) dependencies", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 5 },
      { id: "B", duration: 3 },
    ];
    const deps: CpmDependency[] = [
      { predecessorId: "A", successorId: "B", type: "SF", lagDays: 2 },
    ];

    const result = calculateCPM(tasks, deps);

    // EF(B) must be >= ES(A) + 2 = 2, but B's own duration forces EF(B) >= 3
    expect(result.tasks.get("B")!.earlyFinish).toBe(3);
    expect(result.tasks.get("B")!.earlyStart).toBe(0);
  });

  it("computes free float distinctly from total float", () => {
    // A -> B -> D (critical path, 10 days)
    // A -> C -> D (C has 2 days duration but 5 days available before D needs it)
    const tasks: CpmTask[] = [
      { id: "A", duration: 2 },
      { id: "B", duration: 6 },
      { id: "C", duration: 2 },
      { id: "D", duration: 2 },
    ];
    const deps = [fs("A", "B"), fs("A", "C"), fs("B", "D"), fs("C", "D")];

    const result = calculateCPM(tasks, deps);

    // C: ES=2, EF=4. D's ES is driven by B (EF=8), so C could slip until D needs it at ES=8.
    // Free float for C = 8 - 4 = 4, equal to total float here since C has one successor.
    expect(result.tasks.get("C")!.freeFloat).toBe(4);
    expect(result.tasks.get("C")!.totalFloat).toBe(4);
  });

  it("gives a task with no successors free float equal to its total float", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 5 },
      { id: "B", duration: 2 },
    ];
    // B has no successors and finishes well before the (hypothetical) project end
    // driven only by A running in parallel.
    const deps: CpmDependency[] = [];

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("B")!.freeFloat).toBe(result.tasks.get("B")!.totalFloat);
    expect(result.tasks.get("B")!.totalFloat).toBe(3); // slack to match A's 5-day finish
  });

  it("treats zero-duration milestones correctly", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 4 },
      { id: "M", duration: 0 },
    ];
    const deps = [fs("A", "M")];

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("M")!.earlyStart).toBe(4);
    expect(result.tasks.get("M")!.earlyFinish).toBe(4);
    expect(result.tasks.get("M")!.isCritical).toBe(true);
  });

  it("recalculates correctly when a duration changes", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 3 },
      { id: "B", duration: 5 },
    ];
    const deps = [fs("A", "B")];

    const before = calculateCPM(tasks, deps);
    expect(before.projectDuration).toBe(8);

    const after = calculateCPM(
      tasks.map((t) => (t.id === "A" ? { ...t, duration: 10 } : t)),
      deps,
    );
    expect(after.projectDuration).toBe(15);
    expect(after.tasks.get("B")!.earlyStart).toBe(10);
  });

  it("throws CpmCycleError for a direct cycle", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 1 },
      { id: "B", duration: 1 },
    ];
    const deps = [fs("A", "B"), fs("B", "A")];

    expect(() => calculateCPM(tasks, deps)).toThrow(CpmCycleError);
  });

  it("throws CpmCycleError for an indirect (multi-hop) cycle", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 1 },
      { id: "B", duration: 1 },
      { id: "C", duration: 1 },
    ];
    const deps = [fs("A", "B"), fs("B", "C"), fs("C", "A")];

    expect(() => calculateCPM(tasks, deps)).toThrow(CpmCycleError);
  });

  it("throws CpmValidationError for a dependency referencing an unknown task", () => {
    const tasks: CpmTask[] = [{ id: "A", duration: 1 }];
    const deps = [fs("A", "ghost")];

    expect(() => calculateCPM(tasks, deps)).toThrow(CpmValidationError);
  });

  it("throws CpmValidationError for a self-referencing dependency", () => {
    const tasks: CpmTask[] = [{ id: "A", duration: 1 }];
    const deps = [fs("A", "A")];

    expect(() => calculateCPM(tasks, deps)).toThrow(CpmValidationError);
  });

  it("honors a minStart constraint that is later than the dependency-driven date", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 2 },
      { id: "B", duration: 3, minStart: 10 },
    ];
    const deps = [fs("A", "B")]; // would otherwise drive ES(B) to 2

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("B")!.earlyStart).toBe(10);
    expect(result.tasks.get("B")!.earlyFinish).toBe(13);
  });

  it("lets dependency logic override a minStart constraint that is earlier", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 5 },
      { id: "B", duration: 2, minStart: 1 },
    ];
    const deps = [fs("A", "B")]; // requires ES(B) >= 5, later than the constraint

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("B")!.earlyStart).toBe(5);
  });

  it("handles a task with multiple predecessors of different types, taking the binding constraint", () => {
    const tasks: CpmTask[] = [
      { id: "A", duration: 3 },
      { id: "B", duration: 2 },
      { id: "C", duration: 10 },
    ];
    const deps: CpmDependency[] = [
      fs("A", "C"), // requires ES(C) >= 3
      { predecessorId: "B", successorId: "C", type: "SS", lagDays: 5 }, // requires ES(C) >= 0+5=5
    ];

    const result = calculateCPM(tasks, deps);

    expect(result.tasks.get("C")!.earlyStart).toBe(5);
  });
});
