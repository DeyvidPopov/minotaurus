// components/ui/segmented.tsx
"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> { value: T; label: string; }
interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  /** Stretch to full width with evenly-sized segments on mobile + mid screens; compact inline pill at lg+. */
  fullWidthMobile?: boolean;
  /** Extra classes on the wrapper (e.g. `sm:ml-auto` to push the control to the right). */
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, fullWidthMobile, className }: Props<T>) {
  return (
    <div className={cn(
      "gap-0 p-[3px] bg-panel-2 border border-border rounded-sm",
      fullWidthMobile ? "flex w-full lg:inline-flex lg:w-auto" : "inline-flex",
      className,
    )}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2.5 py-1 text-[12.5px] rounded-xs",
            // On mobile + mid screens the segments size to their label (so a longer
            // one like "Documented (16)" gets the width it needs and never wraps to
            // two lines) and still grow to fill the row; tighter padding keeps three
            // two-digit counts on one line on the narrowest phones. Inline pill at lg+.
            fullWidthMobile && "flex-auto whitespace-nowrap px-2 lg:flex-none lg:px-2.5",
            value === o.value ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg"
          )}
        >{o.label}</button>
      ))}
    </div>
  );
}
