// components/analysis/health-score-cards.tsx — the deterministic health score +
// five sub-score cards. Pure presentation over the engine-authoritative numbers
// from GET /projects/:id/analysis (ProjectAnalysis["health"]); it computes
// nothing. Shared by the Decision page (and available to dedupe the AI Review
// score grid later) so the two surfaces show identical cards.
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { scoreColorVar, scoreLabel, SUB_SCORE_LABELS } from "@/lib/health-score";
import type { HealthSubScores, ProjectAnalysis } from "@/lib/types";

// Subtle progress layer rendered as the card's BOTTOM BORDER. Fills 0 → value on
// mount. (Mirrors the AI Review page's strip; thresholds via scoreColorVar.)
export function ScoreStrip({ value }: { value: number | null }) {
  const target = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = scoreColorVar(value);
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <div
        className="h-full transition-[width] duration-700 ease-out"
        style={{
          width: `${w}%`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 45%, transparent), color-mix(in srgb, ${color} 80%, transparent))`,
          boxShadow: `0 0 6px color-mix(in srgb, ${color} 35%, transparent)`,
        }}
      />
    </div>
  );
}

export function HealthScoreCards({ health }: { health: ProjectAnalysis["health"] }) {
  const subScores = Object.entries(health.subScores) as [keyof HealthSubScores, number][];
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <Card className="md:col-span-1 relative" padded>
        <ScoreStrip value={health.score} />
        <div className="relative z-10">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Health</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{health.score ?? "—"}</div>
          <div className="text-[11.5px] text-fg-muted mt-0.5">{health.label}</div>
        </div>
      </Card>
      {subScores.map(([k, v]) => (
        <Card key={k} className="relative" padded>
          <ScoreStrip value={v} />
          <div className="relative z-10">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle truncate">{SUB_SCORE_LABELS[k] ?? k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
            <div className="text-[11.5px] text-fg-muted mt-0.5">{scoreLabel(v)}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
