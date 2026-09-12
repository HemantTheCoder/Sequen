import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AiAssistantView } from "./ai-assistant-view";

export default async function AiAssistantPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: tasks }, { data: dependencies }, { data: assignments }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("dependencies").select("*").eq("project_id", projectId),
      supabase
        .from("task_resources")
        .select("*, task:tasks!inner(id, name, early_start, early_finish, project_id), resource:resources(id, name)")
        .eq("task.project_id", projectId),
    ]);

  if (!project) notFound();

  return (
    <AiAssistantView
      project={project}
      tasks={tasks ?? []}
      dependencies={dependencies ?? []}
      assignments={assignments ?? []}
    />
  );
}
