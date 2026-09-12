import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResourcesView } from "./resources-view";

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: resources }, { data: tasks }, { data: assignments }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("resources").select("*").eq("project_id", projectId).order("created_at"),
      supabase
        .from("tasks")
        .select("id, name, early_start, early_finish")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("task_resources")
        .select("*, task:tasks!inner(id, name, early_start, early_finish, project_id)")
        .eq("task.project_id", projectId),
    ]);

  if (!project) notFound();

  return (
    <ResourcesView
      project={project}
      resources={resources ?? []}
      tasks={tasks ?? []}
      assignments={assignments ?? []}
    />
  );
}
