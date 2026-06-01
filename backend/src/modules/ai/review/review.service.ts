// review.service.ts — orchestrates the read-only AI Architecture Review:
//   buildExportContent (SSOT assembly, reused) → analyzeExportSnapshot
//   (deterministic, reused) → buildReviewDigest → provider (forced tool, one
//   repair retry) → Zod parse → verify evidence → persist AiSession (audit).
//
// READ-ONLY: this never calls prisma.*.create/update/delete on any SSOT entity.
// The ONLY write is a lightweight AiSession audit row (metadata, like the
// Bootstrap Wizard) — never a graph node, never SSOT. AI interprets the
// deterministic AnalysisResult; it never produces or alters it.

import { AiSessionKind, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { buildExportContent } from "../../exports/exports.engine.js";
import { analyzeExportSnapshot } from "../../exports/analysis/metrics.engine.js";
import type { AnalysisResult, ExportSnapshot } from "../../exports/analysis/analysis.types.js";
import { getAiProvider, type StructuredResult } from "../providers/ai.provider.js";
import { AiOutputTruncatedError, AiSchemaError } from "../ai.service.js";
import { buildReviewDigest } from "./review.digest.js";
import { buildReviewSystemPrompt, buildReviewUserPrompt } from "./review.prompt.js";
import {
  REVIEW_TOOL_DESCRIPTION,
  REVIEW_TOOL_NAME,
  architectureReviewSchema,
  reviewToolInputSchema,
} from "./review.schema.js";
import { salvageTruncatedReview } from "./review.salvage.js";
import { hashAnalysis, toStoredReviewResult } from "./review.read.js";
import { verifyReviewEvidence } from "./review.verify.js";
import type { ArchitectureReview, ReviewListItem, ReviewResult } from "./review.types.js";

/** Output-token budget for a review. Bounded output keeps this comfortable; the
 *  headroom (default 12k) is insurance, not the primary fix. */
const DEFAULT_REVIEW_MAX_TOKENS = 12000;
function reviewMaxTokens(): number {
  const v = Number(process.env.AI_REVIEW_MAX_TOKENS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_REVIEW_MAX_TOKENS;
}

// Everything the deterministic analysis engine reads. The review never sends raw
// SSOT to the model — this only feeds the analysis engine, whose bounded output
// becomes the digest.
export const ALL_REVIEW_SECTIONS = [
  "ARTIFACTS",
  "RELATIONS",
  "DOCUMENTATION",
  "VALIDATION",
  "API_SPECS",
  "DATABASE_MODELS",
  "DIAGRAMS",
  "VERSION_HISTORY",
  "TEAM",
];

/**
 * Deterministic, AI-free: assemble the SSOT, analyze it, hash the result. Reused
 * by generate (basis for the review) and by the read endpoints (current basis,
 * for staleness + the score cards). No provider call — cheap on every refresh.
 */
export async function computeAnalysisAndHash(
  projectId: string,
): Promise<{ analysis: AnalysisResult; analysisHash: string }> {
  const content = await buildExportContent(projectId, "JSON", ALL_REVIEW_SECTIONS);
  const analysis = analyzeExportSnapshot(content);
  return { analysis, analysisHash: hashAnalysis(analysis) };
}

function logAiFailure(fields: Record<string, unknown>): void {
  // Scalar metadata only — never the prompt, the AI output, or any secret.
  // eslint-disable-next-line no-console
  console.warn("[ai] architecture review failed " + JSON.stringify(fields));
}

export interface ReviewParams {
  projectId: string;
  userId: string;
}

export async function generateArchitectureReview(params: ReviewParams): Promise<ReviewResult> {
  const provider = getAiProvider();

  // ── Deterministic chain: SSOT → AnalysisResult → digest (no AI yet) ──
  const content = await buildExportContent(params.projectId, "JSON", ALL_REVIEW_SECTIONS);
  const analysis = analyzeExportSnapshot(content);
  const digest = buildReviewDigest(analysis, content as ExportSnapshot);
  const analysisHash = hashAnalysis(analysis);
  const generatedAt = analysis.meta.generatedAt || "";

  const system = buildReviewSystemPrompt();
  const baseUser = buildReviewUserPrompt(digest);

  let review: ArchitectureReview | null = null;
  let truncated = false;
  let missingSections: string[] = [];
  let model = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let stopReason: string | null = null;
  let maxTokens = 0;
  let durationMs = 0;
  let lastError = "";

  const base = { projectId: params.projectId, userId: params.userId };
  const outputBudget = reviewMaxTokens();

  // First attempt + one repair retry on complete-but-off-schema output. A
  // truncated (max_tokens) response is NOT retried — it would truncate the same.
  for (let attempt = 0; attempt < 2 && !review; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nYour previous tool call was rejected by schema validation (${lastError}). Call ${REVIEW_TOOL_NAME} again with corrected, schema-valid data.`;

    let result: StructuredResult;
    try {
      result = await provider.generateStructured({
        system,
        user,
        toolName: REVIEW_TOOL_NAME,
        toolDescription: REVIEW_TOOL_DESCRIPTION,
        inputSchema: reviewToolInputSchema,
        maxTokens: outputBudget,
      });
    } catch (err) {
      logAiFailure({ ...base, stage: "provider", model: model || "(unknown)", durationMs, code: "AI_PROVIDER_ERROR", message: err instanceof Error ? err.message : String(err) });
      throw err; // AiProviderError → controller 502
    }

    model = result.model;
    usage = result.usage;
    stopReason = result.stopReason;
    maxTokens = result.maxTokens;
    durationMs += result.durationMs;

    if (result.stopReason === "max_tokens") {
      // Graceful degradation: bounded output makes this rare, but if it happens
      // the completed prefix is still useful (recommendations emit last). Salvage
      // it and flag what was lost rather than discarding a good review. Don't
      // retry — a retry truncates identically.
      const salvaged = salvageTruncatedReview(result.data);
      if (salvaged) {
        review = salvaged.review;
        truncated = true;
        missingSections = salvaged.missingSections;
        // eslint-disable-next-line no-console
        console.warn("[ai] architecture review truncated-salvaged " + JSON.stringify({
          ...base, model, outputTokens: usage.outputTokens, maxTokens, durationMs, missingSections,
        }));
        break;
      }
      // Nothing usable arrived → honest failure.
      logAiFailure({ ...base, stage: "truncated", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_OUTPUT_TRUNCATED" });
      throw new AiOutputTruncatedError({ maxTokens, outputTokens: usage.outputTokens });
    }

    const parsed = architectureReviewSchema.safeParse(result.data);
    if (parsed.success) {
      review = parsed.data as ArchitectureReview;
    } else {
      lastError = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    }
  }

  if (!review) {
    logAiFailure({ ...base, stage: "schema", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_SCHEMA_ERROR", schemaSummary: lastError });
    throw new AiSchemaError(`The AI review did not match the required schema (${lastError}).`);
  }

  // ── Deterministic post-check: strip unsupported citations, flag unverifiable ──
  const verified = verifyReviewEvidence(review, digest);

  // ── Audit (read-only): persist review metadata as a first-class REVIEW
  // AiSession. The kind + analysisHash are real columns; the JSON payload holds
  // the review snapshot and verification stats. This is audit metadata only —
  // never a graph node, never SSOT (same role as a bootstrap AiSession).
  let savedId: string | null = null;
  try {
    const created = await prisma.aiSession.create({
      data: {
        projectId: params.projectId,
        kind: AiSessionKind.REVIEW,
        status: AiSessionStatus.PROPOSED,
        idea: "",
        model,
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        analysisHash,
        proposal: {
          generatedAt,
          truncated,
          missingSections,
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
    logAiFailure({ ...base, stage: "audit", model, code: "AI_AUDIT_WRITE_FAILED", message: err instanceof Error ? err.message : String(err) });
  }

  return {
    id: savedId,
    review: verified.review,
    analysis,
    analysisHash,
    model,
    usage,
    generatedAt,
    truncated,
    missingSections,
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
