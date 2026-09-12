import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildWbsTree, flattenForGantt } from "@/lib/types";
import { loadProjectVariance } from "@/lib/actions/variance";
import { GanttChart } from "./gantt-chart";

export default async function GanttPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ baseline?: string }>;
}) {
  const { projectId } = await params;
  const { baseline: requestedBaselineId } = await searchParams;
  const supabase = await createClient();

  const [{ data: project }, { data: wbsNodes }, { data: tasks }, { data: dependencies }, varianceData] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("wbs_nodes").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("dependencies").select("*").eq("project_id", projectId),
      loadProjectVariance(projectId, requestedBaselineId),
    ]);

  if (!project) notFound();

  const tree = buildWbsTree(wbsNodes ?? [], tasks ?? []);
  const unassigned = (tasks ?? []).filter((t) => !t.wbs_id);
  const rows = flattenForGantt(tree, unassigned);

  return (
    <GanttChart
      project={project}
      rows={rows}
      dependencies={dependencies ?? []}
      varianceData={varianceData}
    />
  );
}
