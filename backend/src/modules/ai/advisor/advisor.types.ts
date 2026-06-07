// advisor.types.ts — DTOs for the AI Architecture Advisor, the "Advisor / Next
// Steps" mode of AI Review. READ-ONLY w.r.t. architecture.
//
// Positioning — the Advisor is a COACH, not an auditor:
//   Full Review answers "How healthy is this architecture?" (the formal audit)
//   Advisor     answers "What should I do next?"            (a prioritized plan)
// To keep that distinction sharp, the Advisor deliberately does NOT emit the
// audit sections Full Review owns (strengths, risks, blind spots, governance,
// validation commentary). It emits only: a short snapshot, the top 2–3 focus
// areas, a few opportunities, and prioritized next steps.
//
// The chain is one-directional and identical to AI Review:
//   SSOT snapshot → AnalysisResult (deterministic) → ReviewDigest → AI advisory.
// AI never feeds back into AnalysisResult; the Advisor writes ONLY its own
// AiSession(ADVISOR) record (audit metadata, never SSOT).
//
// The digest + evidence allow-list are REUSED from the AI Review module so the
// two modes cite the same deterministic facts and the heuristics never drift.
// Mirrored on the frontend in lib/api/ai.ts.

import type { AnalysisResult } from "../../exports/analysis/analysis.types.js";
import type { EvidenceRef, ReviewDigest } from "../review/review.types.js";

// Re-exported so advisor consumers don't reach into the review module directly.
export type { EvidenceRef, ReviewDigest };

export type RecommendationPriority = "HIGH" | "MEDIUM" | "LOW";

// ── The model's structured output (after deterministic verification) ──
// Every item that survives verification carries at least one resolved evidence
// ref — items with no verifiable evidence are DISCARDED (not flagged), so the
// rendered advisory is fully grounded in the deterministic analysis.

/** A focus area or opportunity: a heading + why-it-matters + evidence. */
export interface AdvisorNote {
  title: string;
  detail: string;
  evidence: EvidenceRef[];
}

/** The centerpiece: a prioritized next step. `evidence` is REQUIRED — a
 *  recommendation with no verifiable evidence never reaches the client. */
export interface AdvisorRecommendation {
  title: string;
  priority: RecommendationPriority;
  rationale: string;
  evidence: EvidenceRef[];
}

export interface AdvisorReport {
  /** Executive Snapshot — very short project state (the prompt targets <= 80 words). */
  executiveSummary: string;
  /** Current Focus Areas — the top 2–3 architectural concerns to address now. */
  focusAreas: AdvisorNote[];
  /** Opportunities — a few lightweight quality-improvement areas. */
  opportunities: AdvisorNote[];
  /** Recommended Next Steps — at most 5, ordered by priority (HIGH → MEDIUM → LOW). */
  recommendations: AdvisorRecommendation[];
}

/** What the deterministic verifier did to the model's output (telemetry). */
export interface AdvisorVerification {
  /** Total evidence refs the model emitted across all sections. */
  totalRefs: number;
  /** Refs dropped because they were not in the digest allow-list. */
  removedRefs: number;
  /** Findings discarded entirely because no evidence survived verification. */
  discardedFindings: number;
}

// ── Endpoint payload ──

export interface AdvisorResult {
  /** AiSession(ADVISOR) audit row id (null only if the audit write failed at generation). */
  id: string | null;
  report: AdvisorReport;
  /** The deterministic analysis the advisory interprets — authoritative numbers.
   *  On a reloaded advisory this is the CURRENT analysis (recomputed), so the
   *  score cards always show truth; `stale` flags when the narrative predates it. */
  analysis: AnalysisResult;
  /** Stable hash of the analysis the advisory was generated against. */
  analysisHash: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  generatedAt: string;
  /** True when the model hit its output ceiling and we salvaged the prefix. */
  truncated: boolean;
  /** Sections dropped by truncation (only set when `truncated`). */
  missingSections: string[];
  /** True when the project's current analysis hash differs from `analysisHash`
   *  (the project changed since this advisory was generated). */
  stale: boolean;
  verification: AdvisorVerification;
}

/** Lightweight metadata for the advisor history list (newest first). */
export interface AdvisorListItem {
  id: string;
  generatedAt: string;
  analysisHash: string;
  model: string;
}
