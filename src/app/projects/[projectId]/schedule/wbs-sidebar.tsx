"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WbsTreeNode } from "@/lib/types";
import { createWbsNode, deleteWbsNode, renameWbsNode } from "@/lib/actions/schedule";

export function WbsSidebar({
  projectId,
  tree,
  unassignedCount,
  selectedId,
  onSelect,
}: {
  projectId: string;
  tree: WbsTreeNode[];
  unassignedCount: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  async function handleAddRoot() {
    await createWbsNode(projectId, null, "New section", tree.length);
    refresh();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-sm font-medium">WBS</span>
        <Button size="icon-sm" variant="ghost" title="Add section" onClick={handleAddRoot}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center px-3 py-1.5 text-left text-sm",
            selectedId === null ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60",
          )}
        >
          All tasks
          {unassignedCount > 0 && (
            <span className="ml-auto font-mono text-xs text-muted-foreground">{unassignedCount}</span>
          )}
        </button>
        {tree.map((node) => (
          <WbsNodeRow
            key={node.id}
            node={node}
            depth={0}
            projectId={projectId}
            selectedId={selectedId}
            onSelect={onSelect}
            refresh={refresh}
          />
        ))}
        {tree.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No sections yet — add one to start organizing tasks.
          </p>
        )}
      </div>
    </aside>
  );
}

function countTasks(node: WbsTreeNode): number {
  return node.tasks.length + node.children.reduce((n, c) => n + countTasks(c), 0);
}

function WbsNodeRow({
  node,
  depth,
  projectId,
  selectedId,
  onSelect,
  refresh,
}: {
  node: WbsTreeNode;
  depth: number;
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);

  async function commitRename() {
    setEditing(false);
    if (name.trim() && name !== node.name) {
      await renameWbsNode(projectId, node.id, name.trim());
      refresh();
    } else {
      setName(node.name);
    }
  }

  async function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    await createWbsNode(projectId, node.id, "New section", node.children.length);
    refresh();
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${node.name}" and everything inside it?`)) return;
    if (selectedId === node.id) onSelect(null);
    await deleteWbsNode(projectId, node.id);
    refresh();
  }

  const taskCount = countTasks(node);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center py-1.5 pr-1.5 text-sm",
          selectedId === node.id ? "bg-accent font-medium" : "hover:bg-accent/60",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        {editing ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
            className="ml-1 h-6 py-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => setEditing(true)}
            className="ml-1 flex-1 truncate text-left"
          >
            {node.name}
          </button>
        )}
        {taskCount > 0 && !editing && (
          <span className="font-mono text-xs text-muted-foreground">{taskCount}</span>
        )}
        <div className="ml-1 hidden items-center group-hover:flex">
          <Button size="icon-xs" variant="ghost" title="Add sub-section" onClick={handleAddChild}>
            <Plus className="size-3" />
          </Button>
          <Button size="icon-xs" variant="ghost" className="text-status-off-track" title="Delete section" onClick={handleDelete}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <WbsNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            projectId={projectId}
            selectedId={selectedId}
            onSelect={onSelect}
            refresh={refresh}
          />
        ))}
    </div>
  );
}
