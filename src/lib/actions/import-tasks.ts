"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectSchedule } from "./recalculate";

export interface ImportRow {
  name: string;
  durationDays: number;
  percentComplete: number;
  predecessorNames: string[];
  wbsSectionName: string | null;
}

/**
 * Commits parsed & mapped spreadsheet rows into the project: groups rows
 * into WBS sections (by `wbsSectionName`, falling back to one section for
 * unmapped rows), creates tasks, then resolves `predecessorNames` against
 * both the new batch and the project's existing tasks by case-insensitive
 * name match.
 */
export async function importParsedTasks(
  projectId: string,
  rows: ImportRow[],
  defaultSectionName: string,
) {
  const supabase = await createClient();

  const { data: existingTasks } = await supabase
    .from("tasks")
    .select("id, name")
    .eq("project_id", projectId);

  const nameToId = new Map<string, string>();
  for (const t of existingTasks ?? []) {
    nameToId.set(t.name.trim().toLowerCase(), t.id);
  }

  const { data: existingWbs } = await supabase
    .from("wbs_nodes")
    .select("id, name, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false });
  let wbsSortOrder = (existingWbs?.[0]?.sort_order ?? -1) + 1;

  const wbsIdByName = new Map<string, string>();
  for (const w of existingWbs ?? []) {
    wbsIdByName.set(w.name.trim().toLowerCase(), w.id);
  }

  async function getOrCreateWbs(name: string): Promise<string> {
    const key = name.trim().toLowerCase();
    const existing = wbsIdByName.get(key);
    if (existing) return existing;
    const { data, error } = await supabase
      .from("wbs_nodes")
      .insert({ project_id: projectId, parent_id: null, name, sort_order: wbsSortOrder++ })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    wbsIdByName.set(key, data.id);
    return data.id;
  }

  const pendingDependencies: { predecessorName: string; successorId: string }[] = [];
  let sortOrder = 0;

  for (const row of rows) {
    const wbsId = await getOrCreateWbs(row.wbsSectionName?.trim() || defaultSectionName);
    const { data: taskRow, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        wbs_id: wbsId,
        name: row.name,
        duration_days: row.durationDays,
        percent_complete: row.percentComplete,
        status: row.percentComplete === 100 ? "complete" : row.percentComplete > 0 ? "in_progress" : "not_started",
        sort_order: sortOrder++,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    nameToId.set(row.name.trim().toLowerCase(), taskRow.id);
    for (const predName of row.predecessorNames) {
      pendingDependencies.push({ predecessorName: predName, successorId: taskRow.id });
    }
  }

  const unresolvedPredecessors: string[] = [];
  const depsToInsert = pendingDependencies
    .map((d) => {
      const predId = nameToId.get(d.predecessorName.trim().toLowerCase());
      if (!predId) {
        unresolvedPredecessors.push(d.predecessorName);
        return null;
      }
      return { project_id: projectId, predecessor_id: predId, successor_id: d.successorId, type: "FS" as const, lag_days: 0 };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null && d.predecessor_id !== d.successor_id);

  if (depsToInsert.length > 0) {
    const { error } = await supabase.from("dependencies").insert(depsToInsert);
    if (error) throw new Error(error.message);
  }

  const result = await recalculateProjectSchedule(projectId);

  revalidatePath(`/projects/${projectId}/schedule`);
  revalidatePath(`/projects/${projectId}/gantt`);

  return { ...result, imported: rows.length, unresolvedPredecessors };
}
