"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateStatusDate(projectId: string, statusDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ status_date: statusDate }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/evm`);
}
