"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Trash2, Milestone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildWbsTree, type Dependency, type Project, type Task, type WbsNode, type WbsTreeNode } from "@/lib/types";
import {
  createTask,
  createWbsNode,
  deleteTask,
  deleteWbsNode,
  renameWbsNode,
  updateTask,
} from "@/lib/actions/schedule";
import { PredecessorEditor } from "./predecessor-editor";
import { fmtDate } from "@/lib/format";

export function Outline({
  project,
  wbsNodes,
  tasks,
  dependencies,
}: {
  project: Project;
  wbsNodes: WbsNode[];
  tasks: Task[];
  dependencies: Dependency[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Tracks explicitly *collapsed* nodes (rather than expanded ones) so any
  // WBS node created after mount still defaults to open.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const tree = useMemo(() => buildWbsTree(wbsNodes, tasks), [wbsNodes, tasks]);
  const unassignedTasks = useMemo(
    () => tasks.filter((t) => !t.wbs_id).sort((a, b) => a.sort_order - b.sort_order),
    [tasks],
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleAddRootWbs() {
    await createWbsNode(project.id, null, "New WBS section", wbsNodes.length);
    refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="text-sm text-muted-foreground">
          Data date: <span className="font-medium text-foreground">{fmtDate(project.data_date)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleAddRootWbs}>
          <Plus className="size-4" />
          Add WBS section
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-[32%] px-3 py-2 font-medium">Name</th>
              <th className="w-20 px-3 py-2 font-medium">Duration</th>
              <th className="w-24 px-3 py-2 font-medium">Start</th>
              <th className="w-24 px-3 py-2 font-medium">Finish</th>
              <th className="w-20 px-3 py-2 font-medium">% Done</th>
              <th className="w-28 px-3 py-2 font-medium">Predecessors</th>
              <th className="w-16 px-3 py-2 font-medium">Float</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {tree.map((node) => (
              <WbsRow
                key={node.id}
                node={node}
                depth={0}
                projectId={project.id}
                allTasks={tasks}
                dependencies={dependencies}
                collapsed={collapsed}
                toggle={toggle}
                refresh={refresh}
              />
            ))}
            {unassignedTasks.length > 0 && (
              <>
                <tr className="border-b bg-muted/40">
                  <td colSpan={8} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    Unassigned tasks
                  </td>
                </tr>
                {unassignedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    depth={1}
                    projectId={project.id}
                    allTasks={tasks}
                    dependencies={dependencies}
                    refresh={refresh}
                  />
                ))}
              </>
            )}
            {tree.length === 0 && unassignedTasks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  No WBS sections yet. Add one, or use the AI Assistant to draft a schedule.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WbsRow({
  node,
  depth,
  projectId,
  allTasks,
  dependencies,
  collapsed,
  toggle,
  refresh,
}: {
  node: WbsTreeNode;
  depth: number;
  projectId: string;
  allTasks: Task[];
  dependencies: Dependency[];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const isOpen = !collapsed.has(node.id);

  const descendantTasks = useMemo(() => collectTasks(node), [node]);
  const rollupStart = useMemo(
    () => minDate(descendantTasks.map((t) => t.early_start)),
    [descendantTasks],
  );
  const rollupFinish = useMemo(
    () => maxDate(descendantTasks.map((t) => t.early_finish)),
    [descendantTasks],
  );

  async function commitRename() {
    setEditing(false);
    if (name.trim() && name !== node.name) {
      await renameWbsNode(projectId, node.id, name.trim());
      refresh();
    } else {
      setName(node.name);
    }
  }

  async function handleAddChildWbs() {
    await createWbsNode(projectId, node.id, "New WBS section", node.children.length);
    refresh();
  }

  async function handleAddTask() {
    await createTask(projectId, node.id, "New task", node.tasks.length);
    refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${node.name}" and everything inside it?`)) return;
    await deleteWbsNode(projectId, node.id);
    refresh();
  }

  return (
    <>
      <tr className="group border-b bg-muted/20 hover:bg-muted/40">
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 18 }}>
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
            {editing ? (
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => e.key === "Enter" && commitRename()}
                className="h-6 py-0"
              />
            ) : (
              <span
                className="cursor-text truncate font-medium"
                onClick={() => setEditing(true)}
                title="Click to rename"
              >
                {node.name}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-1.5 text-muted-foreground">—</td>
        <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(rollupStart)}</td>
        <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(rollupFinish)}</td>
        <td className="px-3 py-1.5 text-muted-foreground">—</td>
        <td className="px-3 py-1.5 text-muted-foreground">—</td>
        <td className="px-3 py-1.5 text-muted-foreground">—</td>
        <td className="px-1 py-1.5">
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100">
            <Button size="icon" variant="ghost" className="size-6" title="Add task" onClick={handleAddTask}>
              <Plus className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" title="Add sub-section" onClick={handleAddChildWbs}>
              <ChevronRight className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6 text-destructive" title="Delete" onClick={handleDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {isOpen && (
        <>
          {node.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              depth={depth + 1}
              projectId={projectId}
              allTasks={allTasks}
              dependencies={dependencies}
              refresh={refresh}
            />
          ))}
          {node.children.map((child) => (
            <WbsRow
              key={child.id}
              node={child}
              depth={depth + 1}
              projectId={projectId}
              allTasks={allTasks}
              dependencies={dependencies}
              collapsed={collapsed}
              toggle={toggle}
              refresh={refresh}
            />
          ))}
        </>
      )}
    </>
  );
}

function TaskRow({
  task,
  depth,
  projectId,
  allTasks,
  dependencies,
  refresh,
}: {
  task: Task;
  depth: number;
  projectId: string;
  allTasks: Task[];
  dependencies: Dependency[];
  refresh: () => void;
}) {
  const [name, setName] = useState(task.name);
  const [duration, setDuration] = useState(String(task.duration_days));
  const [percent, setPercent] = useState(String(task.percent_complete));
  const preds = dependencies.filter((d) => d.successor_id === task.id);

  async function commitName() {
    if (name.trim() && name !== task.name) {
      await updateTask(projectId, task.id, { name: name.trim() });
      refresh();
    } else {
      setName(task.name);
    }
  }

  async function commitDuration() {
    const n = Number(duration);
    if (Number.isFinite(n) && n >= 0 && n !== task.duration_days) {
      await updateTask(projectId, task.id, { duration_days: n });
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
    <tr className={cn("group border-b hover:bg-muted/30", task.is_critical && "bg-red-50/60 dark:bg-red-950/20")}>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
          {task.is_milestone && <Milestone className="size-3.5 shrink-0 text-amber-600" />}
          {task.is_critical && (
            <span title="On the critical path" className="shrink-0">
              <AlertTriangle className="size-3.5 text-red-600" />
            </span>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-6 border-transparent bg-transparent py-0 hover:border-input focus:border-input"
          />
        </div>
      </td>
      <td className="px-3 py-1.5">
        <Input
          type="number"
          min={0}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-6 w-16 border-transparent bg-transparent py-0 hover:border-input focus:border-input"
        />
      </td>
      <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(task.start_date)}</td>
      <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(task.end_date)}</td>
      <td className="px-3 py-1.5">
        <Input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          onBlur={commitPercent}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-6 w-16 border-transparent bg-transparent py-0 hover:border-input focus:border-input"
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
      <td className="px-3 py-1.5">
        {task.total_float !== null ? (
          <Badge variant={task.is_critical ? "destructive" : "secondary"} className="font-mono text-[10px]">
            {task.total_float}d
          </Badge>
        ) : (
          "—"
        )}
      </td>
      <td className="px-1 py-1.5">
        <div className="flex justify-end opacity-0 group-hover:opacity-100">
          <Button size="icon" variant="ghost" className="size-6 text-destructive" onClick={handleDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function collectTasks(node: WbsTreeNode): Task[] {
  return [...node.tasks, ...node.children.flatMap(collectTasks)];
}

function minDate(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => !!d);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (a < b ? a : b));
}

function maxDate(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => !!d);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (a > b ? a : b));
}
