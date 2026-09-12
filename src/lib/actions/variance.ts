import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildWbsTree, type WbsTreeNode } from "@/lib/types";
import { computeVariance } from "@/lib/variance/engine";
import { rollupWbsVariance, type WbsVarianceRollup } from "@/lib/variance/rollup";
import type { VarianceResult } from "@/lib/variance/types";

export interface BaselineSummary {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
}

export interface ProjectVarianceData {
  baselines: BaselineSummary[];
  selectedBaselineId: string | null;
  variance: VarianceResult | null;
  wbsRollups: Map<string, WbsVarianceRollup>;
  thresholdPercent: number;
}

/**
 * Loads the data a variance-aware view (schedule table, Gantt overlay,
 * baselines panel) needs: the list of baselines, the one to compare against
 * (an explicit request if valid, else whichever is active), and the
 * computed per-task + per-WBS variance against it. Read-only — the actual
 * comparison logic lives in src/lib/variance/, kept pure and unit tested
 * the same way the CPM engine is.
 */
export async function loadProjectVariance(
  projectId: string,
  requestedBaselineId?: string | null,
): Promise<ProjectVarianceData> {
  const supabase = await createClient();

  const [{ data: project }, { data: baselines }, { data: tasks }, { data: wbsNodes }] = await Promise.all([
    supabase.from("projects").select("variance_threshold_percent").eq("id", projectId).single(),
    supabase
      .from("baselines")
      .select("id, name, created_at, is_active")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("project_id", projectId),
    supabase.from("wbs_nodes").select("*").eq("project_id", projectId),
  ]);

  const thresholdPercent = project?.variance_threshold_percent ?? 20;
  const baselineList = baselines ?? [];

  const selectedBaselineId =
    requestedBaselineId && baselineList.some((b) => b.id === requestedBaselineId)
      ? requestedBaselineId
      : (baselineList.find((b) => b.is_active)?.id ?? null);

  if (!selectedBaselineId || !tasks) {
    return {
      baselines: baselineList,
      selectedBaselineId,
      variance: null,
      wbsRollups: new Map(),
      thresholdPercent,
    };
  }

  const { data: baselineTasks } = await supabase
    .from("baseline_tasks")
    .select("*")
    .eq("baseline_id", selectedBaselineId);

  const variance = computeVariance(
    tasks.map((t) => ({
      id: t.id,
      startDate: t.start_date,
      endDate: t.end_date,
      durationDays: Number(t.duration_days),
    })),
    (baselineTasks ?? []).map((b) => ({
      taskId: b.task_id,
      name: b.name,
      wbsId: b.wbs_id,
      startDate: b.start_date,
      endDate: b.end_date,
      durationDays: Number(b.duration_days),
    })),
  );

  const tree = buildWbsTree(wbsNodes ?? [], tasks);
  const taskDatesById = new Map(
    tasks.map((t) => [t.id, { id: t.id, startDate: t.start_date, endDate: t.end_date }]),
  );

  const wbsRollups = new Map<string, WbsVarianceRollup>();
  function visit(node: WbsTreeNode) {
    const rollup = rollupWbsVariance(node, taskDatesById, variance.byTaskId);
    if (rollup) wbsRollups.set(node.id, rollup);
    for (const child of node.children) visit(child);
  }
  for (const node of tree) visit(node);

  return { baselines: baselineList, selectedBaselineId, variance, wbsRollups, thresholdPercent };
}
