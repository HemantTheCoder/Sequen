"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Milestone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { Dependency, Task, WbsNode } from "@/lib/types";
import { createTask, deleteTask, updateTask } from "@/lib/actions/schedule";
import { PredecessorEditor } from "./predecessor-editor";

export function TaskTable({
  projectId,
  scopeName,
  scopeWbsId,
  tasks,
  allTasks,
  dependencies,
  wbsNodes,
}: {
  projectId: string;
  scopeName: string;
  scopeWbsId: string | null;
  tasks: Task[];
  allTasks: Task[];
  dependencies: Dependency[];
  wbsNodes: WbsNode[];
}) {
  const router = useRouter();
  const wbsNameById = new Map(wbsNodes.map((w) => [w.id, w.name]));

  async function handleAddTask() {
    await createTask(projectId, scopeWbsId, "New task", tasks.length);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">{scopeName}</h2>
        <Button size="sm" variant="outline" onClick={handleAddTask}>
          <Plus className="size-4" />
          Add task
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className={scopeWbsId === null ? "w-[26%]" : "w-[34%]"} />
            {scopeWbsId === null && <col className="w-[14%]" />}
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-[18%]" />
            <col className="w-16" />
            <col className="w-10" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Name</th>
              {scopeWbsId === null && <th className="px-3 py-2 font-medium">Section</th>}
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 font-medium">Finish</th>
              <th className="px-3 py-2 font-medium">% done</th>
              <th className="px-3 py-2 font-medium">Predecessors</th>
              <th className="px-3 py-2 font-medium">Float</th>
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
                refresh={() => router.refresh()}
              />
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
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
  refresh,
}: {
  task: Task;
  projectId: string;
  allTasks: Task[];
  dependencies: Dependency[];
  sectionName: string;
  showSection: boolean;
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
        task.is_critical && "border-l-[3px] border-l-critical",
      )}
    >
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
