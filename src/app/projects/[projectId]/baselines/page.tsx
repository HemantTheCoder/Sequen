import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BaselinesView } from "./baselines-view";

export default async function BaselinesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: baselines }] = await Promise.all([
    supabase.from("projects").select("id, variance_threshold_percent").eq("id", projectId).single(),
    supabase
      .from("baselines")
      .select("id, name, created_at, is_active")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) notFound();

  return (
    <BaselinesView
      projectId={project.id}
      thresholdPercent={project.variance_threshold_percent}
      baselines={baselines ?? []}
    />
  );
}
