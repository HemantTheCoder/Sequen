"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Dependency, GanttRow, Project, Task } from "@/lib/types";
import { updateTask } from "@/lib/actions/schedule";

type Zoom = "day" | "week" | "month";
const PX_PER_DAY: Record<Zoom, number> = { day: 40, week: 14, month: 5 };
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 44;
const LABEL_WIDTH = 280;
const SETTLE_TRANSITION = "transition-[left,width] duration-150 ease-out";

function parseDate(d: string | null): Date | null {
  return d ? new Date(d + "T00:00:00") : null;
}

export function GanttChart({
  project,
  rows,
  dependencies,
}: {
  project: Project;
  rows: GanttRow[];
  dependencies: Dependency[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [zoom, setZoom] = useState<Zoom>("week");
  const pxPerDay = PX_PER_DAY[zoom];

  const taskRows = rows.filter((r): r is Extract<GanttRow, { kind: "task" }> => r.kind === "task");

  const { rangeStart, totalDays } = useMemo(() => {
    const dataDate = parseDate(project.data_date) ?? new Date();
    let min = dataDate;
    let max = addDays(dataDate, 30);
    for (const row of taskRows) {
      const s = parseDate(row.task.early_start);
      const f = parseDate(row.task.early_finish);
      const lf = parseDate(row.task.late_finish);
      if (s && s < min) min = s;
      if (f && f > max) max = f;
      if (lf && lf > max) max = lf;
    }
    min = addDays(min, -3);
    max = addDays(max, 5);
    return { rangeStart: min, totalDays: Math.max(1, differenceInCalendarDays(max, min)) };
  }, [project.data_date, taskRows]);

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") map.set(r.task.id, i);
    });
    return map;
  }, [rows]);

  function dayOffset(d: Date) {
    return differenceInCalendarDays(d, rangeStart);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  const gridWidth = totalDays * pxPerDay;
  const ticks = useMemo(() => buildTicks(rangeStart, totalDays, zoom), [rangeStart, totalDays, zoom]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm text-muted-foreground">
          Drag a bar to reschedule its start, or drag the right edge to change its duration.
        </p>
        <div className="flex items-center gap-1">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zoom === z ? "default" : "outline"}
              onClick={() => setZoom(z)}
              className="capitalize"
            >
              {z}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-auto">
        <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-background" style={{ width: LABEL_WIDTH }}>
          <div className="border-b border-border" style={{ height: HEADER_HEIGHT }} />
          {rows.map((row) => (
            <div
              key={row.kind === "wbs" ? row.node.id : row.task.id}
              className={cn(
                "flex items-center truncate border-b border-border px-2 text-xs",
                row.kind === "wbs" && "bg-card font-medium",
              )}
              style={{ height: ROW_HEIGHT, paddingLeft: 8 + row.depth * 14 }}
              title={row.kind === "wbs" ? row.node.name : row.task.name}
            >
              {row.kind === "wbs" ? row.node.name : row.task.name}
            </div>
          ))}
        </div>

        <div className="relative" style={{ width: gridWidth }}>
          {/* Header: graph-paper date scale */}
          <div className="sticky top-0 z-10 border-b border-border bg-background" style={{ height: HEADER_HEIGHT }}>
            {ticks.map((tick) => (
              <div
                key={tick.offset}
                className="absolute top-0 h-full border-l border-rule font-mono text-[11px] text-muted-foreground"
                style={{ left: tick.offset * pxPerDay }}
              >
                <span className="ml-1">{tick.label}</span>
              </div>
            ))}
          </div>

          {/* Grid + rows */}
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {ticks.map((tick) => (
              <div
                key={tick.offset}
                className="absolute top-0 bottom-0 border-l border-rule"
                style={{ left: tick.offset * pxPerDay }}
              />
            ))}
            {rows.map((_, i) => (
              <div
                key={i}
                className="absolute w-full border-b border-border"
                style={{ top: (i + 1) * ROW_HEIGHT }}
              />
            ))}
            {/* data date line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/50"
              style={{ left: dayOffset(parseDate(project.data_date) ?? rangeStart) * pxPerDay }}
            />

            {rows.map((row, i) => {
              if (row.kind === "wbs") return null;
              return (
                <TaskBar
                  key={row.task.id}
                  task={row.task}
                  rowTop={i * ROW_HEIGHT}
                  projectId={project.id}
                  rangeStart={rangeStart}
                  pxPerDay={pxPerDay}
                  refresh={refresh}
                />
              );
            })}

            {/* Dependency arrows, drawn as right-angled dimension lines */}
            <svg className="pointer-events-none absolute inset-0" width={gridWidth} height={rows.length * ROW_HEIGHT}>
              <defs>
                <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="2.5" orient="auto">
                  <path d="M0,0 L5,2.5 L0,5" className="fill-none stroke-foreground" strokeWidth={1} />
                </marker>
              </defs>
              {dependencies.map((dep) => {
                const predRow = rowIndex.get(dep.predecessor_id);
                const succRow = rowIndex.get(dep.successor_id);
                if (predRow === undefined || succRow === undefined) return null;
                const predTask = taskRows.find((r) => r.task.id === dep.predecessor_id)?.task;
                const succTask = taskRows.find((r) => r.task.id === dep.successor_id)?.task;
                if (!predTask || !succTask) return null;
                const predStart = parseDate(predTask.early_start);
                const predFinish = parseDate(predTask.early_finish);
                const succStart = parseDate(succTask.early_start);
                const succFinish = parseDate(succTask.early_finish);
                if (!predStart || !predFinish || !succStart || !succFinish) return null;

                const fromX =
                  (dep.type === "SS" || dep.type === "SF" ? dayOffset(predStart) : dayOffset(predFinish)) * pxPerDay;
                const toX =
                  (dep.type === "FF" || dep.type === "SF" ? dayOffset(succFinish) : dayOffset(succStart)) * pxPerDay;
                const fromY = predRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                const toY = succRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                const midX = fromX + 10;

                return (
                  <g key={dep.id} className="stroke-foreground/60">
                    {/* anchor mark at the origin, like a dimension-line tie point */}
                    <circle cx={fromX} cy={fromY} r={1.5} className="fill-foreground/60 stroke-none" />
                    <path
                      d={`M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 6} ${toY}`}
                      className="fill-none"
                      strokeWidth={1}
                      markerEnd="url(#arrow)"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskBar({
  task,
  rowTop,
  projectId,
  rangeStart,
  pxPerDay,
  refresh,
}: {
  task: Task;
  rowTop: number;
  projectId: string;
  rangeStart: Date;
  pxPerDay: number;
  refresh: () => void;
}) {
  const [drag, setDrag] = useState<{
    mode: "move" | "resize";
    startClientX: number;
    originStart: Date;
    originDuration: number;
    deltaDays: number;
    settling: boolean;
  } | null>(null);

  // Once the server round-trip lands and props reflect the drop, drop the
  // manual override — the CSS transition covers any last-pixel correction
  // (e.g. a dependency constraint that didn't let it move as far as dragged).
  // Adjusted during render (React's recommended pattern) rather than in an
  // effect, since it's purely derived from a prop change.
  const syncKey = `${task.early_start}|${task.duration_days}|${task.constraint_start}`;
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    if (drag?.settling) setDrag(null);
  }

  function dayOffset(d: Date) {
    return differenceInCalendarDays(d, rangeStart);
  }

  function beginDrag(e: React.MouseEvent, mode: "move" | "resize", start: Date, duration: number) {
    e.preventDefault();
    e.stopPropagation();
    const origin = { startClientX: e.clientX, originStart: start, originDuration: duration };
    setDrag({ mode, ...origin, deltaDays: 0, settling: false });

    function onMove(ev: MouseEvent) {
      const deltaDays = Math.round((ev.clientX - origin.startClientX) / pxPerDay);
      setDrag({ mode, ...origin, deltaDays, settling: false });
    }
    async function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const deltaDays = Math.round((ev.clientX - origin.startClientX) / pxPerDay);
      if (deltaDays === 0) {
        setDrag(null);
        return;
      }
      // Freeze the dropped position (settling) while the server recalculates.
      setDrag({ mode, ...origin, deltaDays, settling: true });

      if (mode === "move") {
        const newStart = addDays(origin.originStart, deltaDays);
        await updateTask(projectId, task.id, { constraint_start: format(newStart, "yyyy-MM-dd") });
      } else {
        const newDuration = Math.max(0, origin.originDuration + deltaDays);
        await updateTask(projectId, task.id, { duration_days: newDuration });
      }
      refresh();
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const start = parseDate(task.early_start);
  const finish = parseDate(task.early_finish);
  const lateFinish = parseDate(task.late_finish);
  if (!start || !finish) return null;

  const isLive = drag !== null && !drag.settling;
  const previewDelta = drag?.deltaDays ?? 0;
  const barLeft = (dayOffset(start) + (drag?.mode === "move" ? previewDelta : 0)) * pxPerDay;
  const duration = drag?.mode === "resize" ? Math.max(0, task.duration_days + previewDelta) : task.duration_days;
  const barWidth = Math.max(task.is_milestone ? 0 : 6, duration * pxPerDay);

  const floatDays = task.total_float ?? 0;
  const ghostWidth = !task.is_critical && !task.is_milestone && floatDays > 0 ? floatDays * pxPerDay : 0;

  const transitionClass = isLive ? "" : SETTLE_TRANSITION;

  return (
    <div className="absolute w-full" style={{ top: rowTop, height: ROW_HEIGHT }}>
      {task.is_milestone ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onMouseDown={(e) => beginDrag(e, "move", start, task.duration_days)}
              className={cn(
                "absolute top-1/2 size-3 -translate-y-1/2 rotate-45 cursor-grab active:cursor-grabbing",
                transitionClass,
                task.is_critical ? "bg-critical" : "bg-status-at-risk",
              )}
              style={{ left: barLeft - 6 }}
            />
          </TooltipTrigger>
          <TooltipContent>{task.name} — {format(start, "MMM d")}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("absolute top-1.5 h-[18px]", transitionClass)} style={{ left: barLeft, width: barWidth + ghostWidth }}>
              {/* solid bar: early start to early finish */}
              <div
                onMouseDown={(e) => beginDrag(e, "move", start, task.duration_days)}
                className={cn(
                  "absolute left-0 top-0 flex h-full cursor-grab items-center overflow-hidden rounded-[2px] border",
                  task.is_critical
                    ? "border-critical bg-critical/85"
                    : "border-foreground/70 bg-foreground/80",
                )}
                style={{ width: barWidth }}
              >
                <div className="h-full bg-black/25" style={{ width: `${task.percent_complete}%` }} />
                <div
                  onMouseDown={(e) => beginDrag(e, "resize", start, task.duration_days)}
                  className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                />
              </div>
              {/* ghost float extension: available slack, drawn like a dimension hatch */}
              {ghostWidth > 0 && (
                <div
                  className="absolute top-0 h-full border-y border-r border-rule"
                  style={{
                    left: barWidth,
                    width: ghostWidth,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, var(--rule) 0px, var(--rule) 1px, transparent 1px, transparent 6px)",
                  }}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-medium">{task.name}</p>
              <p className="font-mono">
                {format(start, "MMM d")}–{format(finish, "MMM d")} ({task.duration_days}d)
              </p>
              <p>
                <span className="font-mono">{task.total_float ?? "—"}d</span> float
                {task.is_critical && <span className="text-critical"> — critical path</span>}
              </p>
              {lateFinish && ghostWidth > 0 && (
                <p className="text-muted-foreground">Can slip to {format(lateFinish, "MMM d")} without delay</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function buildTicks(rangeStart: Date, totalDays: number, zoom: Zoom) {
  const ticks: { offset: number; label: string }[] = [];
  if (zoom === "day") {
    for (let i = 0; i < totalDays; i++) {
      ticks.push({ offset: i, label: format(addDays(rangeStart, i), "d") });
    }
  } else if (zoom === "week") {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      if (d.getDay() === 1) ticks.push({ offset: i, label: format(d, "MMM d") });
    }
  } else {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      if (d.getDate() === 1) ticks.push({ offset: i, label: format(d, "MMM yyyy") });
    }
  }
  return ticks;
}
