// components/ui/segmented.tsx
"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> { value: T; label: string; }
interface Props<T extends string> { value: T; onChange: (v: T) => void; options: Option<T>[]; }

export function Segmented<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <div className="inline-flex gap-0 p-[3px] bg-panel-2 border border-border rounded-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2.5 py-1 text-[12.5px] rounded-xs",
            value === o.value ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg"
          )}
        >{o.label}</button>
      ))}
    </div>
  );
}
