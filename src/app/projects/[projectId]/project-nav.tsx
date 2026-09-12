"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "schedule", label: "Schedule" },
  { slug: "gantt", label: "Gantt" },
  { slug: "baselines", label: "Baselines" },
  { slug: "evm", label: "EVM" },
  { slug: "calendars", label: "Calendars" },
  { slug: "resources", label: "Resources" },
  { slug: "import", label: "Import" },
  { slug: "ai", label: "AI Assistant" },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5">
      {TABS.map((tab) => {
        const href = `/projects/${projectId}/${tab.slug}`;
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            className={cn(
              "border-b-2 px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
