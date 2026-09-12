import { describe, expect, it } from "vitest";
import type { Task, WbsNode } from "@/lib/types";
import { buildWbsTree } from "@/lib/types";
import { rollupWbsEvm } from "./rollup";

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
    actual_cost: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("rollupWbsEvm", () => {
  it("sums PV/EV/AC/BAC across every descendant task, including nested children", () => {
    const parent = makeWbsNode("parent", null);
    const child = makeWbsNode("child", "parent");
    const tasks = [makeTask("a", "parent"), makeTask("b", "child")];
    const tree = buildWbsTree([parent, child], tasks);

    const pvByTaskId = new Map([["a", 100], ["b", 200]]);
    const evByTaskId = new Map([["a", 80], ["b", 150]]);
    const acByTaskId = new Map([["a", 90], ["b", 160]]);
    const bacByTaskId = new Map([["a", 500], ["b", 500]]);

    const rollup = rollupWbsEvm(tree[0], pvByTaskId, evByTaskId, acByTaskId, bacByTaskId);

    expect(rollup.wbsId).toBe("parent");
    expect(rollup.pv).toBe(300);
    expect(rollup.ev).toBe(230);
    expect(rollup.ac).toBe(250);
    expect(rollup.bac).toBe(1000);
    expect(rollup.cpi).toBeCloseTo(230 / 250);
    expect(rollup.spi).toBeCloseTo(230 / 300);
  });

  it("guards divide-by-zero for a branch with no cost data yet", () => {
    const node = makeWbsNode("solo", null);
    const tasks = [makeTask("a", "solo")];
    const tree = buildWbsTree([node], tasks);

    const rollup = rollupWbsEvm(tree[0], new Map(), new Map(), new Map(), new Map());
    expect(rollup.pv).toBe(0);
    expect(rollup.cpi).toBeNull();
    expect(rollup.spi).toBeNull();
  });
});
