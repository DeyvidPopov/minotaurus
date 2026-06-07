// advisor.service.ts — orchestrates the read-only AI Architecture Advisor (the
// "Advisor / Next Steps" mode of AI Review). The deterministic chain + the
// provider generation loop are shared with the Full Review mode via
// ../architecture/analysis-runner.ts; this file owns only the advisor-specific
// spec (prompt/schema/verify policy), persistence, and the read endpoints.
//
// READ-ONLY w.r.t. architecture: this NEVER calls prisma.*.create/update/delete
// on any SSOT entity. The ONLY write is a lightweight AiSession(ADVISOR) audit
// row — never a graph node, never SSOT — so advisor results survive refresh and
// gain history + staleness, exactly like Full Review. AI interprets the
// deterministic AnalysisResult; it never produces or alters it.

import { AiSessionKind, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { AnalysisResult } from "../../exports/analysis/analysis.types.js";
import {
  buildAnalysisContext,
  computeAnalysisAndHash,
  runArchitectureGeneration,
  type GenerationSpec,
} from "../architecture/analysis-runner.js";
import { getAiProvider, type AiProvider } from "../providers/ai.provider.js";
import { buildAdvisorSystemPrompt, buildAdvisorUserPrompt } from "./advisor.prompt.js";
import {
  ADVISOR_TOOL_DESCRIPTION,
  ADVISOR_TOOL_NAME,
  advisorReportSchema,
  advisorToolInputSchema,
} from "./advisor.schema.js";
import { salvageTruncatedAdvisory } from "./advisor.salvage.js";
import { toStoredAdvisorResult } from "./advisor.read.js";
import { verifyAdvisorEvidence } from "./advisor.verify.js";
import type { AdvisorListItem, AdvisorReport, AdvisorResult } from "./advisor.types.js";

/** Output-token budget for an advisory. Bounded output keeps this comfortable;
 *  the headroom (default 6k) is insurance, not the primary fix. */
const DEFAULT_ADVISOR_MAX_TOKENS = 6000;
function advisorMaxTokens(): number {
  const v = Number(process.env.AI_ADVISOR_MAX_TOKENS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ADVISOR_MAX_TOKENS;
}

// ───────────────────────── injectable dependencies (for tests) ─────────────────────────
//
// Production uses the real Prisma singleton, the env-selected provider, and the
// real deterministic analysis. A test can swap any of these for in-memory fakes
// (no DB, no network, no export engine) via __setAdvisorDeps — keeping the
// persist/read/staleness orchestration unit-testable while the pure decisions
// stay in the engine/verifier. Mirrors __setRegistrationDeps.
export interface AdvisorDeps {
  db: typeof prisma;
  /** null → the env-selected provider (getAiProvider, which 503s if unconfigured). */
  provider: AiProvider | null;
  /** Full deterministic context (incl. digest) for a generation pass. */
  loadContext: typeof buildAnalysisContext;
  /** Cheap analysis+hash recompute for the read endpoints (no digest, no AI). */
  computeAnalysis: typeof computeAnalysisAndHash;
}

let testDeps: Partial<AdvisorDeps> | null = null;

/** TEST ONLY: override some/all dependencies. Pass null to restore defaults. */
export function __setAdvisorDeps(d: Partial<AdvisorDeps> | null): void {
  testDeps = d;
}

function deps(): AdvisorDeps {
  return {
    db: prisma,
    provider: null,
    loadContext: buildAnalysisContext,
    computeAnalysis: computeAnalysisAndHash,
    ...(testDeps ?? {}),
  };
}

// The advisor-specific half of the shared runner. Everything else (provider call,
// repair retry, truncation handling, error taxonomy) is in the runner. The
// verification POLICY (discard unsupported, vs. Full Review's flag) is applied
// after generation, below.
const advisorSpec: GenerationSpec<AdvisorReport> = {
  label: "architecture advisory",
  toolName: ADVISOR_TOOL_NAME,
  toolDescription: ADVISOR_TOOL_DESCRIPTION,
  inputSchema: advisorToolInputSchema,
  buildSystem: buildAdvisorSystemPrompt,
  buildUser: buildAdvisorUserPrompt,
  parseStrict: (data) => {
    const parsed = advisorReportSchema.safeParse(data);
    if (parsed.success) return { ok: true, report: parsed.data as AdvisorReport };
    return { ok: false, error: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  },
  salvage: salvageTruncatedAdvisory,
  maxTokens: advisorMaxTokens,
};

function logAuditFailure(fields: Record<string, unknown>): void {
  // Scalar metadata only — never the prompt, the AI output, or any secret.
  // eslint-disable-next-line no-console
  console.warn("[ai] architecture advisory audit " + JSON.stringify(fields));
}

export interface AdvisorParams {
  projectId: string;
  userId: string;
}

export async function generateArchitectureAdvisory(params: AdvisorParams): Promise<AdvisorResult> {
  const d = deps();

  // ── Deterministic chain: SSOT → AnalysisResult → digest (no AI yet) ──
  const { analysis, digest, analysisHash, generatedAt } = await d.loadContext(params.projectId);
  const base = { projectId: params.projectId, userId: params.userId };

  // ── Shared generation loop (provider, repair retry, truncation salvage) ──
  const gen = await runArchitectureGeneration(advisorSpec, digest, base, d.provider ?? getAiProvider());

  // ── Deterministic post-check (STRICTER than Full Review): strip unsupported
  //    citations, DISCARD any item left with no verifiable evidence, order
  //    recommendations by priority. ──
  const verified = verifyAdvisorEvidence(gen.report, digest);

  // ── Audit + persistence: store the advisory as a first-class ADVISOR AiSession
  // so it survives refresh and gains history + staleness. The kind + analysisHash
  // are real columns; the JSON payload holds the report + verification stats.
  // Audit metadata only — never a graph node, never SSOT (Advisor may write only
  // its own AI session record). ──
  let savedId: string | null = null;
  try {
    const created = await d.db.aiSession.create({
      data: {
        projectId: params.projectId,
        kind: AiSessionKind.ADVISOR,
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
          report: verified.report,
          verification: {
            totalRefs: verified.totalRefs,
            removedRefs: verified.removedRefs,
            discardedFindings: verified.discardedFindings,
          },
        } as unknown as Prisma.InputJsonValue,
        createdById: params.userId,
      },
    });
    savedId = created.id;
  } catch (err) {
    // Audit is best-effort; a failed metadata write must not fail a read-only
    // advisory. Log scalar diagnostics and return the advisory anyway.
    logAuditFailure({ ...base, model: gen.model, code: "AI_AUDIT_WRITE_FAILED", message: err instanceof Error ? err.message : String(err) });
  }

  return {
    id: savedId,
    report: verified.report,
    analysis,
    analysisHash,
    model: gen.model,
    usage: gen.usage,
    generatedAt,
    truncated: gen.truncated,
    missingSections: gen.missingSections,
    stale: false, // just generated against the current analysis
    verification: {
      totalRefs: verified.totalRefs,
      removedRefs: verified.removedRefs,
      discardedFindings: verified.discardedFindings,
    },
  };
}

// ── Read endpoints (reuse persisted advisories — NO AI call) ──
// These never touch the provider; the only work is a DB read + a cheap,
// deterministic analysis recompute (for staleness + the score cards).

/** Latest persisted advisory for the project, or null if none exists. */
export async function getLatestAdvisor(projectId: string): Promise<AdvisorResult | null> {
  const d = deps();
  const row = await d.db.aiSession.findFirst({
    where: { projectId, kind: AiSessionKind.ADVISOR },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  const { analysis, analysisHash } = await d.computeAnalysis(projectId);
  return toStoredAdvisorResult(row, analysis as AnalysisResult, analysisHash);
}

/** A specific persisted advisory (read-only), or null if not found in this project. */
export async function getAdvisorById(projectId: string, advisorId: string): Promise<AdvisorResult | null> {
  const d = deps();
  const row = await d.db.aiSession.findFirst({
    where: { id: advisorId, projectId, kind: AiSessionKind.ADVISOR },
  });
  if (!row) return null;
  const { analysis, analysisHash } = await d.computeAnalysis(projectId);
  return toStoredAdvisorResult(row, analysis as AnalysisResult, analysisHash);
}

/** Advisor history metadata, newest first. */
export async function listAdvisors(projectId: string): Promise<AdvisorListItem[]> {
  const d = deps();
  const rows = await d.db.aiSession.findMany({
    where: { projectId, kind: AiSessionKind.ADVISOR },
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
