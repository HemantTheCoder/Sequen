import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalendarsView } from "./calendars-view";

export default async function CalendarsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: calendars }] = await Promise.all([
    supabase.from("projects").select("id").eq("id", projectId).single(),
    supabase
      .from("calendars")
      .select("id, name, working_days, is_default, hours_per_day")
      .eq("project_id", projectId)
      .order("created_at"),
  ]);

  if (!project) notFound();

  const calendarIds = (calendars ?? []).map((c) => c.id);
  const { data: exceptions } = calendarIds.length
    ? await supabase
        .from("calendar_exceptions")
        .select("id, calendar_id, date, is_working, note")
        .in("calendar_id", calendarIds)
        .order("date")
    : { data: [] };

  return (
    <CalendarsView
      projectId={project.id}
      calendars={calendars ?? []}
      exceptions={exceptions ?? []}
    />
  );
}
