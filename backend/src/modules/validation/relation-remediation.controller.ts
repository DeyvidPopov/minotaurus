// relation-remediation.controller.ts — REVIEW-required validation remediations (V1).
//
//   GET  /validation-issues/:issueId/remediation/preview  (VIEWER+, read-only)
//   POST /validation-issues/:issueId/remediation/apply     (ARCHITECT+, mutates)
//
// For DIAGRAM_UNLINKED / SECURITY_POLICY_NOT_LINKED / ORPHAN_ARTIFACT only. The
// preview returns deterministic CANDIDATES (never AI); apply requires an explicit
// user-selected candidate and re-derives the candidate set server-side, applying
// ONLY a selection the generator actually produced (the client is never trusted to
// supply an arbitrary target). Writes go through the same invariants the relation /
// diagram controllers enforce (P2002→409, self/cross-project guards, VersionEvent),
// then validation re-runs so the resolved finding disappears.

import type { Response } from "express";
import { z } from "zod";
import { Prisma, ProjectRole, RelationType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { classifyFindingFromIssue } from "../findings/finding-classifier.js";
import {
  candidatesForDiagramUnlinked,
  candidatesForOrphan,
  candidatesForSecurityPolicy,
  getRelationRemediationIdForCode,
  isManualFallback,
  type RInferredEdge,
  type RemediationCandidate,
  type RemediationPreview,
} from "../findings/relation-remediation.js";
import { parseMermaid } from "../ingestion/mermaid.engine.js";
import { analyzeProjectApiIntel } from "../api-intel/payload-analyzer.js";
import type { AnalyzerInput } from "../api-intel/api-intel.types.js";
import { runValidationForProject } from "./validation.engine.js";
import { enrichIssues } from "./validation.controller.js";

const RELATION_TYPES = new Set(Object.values(RelationType) as string[]);

async function projectAccess(projectId: string, userId: string, minRole: ProjectRole): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await getProjectAccess(projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

const REMEDIATION_TITLE: Record<string, string> = {
  LINK_DIAGRAM_ARTIFACT: "Link diagram to artifact",
  LINK_SECURITY_POLICY: "Link security policy",
  LINK_ORPHAN_ARTIFACT: "Link orphaned artifact",
};

// Shared project data the generators need. inferredEdges are computed only for the
// relation-creating remediations (security / orphan) — the diagram link doesn't use them.
interface Context {
  artifacts: { id: string; title: string; type: string; status: string }[];
  relations: { sourceArtifactId: string; targetArtifactId: string; relationType: string }[];
  inferredEdges: RInferredEdge[];
  diagram?: { id: string; title: string; mermaidSource: string; nodeLabels: string[] } | null;
}

async function buildInferredEdges(projectId: string): Promise<RInferredEdge[]> {
  const [specs, models, artifacts, relations, endpoints] = await Promise.all([
    prisma.apiSpec.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true } }),
    prisma.databaseModel.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true, entities: { select: { id: true, name: true, fields: { select: { name: true } } } } } }),
    prisma.artifact.findMany({ where: { projectId }, select: { id: true, title: true, type: true, status: true } }),
    prisma.artifactRelation.findMany({ where: { sourceArtifact: { projectId } }, select: { sourceArtifactId: true, targetArtifactId: true, relationType: true } }),
    prisma.apiEndpoint.findMany({ where: { apiSpec: { projectId } }, select: { id: true, apiSpecId: true, method: true, path: true, summary: true, requestSchema: true, responseSchema: true, requiresAuth: true } }),
  ]);
  const bySpec = new Map<string, AnalyzerInput["specs"][number]["endpoints"]>();
  for (const e of endpoints) {
    const l = bySpec.get(e.apiSpecId) ?? [];
    l.push(e);
    bySpec.set(e.apiSpecId, l);
  }
  const input: AnalyzerInput = {
    specs: specs.map((s) => ({ id: s.id, artifactId: s.artifactId, title: s.title, endpoints: bySpec.get(s.id) ?? [] })),
    models: models.map((m) => ({ id: m.id, artifactId: m.artifactId, title: m.title, entities: m.entities })),
    artifacts,
    relations,
  };
  return analyzeProjectApiIntel(input).inferredEdges.map((e) => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
    confidence: e.confidence,
    basis: e.basis,
  }));
}

async function loadContext(
  issue: { projectId: string; subjectId: string },
  remediationId: string,
): Promise<Context> {
  const [artifacts, relations] = await Promise.all([
    prisma.artifact.findMany({ where: { projectId: issue.projectId }, select: { id: true, title: true, type: true, status: true } }),
    prisma.artifactRelation.findMany({ where: { sourceArtifact: { projectId: issue.projectId } }, select: { sourceArtifactId: true, targetArtifactId: true, relationType: true } }),
  ]);

  if (remediationId === "LINK_DIAGRAM_ARTIFACT") {
    // DIAGRAM_UNLINKED's subjectId is diagram.artifactId ?? diagram.id; resolve either way.
    const row = await prisma.diagram.findFirst({
      where: { projectId: issue.projectId, OR: [{ id: issue.subjectId }, { artifactId: issue.subjectId }] },
    });
    let nodeLabels: string[] = [];
    if (row?.mermaidSource) {
      try {
        nodeLabels = parseMermaid(row.mermaidSource).nodeHints;
      } catch {
        nodeLabels = []; // unparseable source → title match only
      }
    }
    return {
      artifacts,
      relations,
      inferredEdges: [],
      diagram: row ? { id: row.id, title: row.title, mermaidSource: row.mermaidSource, nodeLabels } : null,
    };
  }

  return { artifacts, relations, inferredEdges: await buildInferredEdges(issue.projectId) };
}

function buildPreview(
  code: string,
  remediationId: string,
  issue: { subjectId: string },
  ctx: Context,
): RemediationPreview | { error: string } {
  if (remediationId === "LINK_DIAGRAM_ARTIFACT") {
    if (!ctx.diagram) return { error: "Diagram not found." };
    const candidates = candidatesForDiagramUnlinked({ title: ctx.diagram.title }, ctx.diagram.nodeLabels, ctx.artifacts);
    return {
      remediationId: "LINK_DIAGRAM_ARTIFACT",
      findingCode: code,
      mechanic: "SET_DIAGRAM_ARTIFACT",
      title: REMEDIATION_TITLE[remediationId],
      candidates,
      manualFallback: isManualFallback(candidates),
    };
  }

  const subject = ctx.artifacts.find((a) => a.id === issue.subjectId);
  if (!subject) return { error: "Artifact not found." };

  if (remediationId === "LINK_SECURITY_POLICY") {
    const candidates = candidatesForSecurityPolicy(subject, ctx.artifacts, ctx.relations, ctx.inferredEdges);
    return {
      remediationId: "LINK_SECURITY_POLICY",
      findingCode: code,
      mechanic: "CREATE_RELATION",
      title: REMEDIATION_TITLE[remediationId],
      relationType: "SECURES",
      candidates,
      manualFallback: isManualFallback(candidates),
    };
  }

  // LINK_ORPHAN_ARTIFACT
  const candidates = candidatesForOrphan(subject, ctx.artifacts, ctx.relations, ctx.inferredEdges);
  return {
    remediationId: "LINK_ORPHAN_ARTIFACT",
    findingCode: code,
    mechanic: "CREATE_RELATION",
    title: REMEDIATION_TITLE[remediationId],
    candidates,
    manualFallback: isManualFallback(candidates),
  };
}

export async function previewRemediation(req: AuthedRequest, res: Response) {
  const issue = await prisma.validationIssue.findUnique({ where: { id: req.params.issueId } });
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");
  const access = await projectAccess(issue.projectId, req.user!.userId, "VIEWER");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const code = classifyFindingFromIssue(issue);
  const remediationId = getRelationRemediationIdForCode(code);
  if (!remediationId) return fail(res, 400, "NO_REMEDIATION", "This finding has no review-required remediation.");

  const ctx = await loadContext(issue, remediationId);
  const preview = buildPreview(code, remediationId, issue, ctx);
  if ("error" in preview) return fail(res, 404, "NOT_FOUND", preview.error);
  return ok(res, preview, "OK");
}

const applySchema = z.object({
  targetId: z.string().min(1),
  relationType: z.string().optional(),
});

export async function applyRemediation(req: AuthedRequest, res: Response) {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const issue = await prisma.validationIssue.findUnique({ where: { id: req.params.issueId } });
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");
  const access = await projectAccess(issue.projectId, req.user!.userId, "ARCHITECT");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const code = classifyFindingFromIssue(issue);
  const remediationId = getRelationRemediationIdForCode(code);
  if (!remediationId) return fail(res, 400, "NO_REMEDIATION", "This finding has no review-required remediation.");

  // Re-derive candidates server-side and accept ONLY a selection the deterministic
  // generator actually produced — the client cannot supply an arbitrary target/type.
  const ctx = await loadContext(issue, remediationId);
  const preview = buildPreview(code, remediationId, issue, ctx);
  if ("error" in preview) return fail(res, 404, "NOT_FOUND", preview.error);
  const selected = preview.candidates.find(
    (c) => c.targetId === parsed.data.targetId && (c.relationType ?? null) === (parsed.data.relationType ?? null),
  );
  if (!selected) {
    return fail(res, 400, "INVALID_CANDIDATE", "Selected candidate is not a current deterministic suggestion for this finding.");
  }

  const userId = req.user!.userId;
  const baseMeta = {
    origin: "QUICK_FIX",
    source: "RELATION_REMEDIATION",
    confirmedBy: userId,
    findingCode: code,
    selectedCandidate: selected.targetId,
    confidence: selected.confidence,
    score: selected.score,
    evidence: selected.evidence.map((e) => ({ type: e.type, weight: e.weight })),
    basis: selected.evidence.map((e) => e.explanation).join("; "),
  };

  if (preview.mechanic === "SET_DIAGRAM_ARTIFACT") {
    const diagram = ctx.diagram!; // present (buildPreview errored otherwise)
    // Atomic no-clobber: only link while still unlinked, so a concurrent edit can't be lost.
    const { count } = await prisma.diagram.updateMany({
      where: { id: diagram.id, artifactId: null },
      data: { artifactId: selected.targetId },
    });
    if (count !== 1) {
      return fail(res, 409, "REMEDIATION_NOT_APPLICABLE", "This diagram is already linked to an artifact.");
    }
    await recordVersionEvent({
      projectId: issue.projectId,
      entityType: "DIAGRAM",
      entityId: diagram.id,
      action: "UPDATED",
      title: diagram.title,
      description: `Linked to ${selected.targetTitle}`,
      triggeredBy: userId,
      metadata: { ...baseMeta, linkedArtifactId: selected.targetId },
    });
  } else {
    // CREATE_RELATION — source is the finding's subject artifact.
    const relationType = selected.relationType;
    if (!relationType || !RELATION_TYPES.has(relationType)) {
      return fail(res, 400, "VALIDATION_ERROR", "Invalid relation type for this remediation.");
    }
    const [source, target] = await Promise.all([
      prisma.artifact.findUnique({ where: { id: issue.subjectId } }),
      prisma.artifact.findUnique({ where: { id: selected.targetId } }),
    ]);
    if (!source || !target) return fail(res, 404, "NOT_FOUND", "Artifact not found.");
    if (source.projectId !== issue.projectId || target.projectId !== issue.projectId) {
      return fail(res, 400, "CROSS_PROJECT", "Source and target must belong to the same project");
    }
    if (source.id === target.id) return fail(res, 400, "SELF_RELATION", "Cannot relate an artifact to itself");

    let relationId: string;
    try {
      const rel = await prisma.artifactRelation.create({
        data: {
          sourceArtifactId: source.id,
          targetArtifactId: target.id,
          relationType: relationType as RelationType,
          description: "",
          createdById: userId,
        },
      });
      relationId = rel.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return fail(res, 409, "RELATION_EXISTS", "Relation already exists");
      }
      // eslint-disable-next-line no-console
      console.error("[relation-remediation] create failed", err);
      return fail(res, 500, "INTERNAL_ERROR", "Failed to create relation");
    }
    await recordVersionEvent({
      projectId: issue.projectId,
      entityType: "RELATION",
      entityId: relationId,
      action: "LINKED",
      title: `${source.title} → ${target.title}`,
      description: relationType,
      triggeredBy: userId,
      metadata: { ...baseMeta, relationType, sourceArtifactId: source.id, targetArtifactId: target.id },
    });
  }

  const { issues } = await runValidationForProject(issue.projectId, userId);
  return ok(
    res,
    {
      remediationId,
      applied: { targetId: selected.targetId, targetTitle: selected.targetTitle, relationType: selected.relationType ?? null },
      issues: await enrichIssues(issue.projectId, issues),
    },
    "Remediation applied",
  );
}
