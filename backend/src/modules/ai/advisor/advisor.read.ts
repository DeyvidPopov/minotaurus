// advisor.read.ts — pure mapping from a stored AiSession(ADVISOR) row to an
// AdvisorResult, including deterministic staleness comparison. No I/O, no Prisma,
// no AI — so it is unit-testable in isolation. The DB read + analysis recompute
// live in advisor.service.ts; this only shapes the result. Mirrors review.read.ts
// (the hash fingerprint helper itself is shared from there).

import type { AnalysisResult } from "../../exports/analysis/analysis.types.js";
import type { AdvisorReport, AdvisorResult } from "./advisor.types.js";

/** The columns + JSON payload this mapping needs from an AiSession(ADVISOR) row. */
export interface StoredAdvisorRow {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  analysisHash: string | null;
  createdAt: Date;
  proposal: unknown; // JSON: { report, generatedAt, truncated, missingSections, verification }
}

/** Coerce a stored (possibly older-shape / partial) report to the current
 *  AdvisorReport. Missing arrays become [] so the client never sees `undefined`. */
function normalizeStoredReport(stored: Partial<AdvisorReport> | undefined): AdvisorReport {
  return {
    executiveSummary: stored?.executiveSummary ?? "",
    focusAreas: stored?.focusAreas ?? [],
    opportunities: stored?.opportunities ?? [],
    recommendations: stored?.recommendations ?? [],
  };
}

function emptyVerification(): AdvisorResult["verification"] {
  return { totalRefs: 0, removedRefs: 0, discardedFindings: 0 };
}

/**
 * Shape a stored advisor row into an AdvisorResult against the CURRENT analysis.
 * `currentHash` is the hash of the project's current AnalysisResult; the advisory
 * is `stale` when it was generated against a different hash. An empty/absent
 * stored hash can't be compared, so it is treated as not-stale (no false alarm).
 */
export function toStoredAdvisorResult(
  row: StoredAdvisorRow,
  analysis: AnalysisResult,
  currentHash: string,
): AdvisorResult {
  const payload = (row.proposal && typeof row.proposal === "object" ? row.proposal : {}) as {
    report?: Partial<AdvisorReport>;
    generatedAt?: string;
    truncated?: boolean;
    missingSections?: string[];
    verification?: AdvisorResult["verification"];
  };
  const storedHash = row.analysisHash ?? "";
  return {
    id: row.id,
    // Normalize to the CURRENT shape field-by-field — never trust the stored
    // JSON's shape. A row written under an earlier contract (e.g. the pre-coach
    // advisory with strengths/risks and no focusAreas) reads back cleanly: known
    // fields carry over, absent ones default to empty rather than `undefined`
    // (which would crash the UI). Sections that no longer exist are simply dropped.
    report: normalizeStoredReport(payload.report),
    analysis,
    analysisHash: storedHash,
    model: row.model,
    usage: { inputTokens: row.promptTokens, outputTokens: row.completionTokens },
    generatedAt: payload.generatedAt ?? row.createdAt.toISOString(),
    truncated: payload.truncated ?? false,
    missingSections: payload.missingSections ?? [],
    stale: storedHash.length > 0 && storedHash !== currentHash,
    verification: payload.verification ?? emptyVerification(),
  };
}
