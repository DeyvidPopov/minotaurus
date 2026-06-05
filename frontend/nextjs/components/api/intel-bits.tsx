// components/api/intel-bits.tsx — shared primitives for the (inferred) API
// Architecture Intelligence panels. Read-only; nothing here is persisted.
"use client";

import { AlertTriangle } from "lucide-react";
import type { Confidence, IntelWarning } from "@/lib/api/api-intel";

const CONF: Record<Confidence, { label: string; color: string; title: string }> = {
  high: { label: "high", color: "var(--accent)", title: "High confidence" },
  medium: { label: "med", color: "var(--c-info)", title: "Medium confidence" },
  low: { label: "low", color: "var(--fg-subtle)", title: "Low confidence — heuristic guess" },
};

/** Persistent marker that everything in these panels is inferred, not saved. */
export function InferredBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium text-fg-subtle border border-border rounded-full px-1.5 py-px">
      · Inferred ·
    </span>
  );
}

/** Confidence indicator: a colored dot + short label. */
export function ConfidenceDot({ confidence }: { confidence: Confidence }) {
  const c = CONF[confidence];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle shrink-0" title={c.title}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

/** Label cell for a links row. */
export function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-fg-muted font-medium pt-1 select-none">{children}</div>
  );
}

/** Shared sensitive-field warnings list (used by both intel views). */
export function IntelWarnings({ warnings }: { warnings: IntelWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-fg-muted font-semibold">⚠ Warnings</span>
      {warnings.map((w) => (
        <div key={`${w.location}:${w.field}`} className="flex items-center gap-1.5 text-[12.5px] text-danger">
          <AlertTriangle size={12} className="shrink-0" />
          {w.message}
        </div>
      ))}
    </div>
  );
}
