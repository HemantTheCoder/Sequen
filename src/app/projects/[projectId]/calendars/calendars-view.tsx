"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  addDays as dateFnsAddDays,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  applyCalendarExceptionRange,
  clearCalendarException,
  createCalendar,
  deleteCalendar,
  setCalendarException,
  setDefaultCalendar,
  updateCalendar,
} from "@/lib/actions/calendars";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarRow {
  id: string;
  name: string;
  working_days: unknown;
  is_default: boolean;
  hours_per_day: number;
}

interface ExceptionRow {
  id: string;
  calendar_id: string;
  date: string;
  is_working: boolean;
  note: string | null;
}

function daysOf(row: CalendarRow): number[] {
  return Array.isArray(row.working_days) ? (row.working_days as number[]) : [1, 2, 3, 4, 5];
}

export function CalendarsView({
  projectId,
  calendars,
  exceptions,
}: {
  projectId: string;
  calendars: CalendarRow[];
  exceptions: ExceptionRow[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [newHoursPerDay, setNewHoursPerDay] = useState("8");
  const [creating, setCreating] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(calendars[0]?.id ?? null);

  function refresh() {
    router.refresh();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createCalendar(projectId, newName.trim(), [...newDays].sort(), Number(newHoursPerDay) || 8);
      toast.success(`Calendar "${newName.trim()}" created`);
      setNewName("");
      setNewDays([1, 2, 3, 4, 5]);
      setNewHoursPerDay("8");
      setCreateOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create calendar");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleWorkingDay(row: CalendarRow, day: number) {
    const current = daysOf(row);
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    await updateCalendar(projectId, row.id, { working_days: next });
    refresh();
  }

  async function handleUpdateHoursPerDay(row: CalendarRow, hoursPerDay: number) {
    if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) return;
    await updateCalendar(projectId, row.id, { hours_per_day: hoursPerDay });
    refresh();
  }

  async function handleSetDefault(id: string) {
    await setDefaultCalendar(projectId, id);
    toast.success("Default calendar updated");
    refresh();
  }

  async function handleDelete(row: CalendarRow) {
    if (!confirm(`Delete calendar "${row.name}"? Tasks and resources using it fall back to the project default.`)) return;
    await deleteCalendar(projectId, row.id);
    if (selectedCalendarId === row.id) setSelectedCalendarId(null);
    toast.success("Calendar deleted");
    refresh();
  }

  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId) ?? null;

  return (
    <div className="w-full max-w-3xl flex-1 space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Calendars</CardTitle>
            <CardDescription>
              Working-day patterns tasks and resources can use instead of the project&apos;s
              implicit Mon–Fri week. A task or resource with no calendar set inherits the
              project default (marked with a star).
            </CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                New calendar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>New calendar</DialogTitle>
                  <DialogDescription>Name it and pick which weekdays count as working days.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  <Input
                    autoFocus
                    placeholder="e.g. 6-day construction week"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <div className="flex gap-1">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setNewDays((prev) =>
                            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
                          )
                        }
                        className={cn(
                          "h-8 flex-1 rounded-[2px] border text-xs font-medium",
                          newDays.includes(day)
                            ? "border-foreground bg-foreground text-background"
                            : "border-input text-muted-foreground",
                        )}
                      >
                        {label[0]}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Hours per working day</label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={newHoursPerDay}
                      onChange={(e) => setNewHoursPerDay(e.target.value)}
                      className="h-8 w-16 font-mono"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || !newName.trim()}>
                    {creating ? "Creating…" : "Create calendar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calendars yet — the project runs on an implicit Mon–Fri week. Create one to
              model a different working pattern.
            </p>
          ) : (
            calendars.map((row) => {
              const days = daysOf(row);
              return (
                <div
                  key={row.id}
                  className={cn(
                    "flex items-center gap-3 rounded-[2px] border border-border px-3 py-2",
                    selectedCalendarId === row.id && "bg-accent/40",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                    onClick={() => setSelectedCalendarId(row.id)}
                    title="Select to edit holiday exceptions"
                  >
                    {row.name}
                  </button>
                  {row.is_default && (
                    <Badge className="border-status-on-track bg-status-on-track/15 font-sans text-status-on-track">
                      Default
                    </Badge>
                  )}
                  <div className="flex gap-0.5">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        title={label}
                        onClick={() => handleToggleWorkingDay(row, day)}
                        className={cn(
                          "size-6 rounded-[2px] border text-[10px] font-medium",
                          days.includes(day)
                            ? "border-foreground bg-foreground text-background"
                            : "border-input text-muted-foreground",
                        )}
                      >
                        {label[0]}
                      </button>
                    ))}
                  </div>
                  <HoursPerDayInput row={row} onCommit={(hours) => handleUpdateHoursPerDay(row, hours)} />
                  {!row.is_default && (
                    <Button size="icon-sm" variant="ghost" title="Set as project default" onClick={() => handleSetDefault(row.id)}>
                      <Star className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-status-off-track"
                    title="Delete calendar"
                    onClick={() => handleDelete(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {calendars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Holidays &amp; exceptions</CardTitle>
            <CardDescription>
              Click a date to override that calendar&apos;s usual pattern for just that day — mark
              a working day as a holiday, or an off day as a catch-up shift. Click again to clear it.
            </CardDescription>
            <select
              value={selectedCalendarId ?? ""}
              onChange={(e) => setSelectedCalendarId(e.target.value || null)}
              className="mt-2 h-8 w-64 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">Select a calendar…</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedCalendar ? (
              <>
                <RangeExceptionForm projectId={projectId} calendars={calendars} selectedCalendarId={selectedCalendar.id} onChanged={refresh} />
                <ExceptionCalendar
                  projectId={projectId}
                  calendar={selectedCalendar}
                  exceptions={exceptions.filter((e) => e.calendar_id === selectedCalendar.id)}
                  onChanged={refresh}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a calendar above to edit its exception dates.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HoursPerDayInput({ row, onCommit }: { row: CalendarRow; onCommit: (hours: number) => void }) {
  const [value, setValue] = useState(String(row.hours_per_day));

  function commit() {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && n !== row.hours_per_day) {
      onCommit(n);
    } else {
      setValue(String(row.hours_per_day));
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1" title="Hours worked per working day (used for cost calculations)">
      <Input
        type="number"
        min={1}
        max={24}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 w-12 px-1.5 font-mono text-xs"
      />
      <span className="text-xs text-muted-foreground">hrs/day</span>
    </div>
  );
}

function RangeExceptionForm({
  projectId,
  calendars,
  selectedCalendarId,
  onChanged,
}: {
  projectId: string;
  calendars: CalendarRow[];
  selectedCalendarId: string;
  onChanged: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [kind, setKind] = useState<"holiday" | "working">("holiday");
  const [note, setNote] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || endDate < startDate) {
      toast.error("Pick a valid start and end date");
      return;
    }
    setBusy(true);
    try {
      const calendarIds = applyToAll ? calendars.map((c) => c.id) : [selectedCalendarId];
      await applyCalendarExceptionRange(projectId, calendarIds, startDate, endDate, kind === "working", note.trim() || null);
      toast.success(
        startDate === endDate
          ? `${kind === "holiday" ? "Holiday" : "Working day"} set for ${startDate}${applyToAll ? " on every calendar" : ""}`
          : `${kind === "holiday" ? "Holiday" : "Working day"} range applied${applyToAll ? " to every calendar" : ""}`,
      );
      setNote("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply exception range");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleApply} className="space-y-2 rounded-[2px] border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Block off a range at once — e.g. a multi-day holiday</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-8 w-36 text-xs"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-8 w-36 text-xs"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "holiday" | "working")}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="holiday">Holiday (off)</option>
          <option value="working">Catch-up (working)</option>
        </select>
        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8 w-40 text-xs"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Applying…" : "Apply"}
        </Button>
      </div>
      {calendars.length > 1 && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="size-3.5"
          />
          Apply to all {calendars.length} calendars, not just the selected one
        </label>
      )}
    </form>
  );
}

function ExceptionCalendar({
  projectId,
  calendar,
  exceptions,
  onChanged,
}: {
  projectId: string;
  calendar: CalendarRow;
  exceptions: ExceptionRow[];
  onChanged: () => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const naturalDays = daysOf(calendar);
  const exceptionByDate = useMemo(() => new Map(exceptions.map((e) => [e.date, e])), [exceptions]);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfMonth(month);
  const cells: Date[] = [];
  for (let d = gridStart; d <= gridEnd || cells.length % 7 !== 0; d = dateFnsAddDays(d, 1)) {
    cells.push(d);
  }

  async function handleToggle(date: Date) {
    const key = format(date, "yyyy-MM-dd");
    const natural = naturalDays.includes(date.getDay());
    const existing = exceptionByDate.get(key);
    if (existing) {
      await clearCalendarException(projectId, calendar.id, key);
    } else {
      await setCalendarException(projectId, calendar.id, key, !natural);
    }
    onChanged();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((label) => (
          <div key={label} className="text-[10px] font-medium text-muted-foreground">{label}</div>
        ))}
        {cells.map((date) => {
          const inMonth = date.getMonth() === month.getMonth();
          const key = format(date, "yyyy-MM-dd");
          const exception = exceptionByDate.get(key);
          const natural = naturalDays.includes(date.getDay());
          const isWorking = exception ? exception.is_working : natural;
          return (
            <button
              key={key}
              type="button"
              disabled={!inMonth}
              onClick={() => handleToggle(date)}
              title={exception ? (exception.is_working ? "Catch-up shift — click to clear" : "Holiday — click to clear") : undefined}
              className={cn(
                "flex h-9 flex-col items-center justify-center rounded-[2px] border font-mono text-xs",
                !inMonth && "opacity-0",
                exception
                  ? isWorking
                    ? "border-status-on-track bg-status-on-track/15 text-status-on-track"
                    : "border-status-off-track bg-status-off-track/15 text-status-off-track"
                  : isWorking
                    ? "border-border text-foreground"
                    : "border-transparent text-muted-foreground",
              )}
            >
              {format(date, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
