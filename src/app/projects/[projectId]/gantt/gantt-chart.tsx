"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Dependency, GanttRow, Project } from "@/lib/types";
import { updateTask } from "@/lib/actions/schedule";

type Zoom = "day" | "week" | "month";
const PX_PER_DAY: Record<Zoom, number> = { day: 40, week: 14, month: 5 };
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 44;
const LABEL_WIDTH = 280;

function parseDate(d: string | null): Date | null {
  return d ? new Date(d + "T00:00:00") : null;
}

interface DragState {
  taskId: string;
  mode: "move" | "resize";
  startClientX: number;
  originStart: Date;
  originDuration: number;
  deltaDays: number;
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
  const [drag, setDrag] = useState<DragState | null>(null);
  const pxPerDay = PX_PER_DAY[zoom];

  const taskRows = rows.filter((r): r is Extract<GanttRow, { kind: "task" }> => r.kind === "task");

  const { rangeStart, totalDays } = useMemo(() => {
    const dataDate = parseDate(project.data_date) ?? new Date();
    let min = dataDate;
    let max = addDays(dataDate, 30);
    for (const row of taskRows) {
      const s = parseDate(row.task.early_start);
      const f = parseDate(row.task.early_finish);
      if (s && s < min) min = s;
      if (f && f > max) max = f;
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

  function beginDrag(e: React.MouseEvent, taskId: string, mode: "move" | "resize", start: Date, duration: number) {
    e.preventDefault();
    e.stopPropagation();
    const state: DragState = {
      taskId,
      mode,
      startClientX: e.clientX,
      originStart: start,
      originDuration: duration,
      deltaDays: 0,
    };
    setDrag(state);

    function onMove(ev: MouseEvent) {
      const deltaDays = Math.round((ev.clientX - state.startClientX) / pxPerDay);
      setDrag({ ...state, deltaDays });
    }
    async function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const deltaDays = Math.round((ev.clientX - state.startClientX) / pxPerDay);
      setDrag(null);
      if (deltaDays === 0) return;

      if (mode === "move") {
        const newStart = addDays(state.originStart, deltaDays);
        await updateTask(project.id, taskId, {
          constraint_start: format(newStart, "yyyy-MM-dd"),
        });
      } else {
        const newDuration = Math.max(0, state.originDuration + deltaDays);
        await updateTask(project.id, taskId, { duration_days: newDuration });
      }
      refresh();
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const gridWidth = totalDays * pxPerDay;
  const monthTicks = useMemo(() => buildTicks(rangeStart, totalDays, zoom), [rangeStart, totalDays, zoom]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
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
        <div className="sticky left-0 z-20 shrink-0 border-r bg-background" style={{ width: LABEL_WIDTH }}>
          <div className="border-b" style={{ height: HEADER_HEIGHT }} />
          {rows.map((row) => (
            <div
              key={row.kind === "wbs" ? row.node.id : row.task.id}
              className={cn(
                "flex items-center truncate border-b px-2 text-xs",
                row.kind === "wbs" && "bg-muted/30 font-medium",
              )}
              style={{ height: ROW_HEIGHT, paddingLeft: 8 + row.depth * 14 }}
              title={row.kind === "wbs" ? row.node.name : row.task.name}
            >
              {row.kind === "wbs" ? row.node.name : row.task.name}
            </div>
          ))}
        </div>

        <div className="relative" style={{ width: gridWidth }}>
          {/* Header */}
          <div className="sticky top-0 z-10 border-b bg-background" style={{ height: HEADER_HEIGHT }}>
            {monthTicks.map((tick) => (
              <div
                key={tick.offset}
                className="absolute top-0 h-full border-l text-[11px] text-muted-foreground"
                style={{ left: tick.offset * pxPerDay }}
              >
                <span className="ml-1">{tick.label}</span>
              </div>
            ))}
          </div>

          {/* Grid + rows */}
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {monthTicks.map((tick) => (
              <div
                key={tick.offset}
                className="absolute top-0 bottom-0 border-l border-dashed border-border/60"
                style={{ left: tick.offset * pxPerDay }}
              />
            ))}
            {/* today / data date line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-blue-400"
              style={{ left: dayOffset(parseDate(project.data_date) ?? rangeStart) * pxPerDay }}
            />

            {rows.map((row, i) => {
              if (row.kind === "wbs") {
                return <div key={row.node.id} className="absolute w-full border-b" style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }} />;
              }

              const task = row.task;
              const start = parseDate(task.early_start);
              const finish = parseDate(task.early_finish);
              if (!start || !finish) {
                return <div key={task.id} className="absolute w-full border-b" style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }} />;
              }

              const isDragging = drag?.taskId === task.id;
              const previewDelta = isDragging ? drag!.deltaDays : 0;
              const barLeft = (dayOffset(start) + (drag?.mode === "move" ? previewDelta : 0)) * pxPerDay;
              const duration = drag?.mode === "resize" ? Math.max(0, task.duration_days + previewDelta) : task.duration_days;
              const barWidth = Math.max(task.is_milestone ? 0 : 6, duration * pxPerDay);

              return (
                <div key={task.id} className="absolute w-full border-b" style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}>
                  {task.is_milestone ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onMouseDown={(e) => beginDrag(e, task.id, "move", start, task.duration_days)}
                          className={cn(
                            "absolute top-1/2 size-3 -translate-y-1/2 rotate-45 cursor-grab active:cursor-grabbing",
                            task.is_critical ? "bg-red-500" : "bg-amber-500",
                          )}
                          style={{ left: barLeft - 6 }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{task.name} — {format(start, "MMM d")}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onMouseDown={(e) => beginDrag(e, task.id, "move", start, task.duration_days)}
                          className={cn(
                            "absolute top-1.5 flex h-[18px] cursor-grab items-center overflow-hidden rounded active:cursor-grabbing",
                            task.is_critical ? "bg-red-500/90" : "bg-blue-500/90",
                          )}
                          style={{ left: barLeft, width: barWidth }}
                        >
                          <div
                            className="h-full bg-black/25"
                            style={{ width: `${task.percent_complete}%` }}
                          />
                          <div
                            onMouseDown={(e) => beginDrag(e, task.id, "resize", start, task.duration_days)}
                            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <p className="font-medium">{task.name}</p>
                          <p>{format(start, "MMM d")} – {format(finish, "MMM d")} ({task.duration_days}d)</p>
                          <p>Float: {task.total_float ?? "—"}d {task.is_critical && "· critical"}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}

            {/* Dependency arrows */}
            <svg className="pointer-events-none absolute inset-0" width={gridWidth} height={rows.length * ROW_HEIGHT}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
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
                  <path
                    key={dep.id}
                    d={`M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 6} ${toY}`}
                    className="fill-none stroke-muted-foreground/70"
                    strokeWidth={1.5}
                    markerEnd="url(#arrow)"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>
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
