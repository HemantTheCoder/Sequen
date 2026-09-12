import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Outline } from "./outline";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: wbsNodes }, { data: tasks }, { data: dependencies }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("wbs_nodes").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("dependencies").select("*").eq("project_id", projectId),
    ]);

  if (!project) notFound();

  return (
    <Outline
      project={project}
      wbsNodes={wbsNodes ?? []}
      tasks={tasks ?? []}
      dependencies={dependencies ?? []}
    />
  );
}
