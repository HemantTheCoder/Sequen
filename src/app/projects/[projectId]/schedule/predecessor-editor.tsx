"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import type { Dependency, Task } from "@/lib/types";
import type { DependencyType } from "@/lib/cpm/types";
import { createDependency, deleteDependency } from "@/lib/actions/schedule";
import { toast } from "sonner";

const TYPES: DependencyType[] = ["FS", "SS", "FF", "SF"];

export function PredecessorEditor({
  projectId,
  task,
  allTasks,
  predecessorLinks,
  onChanged,
}: {
  projectId: string;
  task: Task;
  allTasks: Task[];
  predecessorLinks: Dependency[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [type, setType] = useState<DependencyType>("FS");
  const [lag, setLag] = useState("0");

  const linkedIds = new Set(predecessorLinks.map((d) => d.predecessor_id));
  const candidates = allTasks.filter((t) => t.id !== task.id && !linkedIds.has(t.id));

  async function handleAdd() {
    if (!pendingId) return;
    try {
      await createDependency(projectId, pendingId, task.id, type, Number(lag) || 0);
      setPendingId("");
      setLag("0");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add dependency");
    }
  }

  async function handleRemove(id: string) {
    await deleteDependency(projectId, id);
    onChanged();
  }

  const summary = predecessorLinks
    .map((d) => allTasks.find((t) => t.id === d.predecessor_id)?.name ?? "?")
    .join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-6 w-full truncate rounded px-1.5 text-left text-xs hover:bg-muted"
          title={summary || "No predecessors"}
        >
          {predecessorLinks.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            summary
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Predecessors of &ldquo;{task.name}&rdquo;
        </p>
        <div className="mb-3 space-y-1.5">
          {predecessorLinks.length === 0 && (
            <p className="text-xs text-muted-foreground">None yet.</p>
          )}
          {predecessorLinks.map((dep) => {
            const predTask = allTasks.find((t) => t.id === dep.predecessor_id);
            return (
              <div key={dep.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{predTask?.name ?? "Unknown task"}</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="font-mono">{dep.type}{dep.lag_days ? (dep.lag_days > 0 ? `+${dep.lag_days}` : dep.lag_days) : ""}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    onClick={() => handleRemove(dep.id)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 border-t pt-2">
          <select
            value={pendingId}
            onChange={(e) => setPendingId(e.target.value)}
            className="h-7 flex-1 rounded-md border border-input bg-transparent px-1.5 text-xs"
          >
            <option value="">Select task…</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DependencyType)}
            className="h-7 w-14 rounded-md border border-input bg-transparent px-1 text-xs"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={lag}
            onChange={(e) => setLag(e.target.value)}
            className="h-7 w-14 px-1.5 font-mono text-xs"
          />
          <Button size="icon" className="size-7 shrink-0" onClick={handleAdd} disabled={!pendingId}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
