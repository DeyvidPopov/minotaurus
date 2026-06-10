// components/ui/tabs.tsx
"use client";

import { cn } from "@/lib/utils";

type CountTone = "danger" | "warning" | "info";
interface Tab { id: string; label: string; count?: number; countTone?: CountTone; }
interface Props { value: string; onChange: (id: string) => void; tabs: Tab[]; }

const countToneClass: Record<CountTone, string> = {
  danger:  "text-danger  bg-[color-mix(in_srgb,var(--c-danger)_16%,transparent)]",
  warning: "text-warning bg-[color-mix(in_srgb,var(--c-warning)_18%,transparent)]",
  info:    "text-info    bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)]",
};

export function Tabs({ value, onChange, tabs }: Props) {
  return (
    <div className="relative mb-5">
      <div className="flex border-b border-border overflow-x-auto overflow-y-hidden" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id} role="tab"
            onClick={() => onChange(t.id)}
            className={cn(
              "px-3 sm:px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px shrink-0",
              value === t.id ? "text-fg border-accent" : "text-fg-muted border-transparent hover:text-fg"
            )}
          >
            {t.label}
            {t.count != null && (
              t.countTone ? (
                <span className={cn(
                  "ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10.5px] font-semibold",
                  countToneClass[t.countTone],
                )}>{t.count}</span>
              ) : (
                <span className="ml-1 text-[11px] text-fg-subtle">{t.count}</span>
              )
            )}
          </button>
        ))}
      </div>
      {/* Mobile scroll affordance: a right-edge fade hinting the tab row scrolls
          (so Validation isn't silently lost off-screen). Hidden once everything fits. */}
      <div className="pointer-events-none absolute right-0 top-0 h-[calc(100%-1px)] w-8 bg-gradient-to-l from-bg to-transparent md:hidden" />
    </div>
  );
}
