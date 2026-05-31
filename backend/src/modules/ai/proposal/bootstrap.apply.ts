// bootstrap.apply.ts — the ONLY path from an AI proposal to the database
// (CLAUDE.md "AI Safety & Determinism" Rule 1). It consumes an already-validated,
// user-selected proposal and creates real artifacts / relations / diagrams through
// the same fields the regular controllers use — so title normalization, version
// events and DRAFT status all apply. No AI/model logic lives here.
//
// Determinism boundary: the proposal is re-validated server-side (never trusting
// the client); only `accepted` items are created; everything else is reported as
// skipped. Artifacts are created as DRAFT and carry no AI prose in their fields —
// the rationale lives only in the audit snapshot (AiSession.proposal).

import { ArtifactStatus, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { normalizeArtifactTitle } from "../../artifacts/artifact-title.js";
import { parseMermaid } from "../../ingestion/mermaid.engine.js";
import { recordVersionEvent } from "../../versions/versions.engine.js";
import { validateBootstrapProposal, type ValidationContext } from "./bootstrap.validator.js";
import { normalizeMermaidSource } from "./mermaid-normalize.js";
import type { ApplyResult, BootstrapProposal, SkippedItem, ValidationReport } from "../ai.types.js";

export class BootstrapValidationError extends Error {
  constructor(public report: ValidationReport) {
    super("AI proposal failed deterministic validation");
    this.name = "BootstrapValidationError";
  }
}

export class BootstrapConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapConflictError";
  }
}

export interface ApplyParams {
  projectId: string;
  userId: string;
  proposal: BootstrapProposal;
  /** Links the apply to the propose-time AiSession for audit; optional. */
  sessionId?: string | null;
}

const AI_TAGS = ["ai", "bootstrap"];

function gxgy() {
  return {
    gx: Math.floor(Math.random() * 600) + 50,
    gy: Math.floor(Math.random() * 400) + 50,
  };
}

function buildSkipped(report: ValidationReport): SkippedItem[] {
  const out: SkippedItem[] = [];
  for (const a of report.artifacts) {
    if (!a.accepted) out.push({ kind: "ARTIFACT", label: a.title, reason: a.reason ?? "skipped" });
  }
  for (const r of report.relations) {
    if (!r.accepted) {
      out.push({
        kind: "RELATION",
        label: `${r.sourceTitle} → ${r.targetTitle} (${r.relationType})`,
        reason: r.reason ?? "skipped",
      });
    }
  }
  for (const d of report.diagrams) {
    if (!d.accepted) out.push({ kind: "DIAGRAM", label: d.title, reason: d.reason ?? "skipped" });
  }
  return out;
}

export async function applyBootstrap(params: ApplyParams): Promise<ApplyResult> {
  const { projectId, userId } = params;
  // AI Mermaid is structure-only: strip any styling before validation + persistence.
  const proposal: BootstrapProposal = {
    ...params.proposal,
    diagrams: params.proposal.diagrams.map((d) => ({
      ...d,
      mermaidSource: normalizeMermaidSource(d.mermaidSource),
    })),
  };

  // ── Re-validate against the live project (authoritative) ──
  const [existingArtifacts, existingRelations] = await Promise.all([
    prisma.artifact.findMany({
      where: { projectId },
      select: { id: true, normalizedTitle: true },
    }),
    prisma.artifactRelation.findMany({
      where: { sourceArtifact: { projectId } },
      select: { sourceArtifactId: true, targetArtifactId: true, relationType: true },
    }),
  ]);
  const ctx: ValidationContext = { existingArtifacts, existingRelations };
  const report = validateBootstrapProposal(proposal, ctx);
  if (!report.ok) throw new BootstrapValidationError(report);

  // ── Create accepted items, reusing the standard creation fields ──
  let created: {
    artifacts: { id: string; title: string; type: BootstrapProposal["artifacts"][number]["type"] }[];
    relations: {
      id: string;
      sourceTitle: string;
      targetTitle: string;
      relationType: BootstrapProposal["relations"][number]["relationType"];
      sourceArtifactId: string;
      targetArtifactId: string;
    }[];
    diagrams: { id: string; title: string }[];
  };
  try {
    created = await prisma.$transaction(async (tx) => {
      const normToId = new Map<string, string>();
      for (const e of existingArtifacts) normToId.set(e.normalizedTitle, e.id);

      const artifacts: typeof created.artifacts = [];
      for (let i = 0; i < proposal.artifacts.length; i++) {
        if (!report.artifacts[i].accepted) continue;
        const a = proposal.artifacts[i];
        const norm = normalizeArtifactTitle(a.title);
        const row = await tx.artifact.create({
          data: {
            projectId,
            title: a.title.trim(),
            normalizedTitle: norm,
            type: a.type,
            status: ArtifactStatus.DRAFT, // AI-proposed content stays a draft until promoted
            description: "", // never copy AI rationale onto the entity
            tags: AI_TAGS,
            ...gxgy(),
            createdById: userId,
          },
        });
        normToId.set(norm, row.id);
        artifacts.push({ id: row.id, title: row.title, type: row.type });
      }

      const relations: typeof created.relations = [];
      for (let i = 0; i < proposal.relations.length; i++) {
        if (!report.relations[i].accepted) continue;
        const r = proposal.relations[i];
        const sid = normToId.get(normalizeArtifactTitle(r.sourceTitle));
        const tid = normToId.get(normalizeArtifactTitle(r.targetTitle));
        if (!sid || !tid) continue; // defensive — validator already guaranteed this
        const row = await tx.artifactRelation.create({
          data: {
            sourceArtifactId: sid,
            targetArtifactId: tid,
            relationType: r.relationType,
            description: "",
            createdById: userId,
          },
        });
        relations.push({
          id: row.id,
          sourceTitle: r.sourceTitle,
          targetTitle: r.targetTitle,
          relationType: r.relationType,
          sourceArtifactId: sid,
          targetArtifactId: tid,
        });
      }

      const diagrams: typeof created.diagrams = [];
      for (let i = 0; i < proposal.diagrams.length; i++) {
        if (!report.diagrams[i].accepted) continue;
        const d = proposal.diagrams[i];
        const parsed = parseMermaid(d.mermaidSource); // deterministic; type + clean source
        const row = await tx.diagram.create({
          data: {
            projectId,
            artifactId: null,
            title: d.title.trim() || parsed.title || "Diagram",
            type: parsed.diagramType,
            mermaidSource: parsed.mermaidSource,
            description: "",
            createdById: userId,
          },
        });
        diagrams.push({ id: row.id, title: row.title });
      }

      return { artifacts, relations, diagrams };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BootstrapConflictError(
        "A title collided while applying (the project changed since the proposal). Reload and try again.",
      );
    }
    throw err;
  }

  // ── Version events (provenance) — recorded after commit, like the other modules ──
  const meta = (extra: Record<string, string | number | boolean>) => ({
    origin: "AI",
    source: "BOOTSTRAP_WIZARD",
    confirmedBy: userId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...extra,
  });
  for (const a of created.artifacts) {
    await recordVersionEvent({
      projectId,
      entityType: "ARTIFACT",
      entityId: a.id,
      action: "CREATED",
      title: a.title,
      description: "Created via AI Bootstrap Wizard",
      triggeredBy: userId,
      metadata: meta({ type: a.type }),
    });
  }
  for (const r of created.relations) {
    await recordVersionEvent({
      projectId,
      entityType: "RELATION",
      entityId: r.id,
      action: "LINKED",
      title: `${r.sourceTitle} → ${r.targetTitle}`,
      description: r.relationType,
      triggeredBy: userId,
      metadata: meta({ relationType: r.relationType, sourceArtifactId: r.sourceArtifactId, targetArtifactId: r.targetArtifactId }),
    });
  }
  for (const d of created.diagrams) {
    await recordVersionEvent({
      projectId,
      entityType: "DIAGRAM",
      entityId: d.id,
      action: "CREATED",
      title: d.title,
      description: "Created via AI Bootstrap Wizard",
      triggeredBy: userId,
      metadata: meta({}),
    });
  }

  // ── Audit: mark the session APPLIED (or create one if applied without propose) ──
  const counts = {
    artifactsCreated: created.artifacts.length,
    relationsCreated: created.relations.length,
    diagramsCreated: created.diagrams.length,
  };
  const priorId = params.sessionId ?? null;
  const existingSession = priorId
    ? await prisma.aiSession.findUnique({ where: { id: priorId } })
    : null;
  let resolvedSessionId: string;
  if (existingSession && existingSession.projectId === projectId) {
    await prisma.aiSession.update({
      where: { id: existingSession.id },
      data: { status: AiSessionStatus.APPLIED, appliedById: userId, ...counts },
    });
    resolvedSessionId = existingSession.id;
  } else {
    const fresh = await prisma.aiSession.create({
      data: {
        projectId,
        status: AiSessionStatus.APPLIED,
        idea: "",
        proposal: proposal as unknown as Prisma.InputJsonValue,
        artifactsProposed: proposal.artifacts.length,
        relationsProposed: proposal.relations.length,
        diagramsProposed: proposal.diagrams.length,
        ...counts,
        createdById: userId,
        appliedById: userId,
      },
    });
    resolvedSessionId = fresh.id;
  }

  return {
    sessionId: resolvedSessionId,
    applied: created,
    skipped: buildSkipped(report),
    validation: report,
  };
}
