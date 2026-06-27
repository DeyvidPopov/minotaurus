// lib/health-score.ts — deterministic health-score PRESENTATION helpers.
//
// These mirror the backend GRADE_BANDS (modules/exports/analysis/analysis.constants.ts)
// for display only — they map an already-computed score to a colour/label. They
// NEVER compute or influence a score (AI-Safety Rule 3): the numbers come from the
// pure analysis engine via GET /projects/:id/analysis. Shared so the AI Review
// score cards and the Decision page render identical bands and can't drift.

import type { HealthSubScores } from "@/lib/types";

/** Score → CSS colour var. Same thresholds as the backend bands. */
export function scoreColorVar(score: number | null): string {
  if (score == null) return "var(--border-strong)";
  if (score >= 75) return "var(--c-success)";
  if (score >= 60) return "var(--c-info)";
  if (score >= 40) return "var(--c-warning)";
  return "var(--c-danger)";
}

/** Score → short band label (Excellent / Healthy / Fair / At Risk / Critical). */
export function scoreLabel(score: number | null): string {
  if (score == null) return "—";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Healthy";
  if (score >= 60) return "Fair";
  if (score >= 40) return "At Risk";
  return "Critical";
}

export const SUB_SCORE_LABELS: Record<keyof HealthSubScores, string> = {
  documentation: "Documentation",
  connectivity: "Connectivity",
  traceability: "Traceability",
  validation: "Validation",
  governance: "Governance",
};
