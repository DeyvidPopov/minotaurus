// components/ui/badge.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "purple" | "accent";
interface Props { tone?: Tone; mono?: boolean; square?: boolean; children: ReactNode; className?: string; }

const tones: Record<Tone, string> = {
  default: "bg-panel-2 text-fg-muted border-border",
  success: "text-success bg-[color-mix(in_srgb,var(--c-success)_14%,transparent)] border-[color-mix(in_srgb,var(--c-success)_28%,transparent)]",
  warning: "text-warning bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)] border-[color-mix(in_srgb,var(--c-warning)_32%,transparent)]",
  danger:  "text-danger  bg-[color-mix(in_srgb,var(--c-danger)_14%,transparent)]  border-[color-mix(in_srgb,var(--c-danger)_28%,transparent)]",
  info:    "text-info    bg-[color-mix(in_srgb,var(--c-info)_14%,transparent)]    border-[color-mix(in_srgb,var(--c-info)_28%,transparent)]",
  purple:  "text-[color:var(--c-purple)] bg-[color-mix(in_srgb,var(--c-purple)_14%,transparent)] border-[color-mix(in_srgb,var(--c-purple)_28%,transparent)]",
  accent:  "text-accent bg-accent-soft border-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
};

export function Badge({ tone = "default", mono, square, children, className }: Props) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-1.5 py-px text-[11.5px] font-medium border leading-relaxed whitespace-nowrap",
      square ? "rounded-xs" : "rounded-full",
      mono && "font-mono text-[11px] px-1.5",
      tones[tone],
      className,
    )}>{children}</span>
  );
}
