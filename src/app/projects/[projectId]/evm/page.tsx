import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildWbsTree } from "@/lib/types";
import { loadProjectEvm } from "@/lib/actions/evm-lookup";
import { EvmView } from "./evm-view";

export default async function EvmPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: wbsNodes }, { data: tasks }, evmData] = await Promise.all([
    supabase.from("projects").select("id, status_date").eq("id", projectId).single(),
    supabase.from("wbs_nodes").select("*").eq("project_id", projectId).order("sort_order"),
    supabase.from("tasks").select("*").eq("project_id", projectId),
    loadProjectEvm(projectId),
  ]);

  if (!project) notFound();

  const tree = buildWbsTree(wbsNodes ?? [], tasks ?? []);

  return <EvmView projectId={project.id} statusDate={project.status_date} tree={tree} evmData={evmData} />;
}
