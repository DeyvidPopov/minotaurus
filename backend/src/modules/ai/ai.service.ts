// ai.service.ts — propose orchestration: prompt → provider → Zod parse (with one
// repair retry) → deterministic preview validation → persist a PROPOSED AiSession.
// Persists audit metadata only; it never creates artifacts/relations/diagrams.

import { AiSessionKind, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getAiProvider, type StructuredResult } from "./providers/ai.provider.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts/bootstrap.prompt.js";
import {
  BOOTSTRAP_TOOL_DESCRIPTION,
  BOOTSTRAP_TOOL_NAME,
  bootstrapProposalSchema,
  bootstrapToolInputSchema,
} from "./proposal/bootstrap.schema.js";
import { validateBootstrapProposal, type ValidationContext } from "./proposal/bootstrap.validator.js";
import { normalizeMermaidSource } from "./proposal/mermaid-normalize.js";
import type { BootstrapProposal, ProposeResult } from "./ai.types.js";

export class AiSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiSchemaError";
  }
}

/**
 * The model hit its output-token ceiling before finishing the structured
 * proposal (Anthropic returns HTTP 200 with stop_reason "max_tokens"). The
 * provider did NOT fail — the response is simply truncated. Carries the budget
 * vs. usage so the caller can advise narrowing the idea or raising the limit.
 */
export class AiOutputTruncatedError extends Error {
  constructor(public details: { maxTokens: number; outputTokens: number }) {
    super(
      "The AI response was too large and was truncated before a complete proposal could be generated.",
    );
    this.name = "AiOutputTruncatedError";
  }
}

function summarizeIssues(error: import("zod").ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Structured, low-cardinality diagnostics for a failed proposal generation.
 * Deliberately logs scalar metadata only — never the user prompt, the AI output,
 * or any secret.
 */
function logAiFailure(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn("[ai] bootstrap proposal failed " + JSON.stringify(fields));
}

export interface ProposeParams {
  projectId: string;
  userId: string;
  idea: string;
}

export async function proposeBootstrap(params: ProposeParams): Promise<ProposeResult> {
  const provider = getAiProvider();
  const system = buildSystemPrompt();
  const baseUser = buildUserPrompt(params.idea);

  let proposal: BootstrapProposal | null = null;
  let model = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let stopReason: string | null = null;
  let maxTokens = 0;
  let durationMs = 0;
  let lastError = "";

  const base = { projectId: params.projectId, userId: params.userId };

  // First attempt + one repair retry if the model returns *complete but off-schema*
  // JSON. A truncated (max_tokens) response is NOT retried — see below.
  for (let attempt = 0; attempt < 2 && !proposal; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nYour previous tool call was rejected by schema validation (${lastError}). Call ${BOOTSTRAP_TOOL_NAME} again with corrected, schema-valid data.`;

    let result: StructuredResult;
    try {
      result = await provider.generateStructured({
        system,
        user,
        toolName: BOOTSTRAP_TOOL_NAME,
        toolDescription: BOOTSTRAP_TOOL_DESCRIPTION,
        inputSchema: bootstrapToolInputSchema,
      });
    } catch (err) {
      // Genuine provider/transport failure (network, 4xx/5xx, no tool block).
      logAiFailure({ ...base, stage: "provider", model: model || "(unknown)", durationMs, code: "AI_PROVIDER_ERROR", message: err instanceof Error ? err.message : String(err) });
      throw err; // AiProviderError → controller 502
    }

    model = result.model;
    usage = result.usage;
    stopReason = result.stopReason;
    maxTokens = result.maxTokens;
    durationMs += result.durationMs;

    // The model exhausted the output-token budget → the tool JSON is truncated
    // (e.g. the trailing `relations`/`diagrams` are missing). Retrying would
    // truncate identically and just double the latency, so report it honestly
    // instead of running the repair attempt or blaming the provider.
    if (result.stopReason === "max_tokens") {
      logAiFailure({ ...base, stage: "truncated", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_OUTPUT_TRUNCATED" });
      throw new AiOutputTruncatedError({ maxTokens, outputTokens: usage.outputTokens });
    }

    const parsed = bootstrapProposalSchema.safeParse(result.data);
    if (parsed.success) {
      proposal = parsed.data as BootstrapProposal;
    } else {
      lastError = summarizeIssues(parsed.error);
    }
  }

  if (!proposal) {
    logAiFailure({ ...base, stage: "schema", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_SCHEMA_ERROR", schemaSummary: lastError });
    throw new AiSchemaError(`The AI proposal did not match the required schema (${lastError}).`);
  }

  // AI Mermaid is structure-only: strip any styling/theme directives so the
  // preview, validation, and the audit snapshot all carry clean structure.
  proposal = {
    ...proposal,
    diagrams: proposal.diagrams.map((d) => ({
      ...d,
      mermaidSource: normalizeMermaidSource(d.mermaidSource),
    })),
  };

  // Deterministic preview validation against the live project.
  const [existingArtifacts, existingRelations] = await Promise.all([
    prisma.artifact.findMany({
      where: { projectId: params.projectId },
      select: { id: true, normalizedTitle: true },
    }),
    prisma.artifactRelation.findMany({
      where: { sourceArtifact: { projectId: params.projectId } },
      select: { sourceArtifactId: true, targetArtifactId: true, relationType: true },
    }),
  ]);
  const ctx: ValidationContext = { existingArtifacts, existingRelations };
  const validation = validateBootstrapProposal(proposal, ctx);

  // Persist lightweight audit metadata (PROPOSED). Nothing in the SSOT changes.
  const session = await prisma.aiSession.create({
    data: {
      projectId: params.projectId,
      kind: AiSessionKind.BOOTSTRAP,
      status: AiSessionStatus.PROPOSED,
      idea: params.idea,
      model,
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      proposal: proposal as unknown as Prisma.InputJsonValue,
      artifactsProposed: proposal.artifacts.length,
      relationsProposed: proposal.relations.length,
      diagramsProposed: proposal.diagrams.length,
      createdById: params.userId,
    },
  });

  return { sessionId: session.id, proposal, validation };
}
