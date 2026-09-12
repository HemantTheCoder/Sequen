import type { WbsTreeNode } from "@/lib/types";

export interface WbsEvmRollup {
  wbsId: string;
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  cpi: number | null;
  spi: number | null;
}

/**
 * Cost rollups are a straight sum over every descendant task, unlike the
 * date-variance rollups elsewhere in the app (which take a min/max span) —
 * money adds up across a branch the same way float doesn't.
 */
function sumDescendantTasks(node: WbsTreeNode, byTaskId: Map<string, number>): number {
  let sum = 0;
  for (const task of node.tasks) sum += byTaskId.get(task.id) ?? 0;
  for (const child of node.children) sum += sumDescendantTasks(child, byTaskId);
  return sum;
}

export function rollupWbsEvm(
  node: WbsTreeNode,
  pvByTaskId: Map<string, number>,
  evByTaskId: Map<string, number>,
  acByTaskId: Map<string, number>,
  bacByTaskId: Map<string, number>,
): WbsEvmRollup {
  const pv = sumDescendantTasks(node, pvByTaskId);
  const ev = sumDescendantTasks(node, evByTaskId);
  const ac = sumDescendantTasks(node, acByTaskId);
  const bac = sumDescendantTasks(node, bacByTaskId);
  return {
    wbsId: node.id,
    pv,
    ev,
    ac,
    bac,
    cpi: ac === 0 ? null : ev / ac,
    spi: pv === 0 ? null : ev / pv,
  };
}
