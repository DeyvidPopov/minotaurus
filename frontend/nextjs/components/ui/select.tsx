// components/ui/select.tsx — design-system styled select.
// Wraps a native <select> (keyboard-accessible + native mobile picker for free)
// with the app's panel/border styling and a custom chevron, so selects look
// consistent instead of OS-default.
"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> {
  options: SelectOption[];
  /** Applied to the wrapper — use for width/flex (the inner <select> is w-full). */
  className?: string;
}

export function Select({ options, className, ...rest }: Props) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        {...rest}
        className="h-9 w-full appearance-none bg-panel border border-border rounded-sm pl-2.5 pr-8 text-[13.5px] text-fg outline-none cursor-pointer hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent-soft"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}
