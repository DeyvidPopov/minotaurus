// review.read.ts — pure mapping from a stored AiSession(REVIEW) row to a
// ReviewResult, including deterministic staleness comparison. No I/O, no Prisma,
// no AI — so it is unit-testable in isolation. The DB read + analysis recompute
// live in review.service.ts; this only shapes the result.

import { createHash } from "node:crypto";
import type { AnalysisResult } from "../../exports/analysis/analysis.types.js";
import type { ArchitectureReview, ReviewResult } from "./review.types.js";

/**
 * Stable fingerprint of a project's analysis, used for staleness detection.
 * Excludes `meta.generatedAt` — the wall-clock time the snapshot was assembled —
 * so the hash reflects project STATE, not when it was computed. Without this,
 * every recompute yields a new hash and every saved review looks "stale".
 */
export function hashAnalysis(analysis: unknown): string {
  let payload: unknown = analysis;
  if (analysis && typeof analysis === "object" && "meta" in analysis) {
    const a = analysis as AnalysisResult;
    payload = { ...a, meta: { ...a.meta, generatedAt: "" } };
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** The columns + JSON payload this mapping needs from an AiSession(REVIEW) row. */
export interface StoredReviewRow {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  analysisHash: string | null;
  createdAt: Date;
  proposal: unknown; // JSON: { review, generatedAt, truncated, missingSections, ... }
}

function emptyReview(): ArchitectureReview {
  return {
    executiveSummary: "",
    strengths: [], risks: [], blindSpots: [],
    governanceReview: [], validationCommentary: [], recommendations: [],
  };
}

/**
 * Shape a stored review row into a ReviewResult against the CURRENT analysis.
 * `currentHash` is the hash of the project's current AnalysisResult; the review
 * is `stale` when it was generated against a different hash. An empty/absent
 * stored hash can't be compared, so it is treated as not-stale (no false alarm).
 */
export function toStoredReviewResult(
  row: StoredReviewRow,
  analysis: AnalysisResult,
  currentHash: string,
): ReviewResult {
  const payload = (row.proposal && typeof row.proposal === "object" ? row.proposal : {}) as {
    review?: ArchitectureReview;
    generatedAt?: string;
    truncated?: boolean;
    missingSections?: string[];
  };
  const storedHash = row.analysisHash ?? "";
  return {
    id: row.id,
    review: payload.review ?? emptyReview(),
    analysis,
    analysisHash: storedHash,
    model: row.model,
    usage: { inputTokens: row.promptTokens, outputTokens: row.completionTokens },
    generatedAt: payload.generatedAt ?? row.createdAt.toISOString(),
    truncated: payload.truncated ?? false,
    missingSections: payload.missingSections ?? [],
    stale: storedHash.length > 0 && storedHash !== currentHash,
  };
}
