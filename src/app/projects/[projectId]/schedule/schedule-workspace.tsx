"use client";

import { useMemo, useState } from "react";
import { buildWbsTree, type Dependency, type Project, type Task, type WbsNode } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import type { ProjectVarianceData } from "@/lib/actions/variance";
import type { TaskEvmData } from "@/lib/actions/evm-lookup";
import { BaselinePicker } from "../baseline-picker";
import { WbsSidebar } from "./wbs-sidebar";
import { TaskTable } from "./task-table";

interface CalendarOption {
  id: string;
  name: string;
  is_default: boolean;
}

export function ScheduleWorkspace({
  project,
  wbsNodes,
  tasks,
  dependencies,
  calendars,
  varianceData,
  evmByTaskId,
}: {
  project: Project;
  wbsNodes: WbsNode[];
  tasks: Task[];
  dependencies: Dependency[];
  calendars: CalendarOption[];
  varianceData: ProjectVarianceData;
  evmByTaskId: Map<string, TaskEvmData>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tree = useMemo(() => buildWbsTree(wbsNodes, tasks), [wbsNodes, tasks]);
  const unassignedTasks = useMemo(() => tasks.filter((t) => !t.wbs_id), [tasks]);

  const scopedTasks = useMemo(() => {
    if (selectedId === null) return [...tasks].sort((a, b) => a.sort_order - b.sort_order);
    return tasks
      .filter((t) => t.wbs_id === selectedId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks, selectedId]);

  const scopeName = selectedId === null
    ? "All tasks"
    : wbsNodes.find((w) => w.id === selectedId)?.name ?? "Section";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Data date <span className="font-mono text-foreground">{fmtDate(project.data_date)}</span>
        </p>
        <BaselinePicker
          projectId={project.id}
          baselines={varianceData.baselines}
          selectedBaselineId={varianceData.selectedBaselineId}
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <WbsSidebar
          projectId={project.id}
          tree={tree}
          unassignedCount={unassignedTasks.length}
          selectedId={selectedId}
          onSelect={setSelectedId}
          wbsRollups={varianceData.variance ? varianceData.wbsRollups : null}
          thresholdPercent={varianceData.thresholdPercent}
        />
        <TaskTable
          projectId={project.id}
          scopeName={scopeName}
          scopeWbsId={selectedId}
          tasks={scopedTasks}
          allTasks={tasks}
          dependencies={dependencies}
          wbsNodes={wbsNodes}
          calendars={calendars}
          variance={varianceData.variance}
          thresholdPercent={varianceData.thresholdPercent}
          evmByTaskId={evmByTaskId}
        />
      </div>
    </div>
  );
}
