import { format } from "date-fns";

/**
 * Formats a date-only ("yyyy-MM-dd") string for display. Uses date-fns
 * `format` rather than `toLocaleDateString`, which resolves the runtime
 * locale differently on the server vs. the browser and causes React
 * hydration mismatches.
 */
export function fmtDate(d: string | null): string {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "MMM d");
}
