import "server-only";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { buildWbsTree, type WbsTreeNode } from "@/lib/types";
import { actualCost, earnedValue, evmSummary, plannedValue } from "@/lib/evm/engine";
import { rollupWbsEvm, type WbsEvmRollup } from "@/lib/evm/rollup";
import type { EvmSummary, PlannedValueBaselineTaskInput } from "@/lib/evm/types";

export interface EvmSCurvePoint {
  date: string;
  pv: number;
  /** null once past the status date — there's no per-date history for EV/AC to reconstruct further out. */
  ev: number | null;
  ac: number | null;
}

export interface TaskEvmData {
  /** null when the task has no counterpart in the active baseline. */
  budgetedCost: number | null;
  earnedValue: number | null;
}

export interface ProjectEvmData {
  hasBaseline: boolean;
  baselineName: string | null;
  statusDate: string;
  summary: EvmSummary;
  unbudgetedWork: number;
  wbsRollups: Map<string, WbsEvmRollup>;
  sCurve: EvmSCurvePoint[];
  taskEvm: Map<string, TaskEvmData>;
}

/**
 * Loads everything the EVM dashboard and task-table columns need: PV/EV/AC
 * against the active baseline, the derived ratios, a per-WBS-node rollup,
 * and S-curve sample points. Read-only — the actual math lives in
 * src/lib/evm/, kept pure and unit tested the same way the CPM engine is.
 */
export async function loadProjectEvm(projectId: string): Promise<ProjectEvmData> {
  const supabase = await createClient();

  const [{ data: project }, { data: tasks }, { data: wbsNodes }] = await Promise.all([
    supabase.from("projects").select("status_date").eq("id", projectId).single(),
    supabase.from("tasks").select("*").eq("project_id", projectId),
    supabase.from("wbs_nodes").select("*").eq("project_id", projectId),
  ]);

  const statusDate = project?.status_date ?? format(new Date(), "yyyy-MM-dd");
  const currentTasks = tasks ?? [];
  const ac = actualCost(currentTasks.map((t) => ({ actualCost: Number(t.actual_cost ?? 0) })));
  const acByTaskId = new Map(currentTasks.map((t) => [t.id, Number(t.actual_cost ?? 0)]));

  const { data: activeBaseline } = await supabase
    .from("baselines")
    .select("id, name")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .maybeSingle();

  if (!activeBaseline) {
    return {
      hasBaseline: false,
      baselineName: null,
      statusDate,
      summary: evmSummary(0, 0, ac, 0),
      unbudgetedWork: ac,
      wbsRollups: new Map(),
      sCurve: [],
      taskEvm: new Map(currentTasks.map((t) => [t.id, { budgetedCost: null, earnedValue: null }])),
    };
  }

  const { data: baselineTasks } = await supabase
    .from("baseline_tasks")
    .select("task_id, wbs_id, start_date, end_date, budgeted_cost")
    .eq("baseline_id", activeBaseline.id);
  const bt = baselineTasks ?? [];

  const pvInputs: PlannedValueBaselineTaskInput[] = bt.map((b) => ({
    taskId: b.task_id,
    wbsId: b.wbs_id,
    startDate: b.start_date,
    endDate: b.end_date,
    budgetedCost: Number(b.budgeted_cost),
  }));
  const baselineCosts = bt.map((b) => ({ taskId: b.task_id, budgetedCost: Number(b.budgeted_cost) }));

  const pvResult = plannedValue(pvInputs, statusDate);
  const evResult = earnedValue(
    currentTasks.map((t) => ({
      id: t.id,
      wbsId: t.wbs_id,
      percentComplete: t.percent_complete,
      actualCost: Number(t.actual_cost ?? 0),
    })),
    baselineCosts,
    statusDate,
  );

  const bac = bt.reduce((sum, b) => sum + Number(b.budgeted_cost), 0);
  const summary = evmSummary(pvResult.plannedValue, evResult.earnedValue, ac, bac);
  const bacByTaskId = new Map(bt.map((b) => [b.task_id, Number(b.budgeted_cost)]));

  const tree = buildWbsTree(wbsNodes ?? [], currentTasks);
  const wbsRollups = new Map<string, WbsEvmRollup>();
  function visit(node: WbsTreeNode) {
    wbsRollups.set(node.id, rollupWbsEvm(node, pvResult.byTaskId, evResult.byTaskId, acByTaskId, bacByTaskId));
    for (const child of node.children) visit(child);
  }
  for (const node of tree) visit(node);

  const taskEvm = new Map<string, TaskEvmData>(
    currentTasks.map((t) => [
      t.id,
      { budgetedCost: bacByTaskId.get(t.id) ?? null, earnedValue: evResult.byTaskId.get(t.id) ?? null },
    ]),
  );

  return {
    hasBaseline: true,
    baselineName: activeBaseline.name,
    statusDate,
    summary,
    unbudgetedWork: evResult.unbudgetedWork,
    wbsRollups,
    sCurve: buildSCurve(pvInputs, statusDate, evResult.earnedValue, ac),
    taskEvm,
  };
}

/**
 * Samples PV across the whole baseline timeline — it's derivable at any
 * date, past or future, since it depends only on the fixed baseline
 * schedule — and shows EV/AC as their current totals up through the status
 * date. There's no per-date history for EV or AC to reconstruct further
 * back (no timesheet, no cost-entry timestamps), so a true historical
 * EV/AC curve isn't possible with the data this app tracks; the flat
 * reference lines still let a viewer compare "where the plan says we
 * should be" against "where we actually are" as of now.
 */
function buildSCurve(
  baselineTasks: PlannedValueBaselineTaskInput[],
  statusDate: string,
  currentEv: number,
  currentAc: number,
): EvmSCurvePoint[] {
  const starts = baselineTasks.map((t) => t.startDate).filter((d): d is string => !!d);
  const ends = baselineTasks.map((t) => t.endDate).filter((d): d is string => !!d);
  if (starts.length === 0 || ends.length === 0) return [];

  const minStart = starts.reduce((a, b) => (a < b ? a : b));
  const maxEnd = ends.reduce((a, b) => (a > b ? a : b));
  const start = new Date(minStart + "T00:00:00");
  const end = new Date(maxEnd + "T00:00:00");
  const totalDays = Math.max(1, differenceInCalendarDays(end, start));
  const numPoints = Math.min(30, Math.max(6, Math.ceil(totalDays / 7)));

  const dateSet = new Set<string>();
  for (let i = 0; i <= numPoints; i++) {
    dateSet.add(format(addDays(start, Math.round((totalDays * i) / numPoints)), "yyyy-MM-dd"));
  }
  dateSet.add(statusDate);
  dateSet.add(format(end, "yyyy-MM-dd"));

  return [...dateSet].sort().map((date) => ({
    date,
    pv: plannedValue(baselineTasks, date).plannedValue,
    ev: date <= statusDate ? currentEv : null,
    ac: date <= statusDate ? currentAc : null,
  }));
}
