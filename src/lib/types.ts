import { Tables } from "@/lib/supabase/database.types";

export type Project = Tables<"projects">;
export type WbsNode = Tables<"wbs_nodes">;
export type Task = Tables<"tasks">;
export type Dependency = Tables<"dependencies">;
export type Resource = Tables<"resources">;
export type TaskResource = Tables<"task_resources">;
export type Calendar = Tables<"calendars">;
export type CalendarException = Tables<"calendar_exceptions">;

export interface WbsTreeNode extends WbsNode {
  children: WbsTreeNode[];
  tasks: Task[];
}

export type GanttRow =
  | { kind: "wbs"; depth: number; node: WbsTreeNode }
  | { kind: "task"; depth: number; task: Task };

/** Flattens the WBS tree depth-first (WBS row, then its tasks, then its children) for row-synced Gantt rendering. */
export function flattenForGantt(tree: WbsTreeNode[], unassignedTasks: Task[]): GanttRow[] {
  const rows: GanttRow[] = [];
  function visit(node: WbsTreeNode, depth: number) {
    rows.push({ kind: "wbs", depth, node });
    for (const task of node.tasks) rows.push({ kind: "task", depth: depth + 1, task });
    for (const child of node.children) visit(child, depth + 1);
  }
  for (const node of tree) visit(node, 0);
  for (const task of unassignedTasks) rows.push({ kind: "task", depth: 0, task });
  return rows;
}

export function buildWbsTree(nodes: WbsNode[], tasks: Task[]): WbsTreeNode[] {
  const byId = new Map<string, WbsTreeNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [], tasks: [] });
  }

  const roots: WbsTreeNode[] = [];
  for (const node of nodes) {
    const treeNode = byId.get(node.id)!;
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  for (const list of [roots, ...Array.from(byId.values()).map((n) => n.children)]) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  for (const task of tasks) {
    if (task.wbs_id && byId.has(task.wbs_id)) {
      byId.get(task.wbs_id)!.tasks.push(task);
    }
  }
  for (const node of byId.values()) {
    node.tasks.sort((a, b) => a.sort_order - b.sort_order);
  }

  return roots;
}
