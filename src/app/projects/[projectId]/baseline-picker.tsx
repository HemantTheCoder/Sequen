"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BaselineSummary } from "@/lib/actions/variance";

export function BaselinePicker({
  projectId,
  baselines,
  selectedBaselineId,
}: {
  projectId: string;
  baselines: BaselineSummary[];
  selectedBaselineId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("baseline", value);
    else params.delete("baseline");
    router.push(`${pathname}?${params.toString()}`);
  }

  if (baselines.length === 0) {
    return (
      <Link href={`/projects/${projectId}/baselines`} className="text-sm text-muted-foreground hover:text-foreground">
        Create a baseline to compare against
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Compare to</span>
      <select
        value={selectedBaselineId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="h-7 min-w-0 rounded-md border border-input bg-transparent px-1.5 text-sm"
      >
        <option value="">No baseline</option>
        {baselines.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.is_active ? " (active)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
