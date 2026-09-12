"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";
import { evmInterpretation, evmRatioColorClass, evmRatioStatus, fmtCurrency } from "@/lib/evm/format";
import type { WbsEvmRollup } from "@/lib/evm/rollup";
import type { EvmSCurvePoint, ProjectEvmData } from "@/lib/actions/evm-lookup";
import { updateStatusDate } from "@/lib/actions/evm";
import type { WbsTreeNode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EvmView({
  projectId,
  statusDate,
  tree,
  evmData,
}: {
  projectId: string;
  statusDate: string;
  tree: WbsTreeNode[];
  evmData: ProjectEvmData;
}) {
  const router = useRouter();
  const [date, setDate] = useState(statusDate);

  function refresh() {
    router.refresh();
  }

  async function handleDateChange(next: string) {
    setDate(next);
    if (!next) return;
    await updateStatusDate(projectId, next);
    toast.success("Status date updated");
    refresh();
  }

  const { summary } = evmData;

  return (
    <div className="w-full max-w-5xl flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium">Earned Value Management</h1>
          <p className="text-sm text-muted-foreground">
            {evmData.hasBaseline
              ? `Measured against "${evmData.baselineName}"`
              : "No active baseline — create one to enable EVM"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Status date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-8 w-40 font-mono text-sm"
          />
        </div>
      </div>

      {!evmData.hasBaseline ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Create a baseline first — EVM measures progress against a frozen plan.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="Planned Value" value={fmtCurrency(summary.pv)} />
            <MetricTile label="Earned Value" value={fmtCurrency(summary.ev)} />
            <MetricTile label="Actual Cost" value={fmtCurrency(summary.ac)} />
            <MetricTile label="Budget at Completion" value={fmtCurrency(summary.bac)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <RatioTile metric="cpi" ratio={summary.cpi} label="CPI — Cost Performance Index" />
            <RatioTile metric="spi" ratio={summary.spi} label="SPI — Schedule Performance Index" />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="Cost Variance" value={fmtCurrency(summary.cv)} tone={summary.cv >= 0 ? "good" : "bad"} />
            <MetricTile label="Schedule Variance" value={fmtCurrency(summary.sv)} tone={summary.sv >= 0 ? "good" : "bad"} />
            <MetricTile label="Estimate at Completion" value={fmtCurrency(summary.eac)} />
            <MetricTile label="Estimate to Complete" value={fmtCurrency(summary.etc)} />
          </div>

          {evmData.unbudgetedWork > 0 && (
            <p className="text-xs text-muted-foreground">
              Plus {fmtCurrency(evmData.unbudgetedWork)} of actual cost on tasks added since the baseline was
              taken — not counted toward EV against it.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">S-curve</CardTitle>
              <CardDescription>Cumulative planned, earned, and actual cost over the project timeline.</CardDescription>
            </CardHeader>
            <CardContent>
              <SCurveChart points={evmData.sCurve} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By section</CardTitle>
              <CardDescription>
                PV/EV/AC rolled up per WBS section, so you can see what&apos;s driving overall variance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WbsEvmTable tree={tree} rollups={evmData.wbsRollups} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-[2px] border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-lg",
          tone === "good" && "text-status-on-track",
          tone === "bad" && "text-status-off-track",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RatioTile({ metric, ratio, label }: { metric: "cpi" | "spi"; ratio: number | null; label: string }) {
  const status = evmRatioStatus(ratio);
  return (
    <div className="rounded-[2px] border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-lg", evmRatioColorClass(status))}>{evmInterpretation(metric, ratio)}</p>
    </div>
  );
}

function SCurveChart({ points }: { points: EvmSCurvePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough baseline data to draw a curve yet.</p>;
  }

  const width = 720;
  const height = 260;
  const padding = { top: 10, right: 16, bottom: 28, left: 64 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const dates = points.map((p) => new Date(p.date + "T00:00:00").getTime());
  const minT = Math.min(...dates);
  const maxT = Math.max(...dates);
  const spanT = Math.max(1, maxT - minT);
  const maxValue = Math.max(1, ...points.flatMap((p) => [p.pv, p.ev ?? 0, p.ac ?? 0]));

  function x(date: string) {
    const t = new Date(date + "T00:00:00").getTime();
    return padding.left + ((t - minT) / spanT) * innerWidth;
  }
  function y(value: number) {
    return padding.top + innerHeight - (value / maxValue) * innerHeight;
  }

  function linePath(key: "pv" | "ev" | "ac") {
    let d = "";
    let started = false;
    for (const p of points) {
      const v = p[key];
      if (v === null || v === undefined) {
        started = false;
        continue;
      }
      d += `${started ? "L" : "M"}${x(p.date).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    }
    return d.trim();
  }

  const lastEv = [...points].reverse().find((p) => p.ev !== null)?.ev ?? 0;
  const lastAc = [...points].reverse().find((p) => p.ac !== null)?.ac ?? 0;
  const acIsProblem = lastAc > lastEv;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: 480 }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(v)}
              y2={y(v)}
              className="stroke-rule"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground font-mono text-[10px]"
            >
              {fmtCurrency(v)}
            </text>
          </g>
        ))}
        {[points[0], points[points.length - 1]].map((p, i) => (
          <text
            key={i}
            x={x(p.date)}
            y={height - 8}
            textAnchor={i === 0 ? "start" : "end"}
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {fmtDate(p.date)}
          </text>
        ))}
        <path d={linePath("pv")} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} />
        <path d={linePath("ev")} fill="none" className="stroke-status-on-track" strokeWidth={1.5} />
        <path
          d={linePath("ac")}
          fill="none"
          strokeWidth={1.5}
          className={acIsProblem ? "stroke-critical" : "stroke-muted-foreground"}
        />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <LegendItem className="bg-muted-foreground" label="Planned Value" />
        <LegendItem className="bg-status-on-track" label="Earned Value" />
        <LegendItem className={acIsProblem ? "bg-critical" : "bg-muted-foreground"} label="Actual Cost" />
      </div>
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function WbsEvmTable({ tree, rollups }: { tree: WbsTreeNode[]; rollups: Map<string, WbsEvmRollup> }) {
  const rows: { depth: number; name: string; rollup: WbsEvmRollup }[] = [];
  function visit(node: WbsTreeNode, depth: number) {
    const rollup = rollups.get(node.id);
    if (rollup) rows.push({ depth, name: node.name, rollup });
    for (const child of node.children) visit(child, depth + 1);
  }
  for (const node of tree) visit(node, 0);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No sections with baseline data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-2 font-medium">Section</th>
            <th className="py-1.5 pr-2 font-medium">PV</th>
            <th className="py-1.5 pr-2 font-medium">EV</th>
            <th className="py-1.5 pr-2 font-medium">AC</th>
            <th className="py-1.5 pr-2 font-medium">CPI</th>
            <th className="py-1.5 pr-2 font-medium">SPI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rollup.wbsId} className="border-b border-border">
              <td className="truncate py-1.5 pr-2" style={{ paddingLeft: 8 + row.depth * 14 }} title={row.name}>
                {row.name}
              </td>
              <td className="py-1.5 pr-2 font-mono text-muted-foreground">{fmtCurrency(row.rollup.pv)}</td>
              <td className="py-1.5 pr-2 font-mono text-muted-foreground">{fmtCurrency(row.rollup.ev)}</td>
              <td className="py-1.5 pr-2 font-mono text-muted-foreground">{fmtCurrency(row.rollup.ac)}</td>
              <td className={cn("py-1.5 pr-2 font-mono", evmRatioColorClass(evmRatioStatus(row.rollup.cpi)))}>
                {row.rollup.cpi === null ? "—" : row.rollup.cpi.toFixed(2)}
              </td>
              <td className={cn("py-1.5 pr-2 font-mono", evmRatioColorClass(evmRatioStatus(row.rollup.spi)))}>
                {row.rollup.spi === null ? "—" : row.rollup.spi.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
