// analysis-runner.ts — the shared, consolidated engine behind BOTH modes of AI
// Architecture analysis: Full Review and Advisor (Project → AI Review →
// [Full Review | Advisor]). The two modes differ only in prompt / schema /
// verification policy / output sections / persistence kind; the deterministic
// INPUT pipeline and the provider GENERATION LOOP are identical and live here so
// the heuristics — and the truncation/retry/error handling — can never drift
// between modes. Previously these were two near-identical copies (see the overlap
// audit); this is the single source.
//
// Determinism boundary (CLAUDE.md AI Safety Rule 3): this assembles the SSOT,
// runs the deterministic analysis + digest, and hands the BOUNDED digest to the
// model. AI never feeds back into AnalysisResult. This module performs NO DB
// writes — persistence is the caller's (mode-specific) concern.

import { buildExportContent } from "../../exports/exports.engine.js";
import { analyzeExportSnapshot } from "../../exports/analysis/metrics.engine.js";
import type { AnalysisResult, ExportSnapshot } from "../../exports/analysis/analysis.types.js";
import { buildReviewDigest } from "../review/review.digest.js";
import { hashAnalysis } from "../review/review.read.js";
import type { ReviewDigest } from "../review/review.types.js";
import { getAiProvider, type AiProvider, type StructuredResult } from "../providers/ai.provider.js";
import { AiOutputTruncatedError, AiSchemaError } from "../ai.service.js";

// Re-export so both mode services have a single import surface for the shared core.
export { hashAnalysis };

// Everything the deterministic analysis engine reads. Neither mode sends raw SSOT
// to the model — this only feeds the analysis engine, whose bounded output (the
// digest) is what the model sees. Both modes use the SAME sections.
export const ARCH_ANALYSIS_SECTIONS = [
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

/** The deterministic, AI-free analysis context both modes generate against. */
export interface AnalysisContext {
  content: ExportSnapshot;
  analysis: AnalysisResult;
  digest: ReviewDigest;
  analysisHash: string;
  generatedAt: string;
}

/**
 * Deterministic, AI-free: assemble the SSOT, analyze it, hash the result. Used by
 * the read endpoints (current basis, for staleness + the score cards). No
 * provider call — cheap on every refresh.
 */
export async function computeAnalysisAndHash(
  projectId: string,
): Promise<{ analysis: AnalysisResult; analysisHash: string }> {
  const content = await buildExportContent(projectId, "JSON", ARCH_ANALYSIS_SECTIONS);
  const analysis = analyzeExportSnapshot(content);
  return { analysis, analysisHash: hashAnalysis(analysis) };
}

/** Full deterministic context (incl. the bounded digest) for a generation pass. */
export async function buildAnalysisContext(projectId: string): Promise<AnalysisContext> {
  const content = await buildExportContent(projectId, "JSON", ARCH_ANALYSIS_SECTIONS);
  const analysis = analyzeExportSnapshot(content);
  const digest = buildReviewDigest(analysis, content as ExportSnapshot);
  return {
    content: content as ExportSnapshot,
    analysis,
    digest,
    analysisHash: hashAnalysis(analysis),
    generatedAt: analysis.meta.generatedAt || "",
  };
}

/**
 * The per-mode pieces the shared loop needs. `parseStrict` validates the normal
 * path; `salvage` recovers a max_tokens-truncated prefix (or returns null). The
 * loop owns the provider call, the one repair retry, truncation handling, error
 * taxonomy and logging — everything that used to be duplicated per mode.
 */
export interface GenerationSpec<T> {
  /** Short noun for log lines, e.g. "architecture review" / "architecture advisory". */
  label: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  buildSystem(): string;
  /** `repairHint` is set on the retry attempt with the prior schema error. */
  buildUser(digest: ReviewDigest, repairHint?: string): string;
  parseStrict(data: unknown): { ok: true; report: T } | { ok: false; error: string };
  salvage(data: unknown): { report: T; missingSections: string[] } | null;
  maxTokens(): number;
}

export interface GenerationOutput<T> {
  report: T;
  truncated: boolean;
  missingSections: string[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string | null;
  maxTokens: number;
  durationMs: number;
}

function logAiFailure(label: string, fields: Record<string, unknown>): void {
  // Scalar metadata only — never the prompt, the AI output, or any secret.
  // eslint-disable-next-line no-console
  console.warn(`[ai] ${label} failed ` + JSON.stringify(fields));
}

/**
 * The shared generation loop: first attempt + one repair retry on
 * complete-but-off-schema output. A truncated (max_tokens) response is NOT
 * retried — it would truncate identically — but its completed prefix is salvaged.
 * Throws `AiOutputTruncatedError` / `AiSchemaError`, and propagates provider
 * errors, exactly as the per-mode copies did. The default provider is the
 * env-selected one; tests pass a fake.
 */
export async function runArchitectureGeneration<T>(
  spec: GenerationSpec<T>,
  digest: ReviewDigest,
  base: { projectId: string; userId: string },
  provider: AiProvider = getAiProvider(),
): Promise<GenerationOutput<T>> {
  const system = spec.buildSystem();

  let report: T | null = null;
  let truncated = false;
  let missingSections: string[] = [];
  let model = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let stopReason: string | null = null;
  let maxTokens = 0;
  let durationMs = 0;
  let lastError = "";

  const outputBudget = spec.maxTokens();

  for (let attempt = 0; attempt < 2 && report === null; attempt++) {
    const user = attempt === 0 ? spec.buildUser(digest) : spec.buildUser(digest, lastError);

    let result: StructuredResult;
    try {
      result = await provider.generateStructured({
        system,
        user,
        toolName: spec.toolName,
        toolDescription: spec.toolDescription,
        inputSchema: spec.inputSchema,
        maxTokens: outputBudget,
      });
    } catch (err) {
      logAiFailure(spec.label, { ...base, stage: "provider", model: model || "(unknown)", durationMs, code: "AI_PROVIDER_ERROR", message: err instanceof Error ? err.message : String(err) });
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
      // it and flag what was lost rather than discarding good output. Don't retry.
      const salvaged = spec.salvage(result.data);
      if (salvaged) {
        report = salvaged.report;
        truncated = true;
        missingSections = salvaged.missingSections;
        // eslint-disable-next-line no-console
        console.warn(`[ai] ${spec.label} truncated-salvaged ` + JSON.stringify({
          ...base, model, outputTokens: usage.outputTokens, maxTokens, durationMs, missingSections,
        }));
        break;
      }
      // Nothing usable arrived → honest failure.
      logAiFailure(spec.label, { ...base, stage: "truncated", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_OUTPUT_TRUNCATED" });
      throw new AiOutputTruncatedError({ maxTokens, outputTokens: usage.outputTokens });
    }

    const parsed = spec.parseStrict(result.data);
    if (parsed.ok) report = parsed.report;
    else lastError = parsed.error;
  }

  if (report === null) {
    logAiFailure(spec.label, { ...base, stage: "schema", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_SCHEMA_ERROR", schemaSummary: lastError });
    throw new AiSchemaError(`The AI ${spec.label} did not match the required schema (${lastError}).`);
  }

  return { report, truncated, missingSections, model, usage, stopReason, maxTokens, durationMs };
}
