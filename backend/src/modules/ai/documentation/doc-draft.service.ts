// doc-draft.service.ts — orchestrates the artifact Documentation Assistant:
//   fetch artifact + bounded local neighborhood → buildArtifactDocumentationDigest
//   (pure) → provider (forced tool, one repair retry) → Zod parse → optional
//   best-effort AiSession(DOCUMENTATION_DRAFT) audit row.
//
// READ-ONLY w.r.t. the SSOT: this NEVER calls prisma.*.create/update/delete on
// documentation or any domain entity. The only write is a lightweight audit row
// (metadata, like a bootstrap/review session). AI drafts text; the user reviews
// and saves it through the existing PUT /artifacts/:id/documentation path.

import { AiSessionKind, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { getAiProvider, type StructuredResult } from "../providers/ai.provider.js";
import { AiOutputTruncatedError, AiSchemaError } from "../ai.service.js";
import { buildArtifactDocumentationDigest } from "./doc-draft.digest.js";
import { buildDocDraftSystemPrompt, buildDocDraftUserPrompt } from "./doc-draft.prompt.js";
import {
  DOC_DRAFT_TOOL_DESCRIPTION,
  DOC_DRAFT_TOOL_NAME,
  docDraftSchema,
  docDraftToolInputSchema,
} from "./doc-draft.schema.js";
import type { DocDraftResult, RawDocDigestInput } from "./doc-draft.types.js";

/** A doc draft is short; a tight budget keeps latency/cost low. Override with
 *  AI_DOC_DRAFT_MAX_TOKENS. */
const DEFAULT_DOC_DRAFT_MAX_TOKENS = 2048;
function docDraftMaxTokens(): number {
  const v = Number(process.env.AI_DOC_DRAFT_MAX_TOKENS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DOC_DRAFT_MAX_TOKENS;
}

/** Thrown when the artifact doesn't exist or isn't in the given project → 404. */
export class DocArtifactNotFoundError extends Error {
  constructor() {
    super("Artifact not found");
    this.name = "DocArtifactNotFoundError";
  }
}

function logAiFailure(fields: Record<string, unknown>): void {
  // Scalar metadata only — never the prompt, the AI output, or any secret.
  // eslint-disable-next-line no-console
  console.warn("[ai] documentation draft failed " + JSON.stringify(fields));
}

export interface DocDraftParams {
  projectId: string;
  artifactId: string;
  userId: string;
}

/**
 * Assemble the bounded raw input for ONE artifact: the artifact itself, its
 * incoming/outgoing relations (with neighbor metadata), and the resources linked
 * via artifactId (API specs, DB models, diagrams) plus its validation issues.
 * Never the whole project.
 */
async function loadRawDigestInput(
  projectId: string,
  artifactId: string,
): Promise<RawDocDigestInput | null> {
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: { project: { select: { id: true, name: true, description: true } } },
  });
  if (!artifact || artifact.projectId !== projectId) return null;

  const [outgoing, incoming, apiSpecs, databaseModels, diagrams, validationIssues] =
    await Promise.all([
      prisma.artifactRelation.findMany({
        where: { sourceArtifactId: artifactId },
        select: {
          relationType: true,
          targetArtifact: { select: { title: true, type: true, status: true } },
        },
      }),
      prisma.artifactRelation.findMany({
        where: { targetArtifactId: artifactId },
        select: {
          relationType: true,
          sourceArtifact: { select: { title: true, type: true, status: true } },
        },
      }),
      prisma.apiSpec.findMany({
        where: { artifactId },
        select: { title: true, version: true, endpoints: { select: { path: true } } },
      }),
      prisma.databaseModel.findMany({
        where: { artifactId },
        select: { title: true, databaseType: true, entities: { select: { name: true } } },
      }),
      prisma.diagram.findMany({
        where: { artifactId },
        select: { title: true, type: true },
      }),
      prisma.validationIssue.findMany({
        where: { projectId, artifactId, status: "OPEN" },
        select: { severity: true, category: true, message: true },
      }),
    ]);

  return {
    project: { name: artifact.project.name, description: artifact.project.description },
    artifact: {
      id: artifact.id,
      title: artifact.title,
      type: artifact.type,
      status: artifact.status,
      tags: artifact.tags,
      description: artifact.description,
      documentationContent: artifact.documentationContent,
    },
    incoming: incoming.map((r) => ({
      relationType: r.relationType,
      neighborTitle: r.sourceArtifact.title,
      neighborType: r.sourceArtifact.type,
      neighborStatus: r.sourceArtifact.status,
    })),
    outgoing: outgoing.map((r) => ({
      relationType: r.relationType,
      neighborTitle: r.targetArtifact.title,
      neighborType: r.targetArtifact.type,
      neighborStatus: r.targetArtifact.status,
    })),
    apiSpecs: apiSpecs.map((s) => ({
      title: s.title,
      version: s.version,
      endpointPaths: s.endpoints.map((e) => e.path),
    })),
    databaseModels: databaseModels.map((m) => ({
      title: m.title,
      databaseType: m.databaseType,
      entityNames: m.entities.map((e) => e.name),
    })),
    diagrams: diagrams.map((d) => ({ title: d.title, diagramType: d.type })),
    validationIssues: validationIssues.map((v) => ({
      severity: v.severity,
      category: v.category,
      message: v.message,
    })),
  };
}

export async function generateDocumentationDraft(
  params: DocDraftParams,
): Promise<DocDraftResult> {
  const provider = getAiProvider();

  const raw = await loadRawDigestInput(params.projectId, params.artifactId);
  if (!raw) throw new DocArtifactNotFoundError();

  const digest = buildArtifactDocumentationDigest(raw);
  const mode = digest.artifact.hasDocumentation ? "replacement_suggestion" : "new";

  const system = buildDocDraftSystemPrompt();
  const baseUser = buildDocDraftUserPrompt(digest);

  let markdown: string | null = null;
  let truncated = false;
  let model = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let stopReason: string | null = null;
  let maxTokens = 0;
  let durationMs = 0;
  let lastError = "";

  const base = { projectId: params.projectId, artifactId: params.artifactId, userId: params.userId };
  const outputBudget = docDraftMaxTokens();

  // First attempt + one repair retry on complete-but-off-schema output. A
  // truncated (max_tokens) response is NOT retried — it would truncate the same.
  for (let attempt = 0; attempt < 2 && markdown === null; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nYour previous tool call was rejected by schema validation (${lastError}). Call ${DOC_DRAFT_TOOL_NAME} again with corrected, schema-valid data.`;

    let result: StructuredResult;
    try {
      result = await provider.generateStructured({
        system,
        user,
        toolName: DOC_DRAFT_TOOL_NAME,
        toolDescription: DOC_DRAFT_TOOL_DESCRIPTION,
        inputSchema: docDraftToolInputSchema,
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
      // Graceful degradation: a draft is advisory and the user edits it, so a
      // truncated-but-non-empty Markdown string is still useful. Salvage it and
      // flag truncated; only fail when nothing usable arrived. Don't retry — it
      // would truncate identically.
      const salvaged = docDraftSchema.safeParse(result.data);
      if (salvaged.success) {
        markdown = salvaged.data.markdown;
        truncated = true;
        break;
      }
      logAiFailure({ ...base, stage: "truncated", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_OUTPUT_TRUNCATED" });
      throw new AiOutputTruncatedError({ maxTokens, outputTokens: usage.outputTokens });
    }

    const parsed = docDraftSchema.safeParse(result.data);
    if (parsed.success) {
      markdown = parsed.data.markdown;
    } else {
      lastError = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    }
  }

  if (markdown === null) {
    logAiFailure({ ...base, stage: "schema", model, stopReason, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, maxTokens, durationMs, code: "AI_SCHEMA_ERROR", schemaSummary: lastError });
    throw new AiSchemaError(`The AI documentation draft did not match the required schema (${lastError}).`);
  }

  const generatedAt = new Date().toISOString();

  // ── Audit (best-effort): persist draft metadata only — NEVER the documentation
  // itself, never the prompt. Like a bootstrap/review session, this is metadata,
  // never SSOT. A failed audit write must not fail the read-only draft. ──
  let sessionId: string | null = null;
  try {
    const created = await prisma.aiSession.create({
      data: {
        projectId: params.projectId,
        kind: AiSessionKind.DOCUMENTATION_DRAFT,
        status: AiSessionStatus.PROPOSED,
        idea: "",
        model,
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        proposal: {
          artifactId: params.artifactId,
          generatedAt,
          mode,
          truncated,
          markdownLength: markdown.length,
        } as unknown as Prisma.InputJsonValue,
        createdById: params.userId,
      },
    });
    sessionId = created.id;
  } catch (err) {
    logAiFailure({ ...base, stage: "audit", model, code: "AI_AUDIT_WRITE_FAILED", message: err instanceof Error ? err.message : String(err) });
  }

  return {
    sessionId,
    markdown,
    mode,
    generatedAt,
    model,
    usage,
    truncated,
  };
}
