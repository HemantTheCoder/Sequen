"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, Resource } from "@/lib/types";
import {
  assignResource,
  createResource,
  deleteAssignment,
  deleteResource,
} from "@/lib/actions/resources";

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
}: {
  project: Project;
  resources: Resource[];
  tasks: TaskLite[];
  assignments: Assignment[];
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
                  <col className="w-[38%]" />
                  <col className="w-[32%]" />
                  <col className="w-[22%]" />
                  <col className="w-8" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Name</th>
                    <th className="py-1.5 pr-2 font-medium">Role</th>
                    <th className="py-1.5 pr-2 font-medium">Rate</th>
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

      <UtilizationChart resources={resources} assignments={assignments} />
    </div>
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
