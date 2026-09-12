"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectSchedule } from "./recalculate";
import type { AiScheduleDraft } from "@/lib/ai/schedule-draft";

/** Commits a reviewed AI-generated schedule draft into the project's WBS/tasks/dependencies. */
export async function importScheduleDraft(projectId: string, draft: AiScheduleDraft) {
  const supabase = await createClient();

  const { data: existingWbs } = await supabase
    .from("wbs_nodes")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let wbsSortOrder = (existingWbs?.[0]?.sort_order ?? -1) + 1;

  const keyToTaskId = new Map<string, string>();
  const pendingDependencies: { predecessorKey: string; successorId: string; type: string; lagDays: number }[] = [];

  for (const section of draft.wbs) {
    const { data: wbsNode, error: wbsError } = await supabase
      .from("wbs_nodes")
      .insert({ project_id: projectId, parent_id: null, name: section.name, sort_order: wbsSortOrder++ })
      .select("id")
      .single();
    if (wbsError) throw new Error(wbsError.message);

    let taskSortOrder = 0;
    for (const task of section.tasks) {
      const { data: taskRow, error: taskError } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          wbs_id: wbsNode.id,
          name: task.name,
          duration_days: task.durationDays,
          is_milestone: task.isMilestone,
          sort_order: taskSortOrder++,
        })
        .select("id")
        .single();
      if (taskError) throw new Error(taskError.message);

      keyToTaskId.set(task.key, taskRow.id);
      for (const dep of task.dependencies) {
        pendingDependencies.push({
          predecessorKey: dep.dependsOnKey,
          successorId: taskRow.id,
          type: dep.type,
          lagDays: dep.lagDays,
        });
      }
    }
  }

  const depsToInsert = pendingDependencies
    .filter((d) => keyToTaskId.has(d.predecessorKey))
    .map((d) => ({
      project_id: projectId,
      predecessor_id: keyToTaskId.get(d.predecessorKey)!,
      successor_id: d.successorId,
      type: d.type as "FS" | "SS" | "FF" | "SF",
      lag_days: d.lagDays,
    }))
    .filter((d) => d.predecessor_id !== d.successor_id);

  if (depsToInsert.length > 0) {
    const { error: depsError } = await supabase.from("dependencies").insert(depsToInsert);
    if (depsError) throw new Error(depsError.message);
  }

  const result = await recalculateProjectSchedule(projectId);

  revalidatePath(`/projects/${projectId}/schedule`);
  revalidatePath(`/projects/${projectId}/gantt`);

  return result;
}
