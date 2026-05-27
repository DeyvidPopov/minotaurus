// components/ui/tabs.tsx
"use client";

import { cn } from "@/lib/utils";

interface Tab { id: string; label: string; count?: number; }
interface Props { value: string; onChange: (id: string) => void; tabs: Tab[]; }

export function Tabs({ value, onChange, tabs }: Props) {
  return (
    <div className="flex border-b border-border mb-5 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id} role="tab"
          onClick={() => onChange(t.id)}
          className={cn(
            "px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px shrink-0",
            value === t.id ? "text-fg border-accent" : "text-fg-muted border-transparent hover:text-fg"
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1 text-[11px] text-fg-subtle">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
