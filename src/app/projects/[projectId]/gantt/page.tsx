import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildWbsTree, flattenForGantt } from "@/lib/types";
import { loadProjectVariance } from "@/lib/actions/variance";
import { GanttChart } from "./gantt-chart";

export default async function GanttPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ baseline?: string; focus?: string }>;
}) {
  const { projectId } = await params;
  const { baseline: requestedBaselineId, focus } = await searchParams;
  const supabase = await createClient();

  const [{ data: project }, { data: wbsNodes }, { data: tasks }, { data: dependencies }, { data: defaultCalendarRow }, varianceData] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("wbs_nodes").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("dependencies").select("*").eq("project_id", projectId),
      supabase
        .from("calendars")
        .select("id, working_days")
        .eq("project_id", projectId)
        .eq("is_default", true)
        .maybeSingle(),
      loadProjectVariance(projectId, requestedBaselineId),
    ]);

  if (!project) notFound();

  const tree = buildWbsTree(wbsNodes ?? [], tasks ?? []);
  const unassigned = (tasks ?? []).filter((t) => !t.wbs_id);
  const rows = flattenForGantt(tree, unassigned);

  let calendarExceptions = new Map<string, boolean>();
  if (defaultCalendarRow) {
    const { data: exceptions } = await supabase
      .from("calendar_exceptions")
      .select("date, is_working")
      .eq("calendar_id", defaultCalendarRow.id);
    calendarExceptions = new Map((exceptions ?? []).map((e) => [e.date, e.is_working]));
  }
  const defaultCalendar = {
    workingDays: Array.isArray(defaultCalendarRow?.working_days)
      ? (defaultCalendarRow.working_days as number[])
      : [1, 2, 3, 4, 5],
    exceptions: calendarExceptions,
  };

  return (
    <GanttChart
      project={project}
      rows={rows}
      dependencies={dependencies ?? []}
      varianceData={varianceData}
      defaultCalendar={defaultCalendar}
      focusDate={focus ?? null}
    />
  );
}
