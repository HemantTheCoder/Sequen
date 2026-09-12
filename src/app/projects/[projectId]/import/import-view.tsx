"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { differenceInCalendarDays } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import { MAPPING_FIELDS, type ColumnMapping } from "@/lib/ai/column-mapping";
import { importParsedTasks, type ImportRow } from "@/lib/actions/import-tasks";
import { toast } from "sonner";

interface ParsedRow {
  name: string;
  durationDays: number | null;
  isEstimated: boolean;
  percentComplete: number;
  predecessorNames: string[];
  wbsSectionName: string | null;
}

const EMPTY_MAPPING: ColumnMapping = {
  taskNameColumn: -1,
  durationColumn: -1,
  startDateColumn: -1,
  endDateColumn: -1,
  percentCompleteColumn: -1,
  predecessorsColumn: -1,
  wbsSectionColumn: -1,
};

export function ImportView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [mapLoading, setMapLoading] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [importing, setImporting] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows(null);
    setMapping(EMPTY_MAPPING);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, blankrows: false });
      if (grid.length === 0) return;
      const [headerRow, ...dataRows] = grid;
      setHeaders(headerRow.map((h) => String(h ?? "").trim()));
      setRawRows(dataRows.map((r) => headerRow.map((_, i) => String(r[i] ?? "").trim())));
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleAutoMap() {
    setMapLoading(true);
    try {
      const res = await fetch("/api/ai/map-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, sampleRows: rawRows.slice(0, 5) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mapping failed");
      setMapping(data.mapping);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI column mapping failed");
    } finally {
      setMapLoading(false);
    }
  }

  function col(row: string[], index: number): string {
    return index >= 0 ? (row[index] ?? "").trim() : "";
  }

  async function handleBuildPreview() {
    if (mapping.taskNameColumn < 0) {
      toast.error("Map a task name column first");
      return;
    }

    const parsed: ParsedRow[] = rawRows
      .map((row) => {
        const name = col(row, mapping.taskNameColumn);
        if (!name) return null;

        let duration: number | null = null;
        const durationRaw = col(row, mapping.durationColumn);
        if (durationRaw && !Number.isNaN(Number(durationRaw))) {
          duration = Math.max(0, Math.round(Number(durationRaw)));
        } else {
          const startRaw = col(row, mapping.startDateColumn);
          const endRaw = col(row, mapping.endDateColumn);
          const start = startRaw ? new Date(startRaw) : null;
          const end = endRaw ? new Date(endRaw) : null;
          if (start && end && !Number.isNaN(+start) && !Number.isNaN(+end)) {
            duration = Math.max(0, differenceInCalendarDays(end, start));
          }
        }

        const percentRaw = col(row, mapping.percentCompleteColumn);
        const percentComplete = percentRaw ? Math.max(0, Math.min(100, Math.round(Number(percentRaw) || 0))) : 0;

        const predRaw = col(row, mapping.predecessorsColumn);
        const predecessorNames = predRaw
          ? predRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
          : [];

        const wbsSectionName = col(row, mapping.wbsSectionColumn) || null;

        const parsedRow: ParsedRow = {
          name,
          durationDays: duration,
          isEstimated: false,
          percentComplete,
          predecessorNames,
          wbsSectionName,
        };
        return parsedRow;
      })
      .filter((r): r is ParsedRow => r !== null);

    const needsEstimate = parsed
      .map((r, i) => ({ rowIndex: i, taskName: r.name }))
      .filter((r) => parsed[r.rowIndex].durationDays === null);

    if (needsEstimate.length > 0) {
      setEstimating(true);
      try {
        const res = await fetch("/api/ai/estimate-durations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: needsEstimate }),
        });
        const data = await res.json();
        if (res.ok) {
          for (const est of data.estimates as { rowIndex: number; durationDays: number }[]) {
            if (parsed[est.rowIndex]) {
              parsed[est.rowIndex].durationDays = est.durationDays;
              parsed[est.rowIndex].isEstimated = true;
            }
          }
        }
      } catch {
        // AI estimation is best-effort; rows without it just default to 1 day below.
      } finally {
        setEstimating(false);
      }
    }

    for (const r of parsed) {
      if (r.durationDays === null) {
        r.durationDays = 1;
        r.isEstimated = true;
      }
    }

    setRows(parsed);
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);
    try {
      const payload: ImportRow[] = rows.map((r) => ({
        name: r.name,
        durationDays: r.durationDays!,
        percentComplete: r.percentComplete,
        predecessorNames: r.predecessorNames,
        wbsSectionName: r.wbsSectionName,
      }));
      const defaultSection = fileName ? fileName.replace(/\.[^.]+$/, "") : "Imported tasks";
      const result = await importParsedTasks(projectId, payload, defaultSection);
      if (result.unresolvedPredecessors.length > 0) {
        toast.warning(`Imported, but couldn't resolve ${result.unresolvedPredecessors.length} predecessor reference(s).`);
      } else {
        toast.success(`Imported ${result.imported} tasks.`);
      }
      router.push(`/projects/${projectId}/schedule`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="w-full max-w-4xl flex-1 space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4" />
            Import from Excel / CSV
          </CardTitle>
          <CardDescription>
            Upload a task list. The AI will map messy or non-standard columns to the schedule fields automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="text-sm"
          />

          {headers.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleAutoMap} disabled={mapLoading}>
                  {mapLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {mapLoading ? "Mapping…" : "Auto-map with AI"}
                </Button>
                <span className="text-xs text-muted-foreground">{rawRows.length} rows detected</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MAPPING_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                    <select
                      value={mapping[field.key]}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [field.key]: Number(e.target.value) }))
                      }
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value={-1}>None</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <Button onClick={handleBuildPreview} disabled={estimating}>
                {estimating ? <Loader2 className="size-4 animate-spin" /> : null}
                {estimating ? "Estimating missing durations…" : "Preview import"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview ({rows.length} tasks)</CardTitle>
            <CardDescription>Review before committing — AI-estimated durations are flagged.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-96 overflow-auto border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-2 py-1.5">Name</th>
                    <th className="px-2 py-1.5">Duration</th>
                    <th className="px-2 py-1.5">% done</th>
                    <th className="px-2 py-1.5">Predecessors</th>
                    <th className="px-2 py-1.5">Section</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 font-mono">
                        {r.durationDays}d
                        {r.isEstimated && (
                          <Badge className="ml-1.5 h-4 border-status-at-risk bg-status-at-risk/15 px-1 font-sans text-[10px] text-status-at-risk">
                            AI estimate
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono">{r.percentComplete}%</td>
                      <td className="px-2 py-1 text-muted-foreground">{r.predecessorNames.join(", ") || "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{r.wbsSectionName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? <Loader2 className="size-4 animate-spin" /> : null}
              {importing ? "Importing…" : `Import ${rows.length} tasks`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
