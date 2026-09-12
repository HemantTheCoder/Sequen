"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectSchedule } from "./recalculate";

export interface ImportRow {
  name: string;
  /** Source activity ID/code (e.g. P6/MSP Activity ID), if the sheet has one. */
  activityId: string | null;
  durationDays: number;
  percentComplete: number;
  /** Each entry may be either a task name or an activity ID — resolved against both. */
  predecessorNames: string[];
  wbsSectionName: string | null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Commits parsed & mapped spreadsheet rows into the project: groups rows
 * into WBS sections (by `wbsSectionName`, falling back to one section for
 * unmapped rows), creates tasks, then resolves `predecessorNames` against
 * both the new batch and the project's existing tasks — matching by name
 * OR by activity ID, since many schedule exports (P6, MS Project) list
 * predecessors as IDs rather than task names.
 */
export async function importParsedTasks(
  projectId: string,
  rows: ImportRow[],
  defaultSectionName: string,
) {
  const supabase = await createClient();

  const { data: existingTasks } = await supabase
    .from("tasks")
    .select("id, name, external_id")
    .eq("project_id", projectId);

  // A single lookup keyed by both name and activity ID (when present) — a
  // predecessor reference is resolved against whichever one it matches.
  const keyToId = new Map<string, string>();
  for (const t of existingTasks ?? []) {
    keyToId.set(normalize(t.name), t.id);
    if (t.external_id) keyToId.set(normalize(t.external_id), t.id);
  }

  const { data: existingWbs } = await supabase
    .from("wbs_nodes")
    .select("id, name, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false });
  let wbsSortOrder = (existingWbs?.[0]?.sort_order ?? -1) + 1;

  const wbsIdByName = new Map<string, string>();
  for (const w of existingWbs ?? []) {
    wbsIdByName.set(normalize(w.name), w.id);
  }

  async function getOrCreateWbs(name: string): Promise<string> {
    const key = normalize(name);
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

  const pendingDependencies: { predecessorRef: string; successorId: string }[] = [];
  let sortOrder = 0;

  for (const row of rows) {
    const wbsId = await getOrCreateWbs(row.wbsSectionName?.trim() || defaultSectionName);
    const { data: taskRow, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        wbs_id: wbsId,
        name: row.name,
        external_id: row.activityId,
        duration_days: row.durationDays,
        percent_complete: row.percentComplete,
        status: row.percentComplete === 100 ? "complete" : row.percentComplete > 0 ? "in_progress" : "not_started",
        sort_order: sortOrder++,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    keyToId.set(normalize(row.name), taskRow.id);
    if (row.activityId) keyToId.set(normalize(row.activityId), taskRow.id);
    for (const predRef of row.predecessorNames) {
      pendingDependencies.push({ predecessorRef: predRef, successorId: taskRow.id });
    }
  }

  const unresolvedPredecessors: string[] = [];
  const depsToInsert = pendingDependencies
    .map((d) => {
      const predId = keyToId.get(normalize(d.predecessorRef));
      if (!predId) {
        unresolvedPredecessors.push(d.predecessorRef);
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
