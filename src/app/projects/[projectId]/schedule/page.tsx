import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadProjectVariance } from "@/lib/actions/variance";
import { ScheduleWorkspace } from "./schedule-workspace";

export default async function SchedulePage({
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

  return (
    <ScheduleWorkspace
      project={project}
      wbsNodes={wbsNodes ?? []}
      tasks={tasks ?? []}
      dependencies={dependencies ?? []}
      varianceData={varianceData}
    />
  );
}
