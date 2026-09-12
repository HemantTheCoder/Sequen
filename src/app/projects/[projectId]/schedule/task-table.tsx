"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Milestone, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { Dependency, Task, WbsNode } from "@/lib/types";
import { createTask, deleteTask, deleteTasks, moveTasksToWbs, updateTask } from "@/lib/actions/schedule";
import { varianceStatus } from "@/lib/variance/engine";
import { formatVarianceDays, varianceColorClass } from "@/lib/variance/format";
import type { TaskVariance, VarianceResult } from "@/lib/variance/types";
import { PredecessorEditor } from "./predecessor-editor";

// Fixed pixel widths for every column. table-layout:fixed proportionally
// rescales <col> widths to fit whatever width the <table> itself resolves
// to, so the table's own min-width has to be computed as the exact sum of
// whichever columns are actually rendered — a static guess silently breaks
// (and squeezes every column) the moment a column is added or removed.
const COL = {
  checkbox: 32,
  name: 220,
  section: 160,
  duration: 80,
  start: 90,
  finish: 90,
  percent: 70,
  predecessors: 170,
  float: 64,
  baselineStart: 90,
  baselineFinish: 90,
  startVariance: 100,
  finishVariance: 100,
  actions: 40,
};

export function TaskTable({
  projectId,
  scopeName,
  scopeWbsId,
  tasks,
  allTasks,
  dependencies,
  wbsNodes,
  variance,
  thresholdPercent,
}: {
  projectId: string;
  scopeName: string;
  scopeWbsId: string | null;
  tasks: Task[];
  allTasks: Task[];
  dependencies: Dependency[];
  wbsNodes: WbsNode[];
  variance: VarianceResult | null;
  thresholdPercent: number;
}) {
  const router = useRouter();
  const wbsNameById = new Map(wbsNodes.map((w) => [w.id, w.name]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMoveTarget, setBulkMoveTarget] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Selection is scoped to what's currently visible — drop any selected id
  // that's no longer in the list (section switch, delete, etc.). Adjusted
  // during render (React's recommended pattern) rather than in an effect,
  // since it's purely derived from the tasks prop.
  const tasksKey = tasks.map((t) => t.id).join(",");
  const [lastTasksKey, setLastTasksKey] = useState(tasksKey);
  if (tasksKey !== lastTasksKey) {
    setLastTasksKey(tasksKey);
    const visible = new Set(tasks.map((t) => t.id));
    setSelected((prev) => new Set([...prev].filter((id) => visible.has(id))));
  }

  function refresh() {
    router.refresh();
  }

  async function handleAddTask() {
    await createTask(projectId, scopeWbsId, "New task", tasks.length);
    refresh();
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(tasks.map((t) => t.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected task${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      await deleteTasks(projectId, ids);
      toast.success(`Deleted ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkMove() {
    const ids = [...selected];
    if (ids.length === 0 || !bulkMoveTarget) return;
    setBulkBusy(true);
    try {
      const targetId = bulkMoveTarget === "__unassigned__" ? null : bulkMoveTarget;
      await moveTasksToWbs(projectId, ids, targetId);
      toast.success(`Moved ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      setBulkMoveTarget("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk move failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const allSelected = tasks.length > 0 && selected.size === tasks.length;
  const someSelected = selected.size > 0 && !allSelected;

  const showSectionColumn = scopeWbsId === null;
  const tableWidth =
    COL.checkbox +
    COL.name +
    (showSectionColumn ? COL.section : 0) +
    COL.duration +
    COL.start +
    COL.finish +
    COL.percent +
    COL.predecessors +
    COL.float +
    (variance ? COL.baselineStart + COL.baselineFinish + COL.startVariance + COL.finishVariance : 0) +
    COL.actions;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">{scopeName}</h2>
        <Button size="sm" variant="outline" onClick={handleAddTask}>
          <Plus className="size-4" />
          Add task
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-accent/60 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select
            value={bulkMoveTarget}
            onChange={(e) => setBulkMoveTarget(e.target.value)}
            className="h-7 min-w-0 rounded-md border border-input bg-transparent px-1.5 text-xs"
          >
            <option value="">Move to section…</option>
            <option value="__unassigned__">Unassigned</option>
            {wbsNodes.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={handleBulkMove} disabled={!bulkMoveTarget || bulkBusy}>
            Move
          </Button>
          <Button size="sm" variant="ghost" className="text-status-off-track" onClick={handleBulkDelete} disabled={bulkBusy}>
            <Trash2 className="size-3.5" />
            Delete selected
          </Button>
          <Button size="icon-sm" variant="ghost" className="ml-auto" title="Clear selection" onClick={() => setSelected(new Set())}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="table-fixed border-collapse text-sm" style={{ width: tableWidth, minWidth: tableWidth }}>
          <colgroup>
            <col style={{ width: COL.checkbox }} />
            <col style={{ width: COL.name }} />
            {scopeWbsId === null && <col style={{ width: COL.section }} />}
            <col style={{ width: COL.duration }} />
            <col style={{ width: COL.start }} />
            <col style={{ width: COL.finish }} />
            <col style={{ width: COL.percent }} />
            <col style={{ width: COL.predecessors }} />
            <col style={{ width: COL.float }} />
            {variance && (
              <>
                <col style={{ width: COL.baselineStart }} />
                <col style={{ width: COL.baselineFinish }} />
                <col style={{ width: COL.startVariance }} />
                <col style={{ width: COL.finishVariance }} />
              </>
            )}
            <col style={{ width: COL.actions }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">
                <Checkbox
                  checked={someSelected ? "indeterminate" : allSelected}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all tasks"
                />
              </th>
              <th className="px-3 py-2 font-medium">Name</th>
              {scopeWbsId === null && <th className="px-3 py-2 font-medium">Section</th>}
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 font-medium">Finish</th>
              <th className="px-3 py-2 font-medium">% done</th>
              <th className="px-3 py-2 font-medium">Predecessors</th>
              <th className="px-3 py-2 font-medium">Float</th>
              {variance && (
                <>
                  <th className="px-3 py-2 font-medium">Baseline start</th>
                  <th className="px-3 py-2 font-medium">Baseline finish</th>
                  <th className="px-3 py-2 font-medium">Start variance</th>
                  <th className="px-3 py-2 font-medium">Finish variance</th>
                </>
              )}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projectId={projectId}
                allTasks={allTasks}
                dependencies={dependencies}
                sectionName={task.wbs_id ? wbsNameById.get(task.wbs_id) ?? "—" : "—"}
                showSection={scopeWbsId === null}
                selected={selected.has(task.id)}
                onToggleSelected={(checked) => toggleOne(task.id, checked)}
                variance={variance?.byTaskId.get(task.id) ?? null}
                thresholdPercent={thresholdPercent}
                refresh={refresh}
              />
            ))}
            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={9 + (showSectionColumn ? 1 : 0) + (variance ? 4 : 0)}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  No tasks in this section yet. Add one, or use the AI Assistant to draft a schedule.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  projectId,
  allTasks,
  dependencies,
  sectionName,
  showSection,
  selected,
  onToggleSelected,
  variance,
  thresholdPercent,
  refresh,
}: {
  task: Task;
  projectId: string;
  allTasks: Task[];
  dependencies: Dependency[];
  sectionName: string;
  showSection: boolean;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
  variance: TaskVariance | null;
  thresholdPercent: number;
  refresh: () => void;
}) {
  const [name, setName] = useState(task.name);
  const [duration, setDuration] = useState(String(task.duration_days));
  const [percent, setPercent] = useState(String(task.percent_complete));
  const preds = dependencies.filter((d) => d.successor_id === task.id);

  async function commitName() {
    if (name.trim() && name !== task.name) {
      await updateTask(projectId, task.id, { name: name.trim() });
      toast.success("Saved");
      refresh();
    } else {
      setName(task.name);
    }
  }

  async function commitDuration() {
    const n = Number(duration);
    if (Number.isFinite(n) && n >= 0 && n !== task.duration_days) {
      await updateTask(projectId, task.id, { duration_days: n });
      toast.success("Saved — schedule recalculated");
      refresh();
    } else {
      setDuration(String(task.duration_days));
    }
  }

  async function commitPercent() {
    const n = Math.max(0, Math.min(100, Number(percent) || 0));
    if (n !== task.percent_complete) {
      await updateTask(projectId, task.id, {
        percent_complete: n,
        status: n === 0 ? "not_started" : n === 100 ? "complete" : "in_progress",
      });
      toast.success("Saved");
      refresh();
    } else {
      setPercent(String(task.percent_complete));
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete task "${task.name}"?`)) return;
    await deleteTask(projectId, task.id);
    refresh();
  }

  return (
    <tr
      className={cn(
        "group border-b border-border hover:bg-accent/40",
        selected && "bg-accent/50",
        task.is_critical && "border-l-[3px] border-l-critical",
      )}
    >
      <td className="px-3 py-1.5">
        <Checkbox checked={selected} onCheckedChange={(v) => onToggleSelected(v === true)} aria-label={`Select ${task.name}`} />
      </td>
      <td className="px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.is_milestone && <Milestone className="size-3.5 shrink-0 text-status-at-risk" />}
          {task.is_critical && (
            <span title="On the critical path" className="shrink-0">
              <AlertTriangle className="size-3.5 text-critical" />
            </span>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            title={name}
            className="h-6 min-w-0 flex-1 truncate border-transparent bg-transparent py-0 hover:border-input focus-visible:border-ring"
          />
        </div>
      </td>
      {showSection && (
        <td className="truncate px-3 py-1.5 text-muted-foreground" title={sectionName}>
          {sectionName}
        </td>
      )}
      <td className="px-3 py-1.5">
        <Input
          type="number"
          min={0}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-6 w-16 border-transparent bg-transparent py-0 font-mono hover:border-input focus-visible:border-ring"
        />
      </td>
      <td className="px-3 py-1.5 font-mono text-muted-foreground">{fmtDate(task.start_date)}</td>
      <td className="px-3 py-1.5 font-mono text-muted-foreground">{fmtDate(task.end_date)}</td>
      <td className="px-3 py-1.5">
        <Input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          onBlur={commitPercent}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-6 w-16 border-transparent bg-transparent py-0 font-mono hover:border-input focus-visible:border-ring"
        />
      </td>
      <td className="px-3 py-1.5">
        <PredecessorEditor
          projectId={projectId}
          task={task}
          allTasks={allTasks}
          predecessorLinks={preds}
          onChanged={refresh}
        />
      </td>
      <td className="px-3 py-1.5 font-mono">
        {task.total_float !== null ? (
          <span className={task.is_critical ? "text-critical" : "text-muted-foreground"}>
            {task.total_float}d
          </span>
        ) : (
          "—"
        )}
      </td>
      {variance && (
        <>
          <td className="px-3 py-1.5 font-mono text-muted-foreground">
            {variance.isNewScope ? (
              <span title="Added after the baseline was taken">New</span>
            ) : (
              fmtDate(variance.baselineStartDate)
            )}
          </td>
          <td className="px-3 py-1.5 font-mono text-muted-foreground">
            {variance.isNewScope ? "—" : fmtDate(variance.baselineEndDate)}
          </td>
          <td
            className={cn(
              "px-3 py-1.5 font-mono",
              varianceColorClass(varianceStatus(variance.startVarianceDays, task.duration_days, thresholdPercent)),
            )}
          >
            {formatVarianceDays(variance.startVarianceDays)}
          </td>
          <td
            className={cn(
              "px-3 py-1.5 font-mono",
              varianceColorClass(varianceStatus(variance.finishVarianceDays, task.duration_days, thresholdPercent)),
            )}
          >
            {formatVarianceDays(variance.finishVarianceDays)}
          </td>
        </>
      )}
      <td className="px-1 py-1.5">
        <div className="flex justify-end opacity-0 group-hover:opacity-100">
          <Button size="icon-sm" variant="ghost" className="size-6 text-status-off-track" onClick={handleDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
