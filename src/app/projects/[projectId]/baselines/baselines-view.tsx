"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
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
import { fmtDate } from "@/lib/format";
import { createBaseline, setActiveBaseline, updateVarianceThreshold } from "@/lib/actions/baseline";

interface Baseline {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
}

export function BaselinesView({
  projectId,
  thresholdPercent,
  baselines,
}: {
  projectId: string;
  thresholdPercent: number;
  baselines: Baseline[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(String(thresholdPercent));

  function refresh() {
    router.refresh();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createBaseline(projectId, name.trim());
      toast.success(`Baseline "${name.trim()}" created and set active`);
      setName("");
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create baseline");
    } finally {
      setCreating(false);
    }
  }

  async function handleSetActive(baselineId: string) {
    setBusyId(baselineId);
    try {
      await setActiveBaseline(projectId, baselineId);
      toast.success("Active baseline updated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set active baseline");
    } finally {
      setBusyId(null);
    }
  }

  async function handleThresholdBlur() {
    const n = Math.max(0, Math.min(100, Number(threshold)));
    if (Number.isFinite(n) && n !== thresholdPercent) {
      await updateVarianceThreshold(projectId, n);
      toast.success("Saved");
      refresh();
    } else {
      setThreshold(String(thresholdPercent));
    }
  }

  return (
    <div className="w-full max-w-3xl flex-1 space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Baselines</CardTitle>
            <CardDescription>
              A baseline freezes the current schedule so later progress can be measured against it.
              The active baseline drives variance shown in the schedule and Gantt.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Camera className="size-4" />
                Create baseline
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Create baseline</DialogTitle>
                  <DialogDescription>
                    Snapshots every task&apos;s current dates, duration, and dependencies. This becomes
                    the active baseline; earlier ones are kept, not deleted.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    autoFocus
                    placeholder="e.g. Approved baseline, Rev 2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || !name.trim()}>
                    {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                    {creating ? "Snapshotting…" : "Create baseline"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {baselines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No baselines yet. Create one to start tracking schedule variance.
            </p>
          ) : (
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[45%]" />
                <col className="w-[25%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Name</th>
                  <th className="py-1.5 pr-2 font-medium">Created</th>
                  <th className="py-1.5 pr-2 font-medium">Status</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {baselines.map((b) => (
                  <tr key={b.id} className="border-b border-border">
                    <td className="truncate py-1.5 pr-2 font-medium" title={b.name}>{b.name}</td>
                    <td className="py-1.5 pr-2 font-mono text-muted-foreground">{fmtDate(b.created_at.slice(0, 10))}</td>
                    <td className="py-1.5 pr-2">
                      {b.is_active && (
                        <Badge className="border-status-on-track bg-status-on-track/15 font-sans text-status-on-track">
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5">
                      {!b.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === b.id}
                          onClick={() => handleSetActive(b.id)}
                        >
                          {busyId === b.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Set as active
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variance threshold</CardTitle>
          <CardDescription>
            How late a task can run, as a percent of its own duration, before it&apos;s shown as
            off-track rather than merely at-risk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={handleThresholdBlur}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-20 font-mono"
            />
            <span className="text-sm text-muted-foreground">% of task duration</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
