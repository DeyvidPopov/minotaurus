// components/ui/button.tsx
"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "default" | "primary" | "ghost" | "danger";
type Size = "md" | "sm";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const base = "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap transition-colors border border-border bg-panel text-fg hover:bg-panel-hover disabled:opacity-50 disabled:cursor-not-allowed";
const variants: Record<Variant, string> = {
  default: "",
  primary: "bg-accent text-accent-fg border-transparent hover:brightness-[0.95] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
  ghost:   "bg-transparent border-transparent text-fg-muted hover:bg-panel-hover hover:text-fg",
  danger:  "text-danger hover:bg-[color-mix(in_srgb,var(--c-danger)_14%,transparent)]",
};
const sizes: Record<Size, string> = {
  md: "h-8 px-3 text-[13px]",
  sm: "h-[26px] px-2 text-[12.5px]",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "default", size = "md", icon, iconRight, children, className, ...rest }, ref) => {
    const iconOnly = !children;
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], iconOnly && (size === "sm" ? "w-[26px] px-0" : "w-8 px-0"), className)}
        {...rest}
      >
        {icon}{children}{iconRight}
      </button>
    );
  }
);
Button.displayName = "Button";
