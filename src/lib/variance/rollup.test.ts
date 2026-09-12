import { describe, expect, it } from "vitest";
import { rollupWbsVariance, type TaskDates } from "./rollup";
import { computeVariance } from "./engine";
import { buildWbsTree, type Task, type WbsNode } from "@/lib/types";
import type { BaselineTaskInput, CurrentTaskInput } from "./types";

function makeWbsNode(id: string, parentId: string | null, sortOrder = 0): WbsNode {
  return {
    id,
    project_id: "p1",
    parent_id: parentId,
    name: id,
    sort_order: sortOrder,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeTask(id: string, wbsId: string, sortOrder = 0): Task {
  return {
    id,
    project_id: "p1",
    wbs_id: wbsId,
    name: id,
    duration_days: 1,
    start_date: null,
    end_date: null,
    percent_complete: 0,
    status: "not_started",
    is_milestone: false,
    sort_order: sortOrder,
    early_start: null,
    early_finish: null,
    late_start: null,
    late_finish: null,
    total_float: null,
    free_float: null,
    is_critical: false,
    constraint_start: null,
    external_id: null,
    calendar_id: null,
    is_manually_pinned: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("rollupWbsVariance", () => {
  it("rolls up start variance from the earliest task and finish variance from the latest", () => {
    // Branch: task A (starts earliest, on time) and task B (finishes latest, 3 days late)
    const nodes = [makeWbsNode("wbs1", null)];
    const tasks = [makeTask("a", "wbs1"), makeTask("b", "wbs1")];
    const tree = buildWbsTree(nodes, tasks);

    const current: CurrentTaskInput[] = [
      { id: "a", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
      { id: "b", startDate: "2026-01-05", endDate: "2026-01-13", durationDays: 8 },
    ];
    const baseline: BaselineTaskInput[] = [
      { taskId: "a", name: "a", wbsId: "wbs1", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
      { taskId: "b", name: "b", wbsId: "wbs1", startDate: "2026-01-05", endDate: "2026-01-10", durationDays: 5 },
    ];
    const variance = computeVariance(current, baseline);

    const taskDatesById = new Map<string, TaskDates>(
      current.map((t) => [t.id, { id: t.id, startDate: t.startDate, endDate: t.endDate }]),
    );

    const rollup = rollupWbsVariance(tree[0], taskDatesById, variance.byTaskId);

    expect(rollup).not.toBeNull();
    expect(rollup!.startVarianceDays).toBe(0); // task A, unchanged
    expect(rollup!.finishVarianceDays).toBe(3); // task B, 3 days later than baseline finish
    expect(rollup!.durationVarianceDays).toBe(3); // span grew from 9 days to 12 days
  });

  it("excludes new-scope tasks (no baseline counterpart) from the rollup", () => {
    const nodes = [makeWbsNode("wbs1", null)];
    const tasks = [makeTask("a", "wbs1"), makeTask("new", "wbs1")];
    const tree = buildWbsTree(nodes, tasks);

    const current: CurrentTaskInput[] = [
      { id: "a", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
      // Added after baseline, and would otherwise skew the rollup if included
      { id: "new", startDate: "2026-06-01", endDate: "2026-06-30", durationDays: 29 },
    ];
    const baseline: BaselineTaskInput[] = [
      { taskId: "a", name: "a", wbsId: "wbs1", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
    ];
    const variance = computeVariance(current, baseline);
    const taskDatesById = new Map<string, TaskDates>(
      current.map((t) => [t.id, { id: t.id, startDate: t.startDate, endDate: t.endDate }]),
    );

    const rollup = rollupWbsVariance(tree[0], taskDatesById, variance.byTaskId);

    expect(rollup!.startVarianceDays).toBe(0);
    expect(rollup!.finishVarianceDays).toBe(0);
  });

  it("returns null for a branch with no baseline-tracked tasks", () => {
    const nodes = [makeWbsNode("wbs1", null)];
    const tasks = [makeTask("new", "wbs1")];
    const tree = buildWbsTree(nodes, tasks);

    const current: CurrentTaskInput[] = [
      { id: "new", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
    ];
    const variance = computeVariance(current, []);
    const taskDatesById = new Map<string, TaskDates>(
      current.map((t) => [t.id, { id: t.id, startDate: t.startDate, endDate: t.endDate }]),
    );

    const rollup = rollupWbsVariance(tree[0], taskDatesById, variance.byTaskId);
    expect(rollup).toBeNull();
  });

  it("recurses into child WBS nodes when rolling up a parent branch", () => {
    const nodes = [makeWbsNode("parent", null), makeWbsNode("child", "parent")];
    const tasks = [makeTask("a", "parent"), makeTask("b", "child")];
    const tree = buildWbsTree(nodes, tasks);

    const current: CurrentTaskInput[] = [
      { id: "a", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
      { id: "b", startDate: "2026-01-10", endDate: "2026-01-20", durationDays: 10 },
    ];
    const baseline: BaselineTaskInput[] = [
      { taskId: "a", name: "a", wbsId: "parent", startDate: "2026-01-01", endDate: "2026-01-05", durationDays: 4 },
      { taskId: "b", name: "b", wbsId: "child", startDate: "2026-01-10", endDate: "2026-01-15", durationDays: 5 },
    ];
    const variance = computeVariance(current, baseline);
    const taskDatesById = new Map<string, TaskDates>(
      current.map((t) => [t.id, { id: t.id, startDate: t.startDate, endDate: t.endDate }]),
    );

    const parentRollup = rollupWbsVariance(tree[0], taskDatesById, variance.byTaskId);
    expect(parentRollup!.finishVarianceDays).toBe(5); // driven by child task b, 5 days late
  });
});
