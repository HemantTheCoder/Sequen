"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { addDays, differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Plus, AlertTriangle, ArrowRight, Scale, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { Project, Resource } from "@/lib/types";
import type { ResourceConflict } from "@/lib/leveling/conflicts";
import {
  assignResource,
  createResource,
  deleteAssignment,
  deleteResource,
  setResourceCalendar,
  setResourceCapacity,
} from "@/lib/actions/resources";
import {
  applyResourceLeveling,
  previewResourceLeveling,
  updateLevelingMode,
  type LevelingPreview,
} from "@/lib/actions/level-resources";
import type { Database } from "@/lib/supabase/database.types";

type LevelingMode = Database["public"]["Enums"]["leveling_mode"];

interface CalendarOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface TaskLite {
  id: string;
  name: string;
  early_start: string | null;
  early_finish: string | null;
}

interface Assignment {
  id: string;
  task_id: string;
  resource_id: string;
  allocation_percent: number;
  task: TaskLite;
}

export function ResourcesView({
  project,
  resources,
  tasks,
  assignments,
  calendars,
  conflicts,
}: {
  project: Project;
  resources: Resource[];
  tasks: TaskLite[];
  assignments: Assignment[];
  calendars: CalendarOption[];
  conflicts: ResourceConflict[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newResource, setNewResource] = useState({ name: "", role: "", costPerHour: "" });
  const [newAssignment, setNewAssignment] = useState({ taskId: "", resourceId: "", allocation: "100" });

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleAddResource(e: React.FormEvent) {
    e.preventDefault();
    if (!newResource.name.trim()) return;
    await createResource(
      project.id,
      newResource.name.trim(),
      newResource.role.trim() || null,
      newResource.costPerHour ? Number(newResource.costPerHour) : null,
    );
    setNewResource({ name: "", role: "", costPerHour: "" });
    refresh();
  }

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!newAssignment.taskId || !newAssignment.resourceId) return;
    await assignResource(
      project.id,
      newAssignment.taskId,
      newAssignment.resourceId,
      Number(newAssignment.allocation) || 100,
    );
    setNewAssignment({ taskId: "", resourceId: "", allocation: "100" });
    refresh();
  }

  return (
    <div className="w-full max-w-5xl flex-1 space-y-6 p-6">
      <div className="flex items-center justify-end">
        <LevelResourcesButton projectId={project.id} initialMode={project.leveling_mode} onApplied={refresh} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddResource} className="grid grid-cols-[1fr_1fr_80px_32px] gap-2">
              <Input
                placeholder="Name"
                value={newResource.name}
                onChange={(e) => setNewResource((s) => ({ ...s, name: e.target.value }))}
              />
              <Input
                placeholder="Role"
                value={newResource.role}
                onChange={(e) => setNewResource((s) => ({ ...s, role: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="$/hr"
                value={newResource.costPerHour}
                onChange={(e) => setNewResource((s) => ({ ...s, costPerHour: e.target.value }))}
              />
              <Button size="icon" type="submit">
                <Plus className="size-4" />
              </Button>
            </form>
            {resources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No resources yet. Add a name above to start assigning it to tasks.
              </p>
            ) : (
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[24%]" />
                  <col className="w-8" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Name</th>
                    <th className="py-1.5 pr-2 font-medium">Role</th>
                    <th className="py-1.5 pr-2 font-medium">Rate</th>
                    <th className="py-1.5 pr-2 font-medium" title="Percent of one full-time person; use e.g. 300 for a 3-person crew">
                      Capacity
                    </th>
                    <th className="py-1.5 pr-2 font-medium">Calendar</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className="truncate py-1.5 pr-2 font-medium" title={r.name}>{r.name}</td>
                      <td className="truncate py-1.5 pr-2 text-muted-foreground" title={r.role ?? undefined}>
                        {r.role || "—"}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                        {r.cost_per_hour != null ? `$${r.cost_per_hour}/hr` : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <CapacityInput projectId={project.id} resource={r} onSaved={refresh} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          value={r.calendar_id ?? ""}
                          onChange={async (e) => {
                            await setResourceCalendar(project.id, r.id, e.target.value || null);
                            refresh();
                          }}
                          className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-1.5 text-xs text-muted-foreground"
                        >
                          <option value="">Project default (Mon–Fri)</option>
                          {calendars.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 text-status-off-track"
                          onClick={async () => {
                            await deleteResource(project.id, r.id);
                            refresh();
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignments</CardTitle>
            <CardDescription>
              Set how much of each resource&apos;s time a task needs — utilization below is calculated from this.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddAssignment} className="grid grid-cols-[1fr_1fr_60px_32px] gap-2">
              <select
                value={newAssignment.taskId}
                onChange={(e) => setNewAssignment((s) => ({ ...s, taskId: e.target.value }))}
                className="h-9 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Task…</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                value={newAssignment.resourceId}
                onChange={(e) => setNewAssignment((s) => ({ ...s, resourceId: e.target.value }))}
                className="h-9 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Resource…</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Input
                type="number"
                value={newAssignment.allocation}
                onChange={(e) => setNewAssignment((s) => ({ ...s, allocation: e.target.value }))}
                className="font-mono"
              />
              <Button size="icon" type="submit">
                <Plus className="size-4" />
              </Button>
            </form>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assignments yet. Assign a resource to a task above.
              </p>
            ) : (
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[52%]" />
                  <col className="w-[12%]" />
                  <col className="w-8" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Resource</th>
                    <th className="py-1.5 pr-2 font-medium">Task</th>
                    <th className="py-1.5 pr-2 font-medium">Allocation</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const resource = resources.find((r) => r.id === a.resource_id);
                    return (
                      <tr key={a.id} className="border-b border-border">
                        <td className="truncate py-1.5 pr-2 font-medium" title={resource?.name}>
                          {resource?.name ?? "?"}
                        </td>
                        <td className="truncate py-1.5 pr-2 text-muted-foreground" title={a.task.name}>
                          {a.task.name}
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-muted-foreground">{a.allocation_percent}%</td>
                        <td className="py-1.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 text-status-off-track"
                            onClick={async () => {
                              await deleteAssignment(project.id, a.id);
                              refresh();
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <ResourceConflictsPanel projectId={project.id} conflicts={conflicts} resources={resources} tasks={tasks} />

      <UtilizationChart resources={resources} assignments={assignments} />
    </div>
  );
}

function CapacityInput({
  projectId,
  resource,
  onSaved,
}: {
  projectId: string;
  resource: Resource;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(resource.max_capacity_percent));

  async function commit() {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && n !== resource.max_capacity_percent) {
      await setResourceCapacity(projectId, resource.id, n);
      onSaved();
    } else {
      setValue(String(resource.max_capacity_percent));
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 w-16 border-transparent bg-transparent py-0 font-mono hover:border-input focus-visible:border-ring"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function ResourceConflictsPanel({
  projectId,
  conflicts,
  resources,
  tasks,
}: {
  projectId: string;
  conflicts: ResourceConflict[];
  resources: Resource[];
  tasks: TaskLite[];
}) {
  const taskNameById = new Map(tasks.map((t) => [t.id, t.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className={cn("size-4", conflicts.length > 0 && "text-status-off-track")} />
          Resource conflicts
        </CardTitle>
        <CardDescription>
          Days where a resource&apos;s combined allocation across tasks exceeds its capacity. These
          feed the same warnings shown in the AI Assistant&apos;s risk check.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No resource is over capacity on any working day — nothing to resolve.
          </p>
        ) : (
          <div className="space-y-3">
            {conflicts.map((conflict) => {
              const resource = resources.find((r) => r.id === conflict.resourceId);
              return (
                <div key={conflict.resourceId} className="rounded-[2px] border border-status-off-track/40">
                  <div className="flex items-center justify-between border-b border-status-off-track/40 bg-status-off-track/5 px-3 py-1.5">
                    <span className="text-sm font-medium">{resource?.name ?? conflict.resourceName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      capacity {conflict.maxCapacityPercent}%
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {conflict.ranges.map((range) => (
                      <div key={`${range.startDate}-${range.endDate}`} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-status-off-track">
                            {range.startDate === range.endDate
                              ? fmtDate(range.startDate)
                              : `${fmtDate(range.startDate)} – ${fmtDate(range.endDate)}`}
                            <span className="ml-2 text-muted-foreground">{range.peakAllocationPercent}% allocated</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {range.taskIds.map((id) => taskNameById.get(id) ?? "Untitled task").join(", ")}
                          </p>
                        </div>
                        <Link
                          href={`/projects/${projectId}/gantt?focus=${range.startDate}`}
                          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          View on Gantt
                          <ArrowRight className="size-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const LEVELING_MODE_LABEL: Record<LevelingMode, string> = {
  within_float: "Within float — never delay past a task's own slack",
  allow_delay: "Allow delay — may push the project finish to resolve every conflict",
};

function LevelResourcesButton({
  projectId,
  initialMode,
  onApplied,
}: {
  projectId: string;
  initialMode: LevelingMode;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LevelingMode>(initialMode);
  const [preview, setPreview] = useState<LevelingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  async function runPreview(nextMode: LevelingMode) {
    setLoading(true);
    try {
      const result = await previewResourceLeveling(projectId, nextMode);
      setPreview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not compute leveling preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setMode(initialMode);
      await runPreview(initialMode);
    } else {
      setPreview(null);
    }
  }

  async function handleModeChange(nextMode: LevelingMode) {
    setMode(nextMode);
    await runPreview(nextMode);
  }

  async function handleApply() {
    if (!preview) return;
    setApplying(true);
    try {
      if (mode !== initialMode) await updateLevelingMode(projectId, mode);
      await applyResourceLeveling(
        projectId,
        preview.moves.map((m) => ({ taskId: m.taskId, newStartDate: m.newStartDate })),
      );
      toast.success(
        preview.moves.length > 0
          ? `Moved ${preview.moves.length} task${preview.moves.length === 1 ? "" : "s"}`
          : "No tasks needed to move",
      );
      setOpen(false);
      setPreview(null);
      onApplied();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply leveling");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Scale className="size-4" />
          Level resources
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Level resources</DialogTitle>
          <DialogDescription>
            Runs the serial-method leveler and previews which tasks it would move before touching
            anything — nothing is applied until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Leveling mode</label>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as LevelingMode)}
              disabled={loading}
              className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="within_float">Within float</option>
              <option value="allow_delay">Allow delay</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{LEVELING_MODE_LABEL[mode]}</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Computing…
            </div>
          ) : preview ? (
            <div className="max-h-80 space-y-3 overflow-auto">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {preview.moves.length === 0
                    ? "No tasks need to move"
                    : `${preview.moves.length} task${preview.moves.length === 1 ? "" : "s"} would move`}
                </p>
                {preview.moves.length > 0 && (
                  <ul className="mt-1 space-y-1 text-sm">
                    {preview.moves.map((m) => (
                      <li key={m.taskId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{m.taskName}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {fmtDate(m.originalStartDate)} → {fmtDate(m.newStartDate)} (+{m.movedByWorkingDays}d)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {preview.unresolvedConflicts.length > 0 && (
                <div className="rounded-[2px] border border-status-off-track/40 bg-status-off-track/5 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-status-off-track">
                    <AlertTriangle className="size-3.5" />
                    {preview.unresolvedConflicts.length} resource
                    {preview.unresolvedConflicts.length === 1 ? "" : "s"} still over capacity
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {preview.unresolvedConflicts.map((c) => (
                      <li key={c.resourceId}>
                        {c.resourceName}:{" "}
                        {c.ranges
                          .map((r) => (r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)}–${fmtDate(r.endDate)}`))
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading || applying || !preview}>
            {applying ? <Loader2 className="size-4 animate-spin" /> : null}
            {applying ? "Applying…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UtilizationChart({
  resources,
  assignments,
}: {
  resources: Resource[];
  assignments: Assignment[];
}) {
  const weeks = useMemo(() => {
    if (assignments.length === 0) return [];
    const dates = assignments.flatMap((a) => [a.task.early_start, a.task.early_finish]).filter(
      (d): d is string => !!d,
    );
    if (dates.length === 0) return [];
    const min = startOfWeek(new Date(Math.min(...dates.map((d) => +new Date(d + "T00:00:00")))));
    const max = new Date(Math.max(...dates.map((d) => +new Date(d + "T00:00:00"))));
    const numWeeks = Math.max(1, Math.ceil(differenceInCalendarDays(max, min) / 7) + 1);
    return Array.from({ length: Math.min(numWeeks, 12) }, (_, i) => addDays(min, i * 7));
  }, [assignments]);

  function allocationInWeek(resourceId: string, weekStart: Date) {
    const weekEnd = addDays(weekStart, 7);
    let total = 0;
    for (const a of assignments) {
      if (a.resource_id !== resourceId) continue;
      const s = a.task.early_start ? new Date(a.task.early_start + "T00:00:00") : null;
      const f = a.task.early_finish ? new Date(a.task.early_finish + "T00:00:00") : null;
      if (!s || !f) continue;
      if (s < weekEnd && f > weekStart) total += a.allocation_percent;
    }
    return total;
  }

  if (resources.length === 0 || weeks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly utilization</CardTitle>
          <CardDescription>
            Calculated automatically from the assignments above and each task&apos;s scheduled dates —
            nothing to enter here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Assign resources to scheduled tasks to see weekly utilization.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly utilization</CardTitle>
        <CardDescription>
          Calculated automatically from the assignments above and each task&apos;s scheduled dates.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="w-32 px-2 py-1 text-left font-medium">Resource</th>
                {weeks.map((w) => (
                  <th key={w.toISOString()} className="w-16 px-1 py-1 text-center font-mono text-xs font-normal text-muted-foreground">
                    {format(w, "MMM d")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 font-medium">{r.name}</td>
                  {weeks.map((w) => {
                    const pct = allocationInWeek(r.id, w);
                    const over = pct > 100;
                    return (
                      <td key={w.toISOString()} className="px-1 py-1.5">
                        <div className="flex h-10 items-end justify-center">
                          <div
                            title={`${pct}%`}
                            className={cn(
                              "w-6",
                              pct === 0 ? "bg-transparent" : over ? "bg-status-off-track" : "bg-status-on-track",
                            )}
                            style={{ height: `${Math.min(100, pct) / 100 * 36 + (pct > 0 ? 4 : 0)}px` }}
                          />
                        </div>
                        {over && (
                          <div className="flex items-center justify-center gap-0.5 font-mono text-[10px] text-status-off-track">
                            <AlertTriangle className="size-2.5" />
                            {pct}%
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
