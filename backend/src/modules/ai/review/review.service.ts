// review.service.ts — orchestrates the read-only AI Architecture Review (the
// "Full Review" mode). The deterministic chain + the provider generation loop are
// now shared with the Advisor mode via ../architecture/analysis-runner.ts; this
// file owns only the review-specific spec (prompt/schema/verify), persistence,
// and the read endpoints.
//
// READ-ONLY w.r.t. architecture: this never calls prisma.*.create/update/delete
// on any SSOT entity. The ONLY write is a lightweight AiSession audit row
// (metadata, like the Bootstrap Wizard) — never a graph node, never SSOT. AI
// interprets the deterministic AnalysisResult; it never produces or alters it.

import { AiSessionKind, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import {
  ARCH_ANALYSIS_SECTIONS,
  buildAnalysisContext,
  computeAnalysisAndHash,
  runArchitectureGeneration,
  type GenerationSpec,
} from "../architecture/analysis-runner.js";
import { buildReviewSystemPrompt, buildReviewUserPrompt } from "./review.prompt.js";
import {
  REVIEW_TOOL_DESCRIPTION,
  REVIEW_TOOL_NAME,
  architectureReviewSchema,
  reviewToolInputSchema,
} from "./review.schema.js";
import { salvageTruncatedReview } from "./review.salvage.js";
import { toStoredReviewResult } from "./review.read.js";
import { verifyReviewEvidence } from "./review.verify.js";
import type { ArchitectureReview, ReviewListItem, ReviewResult } from "./review.types.js";

// Re-exported for back-compat with prior importers (the deterministic helpers now
// live in the shared runner).
export { computeAnalysisAndHash };
export const ALL_REVIEW_SECTIONS = ARCH_ANALYSIS_SECTIONS;

/** Output-token budget for a review. Bounded output keeps this comfortable; the
 *  headroom (default 12k) is insurance, not the primary fix. */
const DEFAULT_REVIEW_MAX_TOKENS = 12000;
function reviewMaxTokens(): number {
  const v = Number(process.env.AI_REVIEW_MAX_TOKENS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_REVIEW_MAX_TOKENS;
}

// The review-specific half of the shared runner. Everything else (provider call,
// repair retry, truncation handling, error taxonomy) is in the runner.
const reviewSpec: GenerationSpec<ArchitectureReview> = {
  label: "architecture review",
  toolName: REVIEW_TOOL_NAME,
  toolDescription: REVIEW_TOOL_DESCRIPTION,
  inputSchema: reviewToolInputSchema,
  buildSystem: buildReviewSystemPrompt,
  buildUser: buildReviewUserPrompt,
  parseStrict: (data) => {
    const parsed = architectureReviewSchema.safeParse(data);
    if (parsed.success) return { ok: true, report: parsed.data as ArchitectureReview };
    return { ok: false, error: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  },
  salvage: (data) => {
    const s = salvageTruncatedReview(data);
    return s ? { report: s.review, missingSections: s.missingSections } : null;
  },
  maxTokens: reviewMaxTokens,
};

function logAuditFailure(fields: Record<string, unknown>): void {
  // Scalar metadata only — never the prompt, the AI output, or any secret.
  // eslint-disable-next-line no-console
  console.warn("[ai] architecture review audit " + JSON.stringify(fields));
}

export interface ReviewParams {
  projectId: string;
  userId: string;
}

export async function generateArchitectureReview(params: ReviewParams): Promise<ReviewResult> {
  // ── Deterministic chain: SSOT → AnalysisResult → digest (no AI yet) ──
  const { analysis, digest, analysisHash, generatedAt } = await buildAnalysisContext(params.projectId);
  const base = { projectId: params.projectId, userId: params.userId };

  // ── Shared generation loop (provider, repair retry, truncation salvage) ──
  const gen = await runArchitectureGeneration(reviewSpec, digest, base);

  // ── Deterministic post-check: strip unsupported citations, flag unverifiable ──
  const verified = verifyReviewEvidence(gen.report, digest);

  // ── Audit (read-only): persist review metadata as a first-class REVIEW
  // AiSession. The kind + analysisHash are real columns; the JSON payload holds
  // the review snapshot and verification stats. Audit metadata only — never a
  // graph node, never SSOT (same role as a bootstrap AiSession). ──
  let savedId: string | null = null;
  try {
    const created = await prisma.aiSession.create({
      data: {
        projectId: params.projectId,
        kind: AiSessionKind.REVIEW,
        status: AiSessionStatus.PROPOSED,
        idea: "",
        model: gen.model,
        promptTokens: gen.usage.inputTokens,
        completionTokens: gen.usage.outputTokens,
        analysisHash,
        proposal: {
          generatedAt,
          truncated: gen.truncated,
          missingSections: gen.missingSections,
          review: verified.review,
          verification: {
            totalRefs: verified.totalRefs,
            removedRefs: verified.removedRefs,
            unverifiedFindings: verified.unverifiedFindings,
          },
        } as unknown as Prisma.InputJsonValue,
        createdById: params.userId,
      },
    });
    savedId = created.id;
  } catch (err) {
    // Audit is best-effort; a failed metadata write must not fail a read-only
    // review. Log scalar diagnostics and return the review anyway.
    logAuditFailure({ ...base, model: gen.model, code: "AI_AUDIT_WRITE_FAILED", message: err instanceof Error ? err.message : String(err) });
  }

  return {
    id: savedId,
    review: verified.review,
    analysis,
    analysisHash,
    model: gen.model,
    usage: gen.usage,
    generatedAt,
    truncated: gen.truncated,
    missingSections: gen.missingSections,
    stale: false, // just generated against the current analysis
  };
}

// ── Read endpoints (reuse persisted reviews — NO AI call) ──

/** Latest persisted review for the project, or null if none exists. */
export async function getLatestReview(projectId: string): Promise<ReviewResult | null> {
  const row = await prisma.aiSession.findFirst({
    where: { projectId, kind: AiSessionKind.REVIEW },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  const { analysis, analysisHash } = await computeAnalysisAndHash(projectId);
  return toStoredReviewResult(row, analysis, analysisHash);
}

/** A specific persisted review (read-only), or null if not found in this project. */
export async function getReviewById(projectId: string, reviewId: string): Promise<ReviewResult | null> {
  const row = await prisma.aiSession.findFirst({
    where: { id: reviewId, projectId, kind: AiSessionKind.REVIEW },
  });
  if (!row) return null;
  const { analysis, analysisHash } = await computeAnalysisAndHash(projectId);
  return toStoredReviewResult(row, analysis, analysisHash);
}

/** Review history metadata, newest first. */
export async function listReviews(projectId: string): Promise<ReviewListItem[]> {
  const rows = await prisma.aiSession.findMany({
    where: { projectId, kind: AiSessionKind.REVIEW },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, analysisHash: true, model: true },
  });
  return rows.map((r) => ({
    id: r.id,
    generatedAt: r.createdAt.toISOString(),
    analysisHash: r.analysisHash ?? "",
    model: r.model,
  }));
}
