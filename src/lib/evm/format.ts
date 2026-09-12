/** Matches the app's existing lightweight `$X` convention (see resources-view's $/hr display) rather than full Intl currency formatting. */
export function fmtCurrency(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}$${Math.abs(rounded).toLocaleString("en-US")}`;
}

export type EvmRatioStatus = "on-track" | "at-risk" | "off-track";

/** >=1.0 is on-track, 0.9-1.0 is at-risk, below 0.9 is off-track — standard EVM bands. */
export function evmRatioStatus(ratio: number | null): EvmRatioStatus | null {
  if (ratio === null) return null;
  if (ratio >= 1) return "on-track";
  if (ratio >= 0.9) return "at-risk";
  return "off-track";
}

export function evmRatioColorClass(status: EvmRatioStatus | null): string {
  if (status === "off-track") return "text-status-off-track";
  if (status === "at-risk") return "text-status-at-risk";
  if (status === "on-track") return "text-status-on-track";
  return "text-muted-foreground";
}

/** A one-line interpretation next to a CPI/SPI number, e.g. "0.85 — over budget". */
export function evmInterpretation(metric: "cpi" | "spi", ratio: number | null): string {
  if (ratio === null) return "—";
  const formatted = ratio.toFixed(2);
  if (metric === "cpi") {
    if (ratio >= 1) return `${formatted} — under or on budget`;
    if (ratio >= 0.9) return `${formatted} — slightly over budget`;
    return `${formatted} — over budget`;
  }
  if (ratio >= 1) return `${formatted} — ahead of or on schedule`;
  if (ratio >= 0.9) return `${formatted} — slightly behind schedule`;
  return `${formatted} — behind schedule`;
}
