"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Loader2, Milestone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dependency, Project, Task } from "@/lib/types";
import type { AiScheduleDraft } from "@/lib/ai/schedule-draft";
import { runRuleBasedRiskChecks, type RiskFlag } from "@/lib/risk";
import { importScheduleDraft } from "@/lib/actions/ai-import";
import { toast } from "sonner";

interface AssignmentRow {
  id: string;
  allocation_percent: number;
  task: { id: string; name: string; early_start: string | null; early_finish: string | null };
  resource: { id: string; name: string } | null;
}

export function AiAssistantView({
  project,
  tasks,
  dependencies,
  assignments,
}: {
  project: Project;
  tasks: Task[];
  dependencies: Dependency[];
  assignments: AssignmentRow[];
}) {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">
      <ScheduleGenerator project={project} />
      <RiskChecker tasks={tasks} dependencies={dependencies} assignments={assignments} />
    </div>
  );
}

function ScheduleGenerator({ project }: { project: Project }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<AiScheduleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const taskCount = useMemo(
    () => draft?.wbs.reduce((n, s) => n + s.tasks.length, 0) ?? 0,
    [draft],
  );

  async function handleGenerate() {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/ai/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!draft) return;
    setImporting(true);
    try {
      const result = await importScheduleDraft(project.id, draft);
      if (!result.ok) {
        toast.error(`Imported, but couldn't fully calculate the schedule: ${result.error}`);
      } else {
        toast.success(`Imported ${taskCount} tasks.`);
      }
      setDraft(null);
      setDescription("");
      router.push(`/projects/${project.id}/schedule`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Generate a schedule
        </CardTitle>
        <CardDescription>
          Describe the project and the AI will draft a WBS, tasks, durations and dependencies for you to review before importing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Build me a schedule for a 3-storey RCC residential building, ~15,000 sq ft, standard foundation."
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-transparent p-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={loading || !description.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Drafting…" : "Generate draft"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {draft && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Draft: {draft.wbs.length} sections, {taskCount} tasks
              </p>
              <Button size="sm" onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : null}
                {importing ? "Importing…" : "Import into project"}
              </Button>
            </div>
            <div className="max-h-96 space-y-3 overflow-auto">
              {draft.wbs.map((section, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{section.name}</p>
                  <ul className="mt-1 space-y-0.5 pl-4 text-sm text-muted-foreground">
                    {section.tasks.map((t) => (
                      <li key={t.key} className="flex items-center gap-1.5">
                        {t.isMilestone && <Milestone className="size-3 text-amber-600" />}
                        <span>{t.name}</span>
                        <span className="text-xs">({t.durationDays}d)</span>
                        {t.isEstimated && (
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">AI estimate</Badge>
                        )}
                        {t.dependencies.length > 0 && (
                          <span className="text-xs">
                            · after {t.dependencies.map((d) => d.dependsOnKey).join(", ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiskChecker({
  tasks,
  dependencies,
  assignments,
}: {
  tasks: Task[];
  dependencies: Dependency[];
  assignments: AssignmentRow[];
}) {
  const [flags, setFlags] = useState<RiskFlag[] | null>(null);
  const [aiFlags, setAiFlags] = useState<RiskFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setAiError(null);

    const predecessorIds = new Set(dependencies.map((d) => d.successor_id));
    const successorIds = new Set(dependencies.map((d) => d.predecessor_id));

    const ruleFlags = runRuleBasedRiskChecks(
      tasks.map((t) => ({
        id: t.id,
        name: t.name,
        durationDays: Number(t.duration_days),
        isMilestone: t.is_milestone,
        earlyStart: t.early_start,
        earlyFinish: t.early_finish,
        hasPredecessors: predecessorIds.has(t.id),
        hasSuccessors: successorIds.has(t.id),
      })),
      assignments
        .filter((a) => a.resource)
        .map((a) => ({
          resourceId: a.resource!.id,
          resourceName: a.resource!.name,
          taskId: a.task.id,
          allocationPercent: a.allocation_percent,
          earlyStart: a.task.early_start,
          earlyFinish: a.task.early_finish,
        })),
    );
    setFlags(ruleFlags);

    try {
      const taskById = new Map(tasks.map((t) => [t.id, t.name]));
      const res = await fetch("/api/ai/risk-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: tasks.map((t) => ({ name: t.name, durationDays: Number(t.duration_days) })),
          dependencies: dependencies.map((d) => ({
            predecessorName: taskById.get(d.predecessor_id) ?? "?",
            successorName: taskById.get(d.successor_id) ?? "?",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI risk check failed");
      setAiFlags(
        (data.risks as { taskName: string; severity: RiskFlag["severity"]; message: string }[]).map((r) => ({
          severity: r.severity,
          category: "missing-dependency" as const,
          message: r.message,
        })),
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI risk check unavailable");
    } finally {
      setLoading(false);
    }
  }

  const allFlags = [...(flags ?? []), ...aiFlags];
  const severityOrder = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...allFlags].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4" />
          Risk check
        </CardTitle>
        <CardDescription>
          Checks for over-allocated resources, unrealistic durations, and dependencies that look missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" variant="outline" onClick={handleCheck} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? "Checking…" : "Run risk check"}
        </Button>

        {aiError && (
          <p className="text-xs text-muted-foreground">
            Rule-based checks ran; AI nuance pass unavailable ({aiError}).
          </p>
        )}

        {flags !== null && (
          <div className="space-y-1.5">
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground">No issues found.</p>
            )}
            {sorted.map((f, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded border px-2.5 py-1.5 text-sm",
                  f.severity === "high" && "border-red-300 bg-red-50 dark:bg-red-950/20",
                  f.severity === "medium" && "border-amber-300 bg-amber-50 dark:bg-amber-950/20",
                  f.severity === "low" && "border-border bg-muted/30",
                )}
              >
                <Badge
                  variant={f.severity === "high" ? "destructive" : "secondary"}
                  className="mt-0.5 shrink-0 text-[10px] capitalize"
                >
                  {f.severity}
                </Badge>
                <span>{f.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
