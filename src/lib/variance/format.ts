import type { varianceStatus } from "./engine";

export function formatVarianceDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "0d";
  return days > 0 ? `+${days}d` : `${days}d`;
}

export function varianceColorClass(status: ReturnType<typeof varianceStatus>): string {
  if (status === "off-track") return "text-status-off-track";
  if (status === "at-risk") return "text-status-at-risk";
  if (status === "on-track") return "text-status-on-track";
  return "text-muted-foreground";
}
