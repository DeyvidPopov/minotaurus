// Pure rule runner — used by the validation HTTP handler and the seed script.
// Wipes existing issues for the project, recomputes them, and writes a single
// VALIDATED version event recording the outcome.

import type { ValidationIssue } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { analyzeApiValidation } from "../api-intel/api-validation.js";
import { isAuthActionPath } from "../api-intel/text.js";
import type { ApiValidationInput } from "../api-intel/api-intel.types.js";
import { buildStatusSnapshot, restoreIssueStatuses } from "./validation.status.js";
import { PROJECT_LEVEL_PREFIX } from "./validation.constants.js";
import { analyzeArchitectureFindings } from "../findings/finding-rules.js";
import { getFinding } from "../findings/finding-catalog.js";

// Re-exported for back-compat; the canonical definition lives in
// validation.constants.ts (prisma-free, so the presenter can share it).
export { PROJECT_LEVEL_PREFIX };

const CHURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function runValidationForProject(
  projectId: string,
  triggeredBy?: string,
): Promise<ValidationIssue[]> {
  const [project, artifacts, relations, apiSpecs, apiEndpoints, databaseModels, databaseEntities, databaseFields, diagrams, recentEvents, memberCount] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.artifact.findMany({ where: { projectId } }),
      prisma.artifactRelation.findMany({
        where: { sourceArtifact: { projectId } },
      }),
      prisma.apiSpec.findMany({ where: { projectId } }),
      prisma.apiEndpoint.findMany({ where: { apiSpec: { projectId } } }),
      prisma.databaseModel.findMany({ where: { projectId } }),
      prisma.databaseEntity.findMany({ where: { databaseModel: { projectId } } }),
      prisma.databaseField.findMany({
        where: { entity: { databaseModel: { projectId } } },
      }),
      prisma.diagram.findMany({ where: { projectId } }),
      prisma.versionEvent.findMany({
        where: {
          projectId,
          createdAt: { gte: new Date(Date.now() - CHURN_WINDOW_MS) },
          action: { in: ["CREATED", "UPDATED"] },
        },
        select: { entityId: true },
      }),
      prisma.projectMember.count({ where: { projectId } }),
    ]);

  const now = new Date();
  const artifactIds = new Set(artifacts.map((a) => a.id));
  const projectRelations = relations.filter(
    (r) => artifactIds.has(r.sourceArtifactId) && artifactIds.has(r.targetArtifactId),
  );
  const entityIds = new Set(databaseEntities.map((e) => e.id));

  type DraftIssue = Omit<ValidationIssue, "id" | "createdAt" | "updatedAt">;
  const drafts: DraftIssue[] = [];

  // Per-artifact documentation + security-policy rules. (Orphan / fan-out /
  // churn / deprecated-dependency rules are produced by the shared finding-rules
  // engine below, so they have ONE implementation across Validation + Analysis.)
  for (const a of artifacts) {
    if (a.type === "DOCUMENTATION" && (!a.documentationContent || !a.documentationContent.trim())) {
      drafts.push({
        projectId,
        artifactId: a.id,
        severity: "WARNING",
        category: "DOCUMENTATION",
        message: `Documentation artifact "${a.title}" has no documentation content.`,
        status: "OPEN",
      });
    }

    if (a.type === "SECURITY_POLICY") {
      const secures = projectRelations.some(
        (r) => r.sourceArtifactId === a.id && r.relationType === "SECURES",
      );
      if (!secures) {
        drafts.push({
          projectId,
          artifactId: a.id,
          severity: "WARNING",
          category: "SECURITY",
          message: `Security policy "${a.title}" has no SECURES outgoing relation.`,
          status: "OPEN",
        });
      }
    }
  }

  const byId = new Map(artifacts.map((a) => [a.id, a]));

  // ── API spec rules ──
  const artifactByIdMap = byId;
  for (const spec of apiSpecs) {
    const specEndpoints = apiEndpoints.filter((e) => e.apiSpecId === spec.id);

    if (specEndpoints.length === 0) {
      drafts.push({
        projectId,
        artifactId: spec.artifactId ?? spec.id,
        severity: "WARNING",
        category: "API",
        message: `API spec "${spec.title}" has no endpoints.`,
        status: "OPEN",
      });
    }

    const linkedArtifact = spec.artifactId ? artifactByIdMap.get(spec.artifactId) : null;
    const isSecuritySpec =
      /\b(auth|security)/i.test(spec.title) ||
      (linkedArtifact && linkedArtifact.type === "SECURITY_POLICY");

    for (const ep of specEndpoints) {
      if (!ep.summary || !ep.summary.trim()) {
        drafts.push({
          projectId,
          artifactId: spec.artifactId ?? spec.id,
          severity: "WARNING",
          category: "API",
          message: `Endpoint ${ep.method} ${ep.path} in "${spec.title}" has no summary.`,
          status: "OPEN",
        });
      }
      // A public endpoint on a security-related spec is normally worth flagging —
      // EXCEPT auth-mechanism endpoints (login/register/refresh/verify/forgot-/
      // reset-password), which are public by design. Allow-list them.
      if (isSecuritySpec && !ep.requiresAuth && !isAuthActionPath(ep.path)) {
        drafts.push({
          projectId,
          artifactId: spec.artifactId ?? spec.id,
          severity: "WARNING",
          category: "SECURITY",
          message: `Endpoint ${ep.method} ${ep.path} on security-related spec "${spec.title}" is marked public (requiresAuth=false).`,
          status: "OPEN",
        });
      }
    }
  }

  // ── Database model rules ──
  for (const model of databaseModels) {
    const modelEntities = databaseEntities.filter((e) => e.databaseModelId === model.id);

    if (modelEntities.length === 0) {
      drafts.push({
        projectId,
        artifactId: model.artifactId ?? model.id,
        severity: "WARNING",
        category: "DATABASE",
        message: `Database model "${model.title}" has no entities.`,
        status: "OPEN",
      });
    }

    for (const entity of modelEntities) {
      const entityFields = databaseFields.filter((f) => f.entityId === entity.id);
      if (entityFields.length === 0) {
        drafts.push({
          projectId,
          artifactId: model.artifactId ?? model.id,
          severity: "WARNING",
          category: "DATABASE",
          message: `Entity "${entity.name}" in "${model.title}" has no fields.`,
          status: "OPEN",
        });
      } else if (!entityFields.some((f) => f.isPrimaryKey)) {
        drafts.push({
          projectId,
          artifactId: model.artifactId ?? model.id,
          severity: "WARNING",
          category: "DATABASE",
          message: `Entity "${entity.name}" in "${model.title}" has no primary key.`,
          status: "OPEN",
        });
      }

      for (const field of entityFields) {
        if (field.isForeignKey || field.referencesEntityId) {
          if (!field.referencesEntityId) {
            drafts.push({
              projectId,
              artifactId: model.artifactId ?? model.id,
              severity: "ERROR",
              category: "DATABASE",
              message: `Foreign key "${entity.name}.${field.name}" has no target entity.`,
              status: "OPEN",
            });
          } else if (!entityIds.has(field.referencesEntityId)) {
            drafts.push({
              projectId,
              artifactId: model.artifactId ?? model.id,
              severity: "ERROR",
              category: "DATABASE",
              message: `Foreign key "${entity.name}.${field.name}" references a missing entity.`,
              status: "OPEN",
            });
          }
        }
      }
    }
  }

  // ── Diagram rules ──
  const HEADER_BY_TYPE: Record<string, RegExp> = {
    FLOWCHART: /^\s*(flowchart|graph)\b/im,
    SEQUENCE: /^\s*sequenceDiagram\b/im,
    ERD: /^\s*erDiagram\b/im,
    CLASS: /^\s*classDiagram\b/im,
    STATE: /^\s*stateDiagram\b/im,
    GANTT: /^\s*gantt\b/im,
    ARCHITECTURE: /^\s*(flowchart|graph)\b/im,
  };
  const ARROW_RE = /(-->|->>|-->>|--x|--o|==>|\|\|--|\|\|--\|\||o--|--\|>|==>|<-->|<--|\.->|\.\.>)/;

  for (const diagram of diagrams) {
    const src = diagram.mermaidSource ?? "";
    if (!src.trim()) {
      drafts.push({
        projectId,
        artifactId: diagram.artifactId ?? diagram.id,
        severity: "WARNING",
        category: "DIAGRAM",
        message: `Diagram "${diagram.title}" has an empty Mermaid source.`,
        status: "OPEN",
      });
    } else {
      const headerRe = HEADER_BY_TYPE[diagram.type] ?? HEADER_BY_TYPE.FLOWCHART;
      const headerOk = headerRe.test(src);
      const arrowOk = ARROW_RE.test(src);
      if (!headerOk || !arrowOk) {
        const reasons: string[] = [];
        if (!headerOk) reasons.push("missing diagram-type header");
        if (!arrowOk) reasons.push("no relations/arrows detected");
        drafts.push({
          projectId,
          artifactId: diagram.artifactId ?? diagram.id,
          severity: "WARNING",
          category: "DIAGRAM",
          message: `Diagram "${diagram.title}" may be invalid Mermaid (${reasons.join(", ")}).`,
          status: "OPEN",
        });
      }
    }
    if (diagram.type === "ARCHITECTURE" && !diagram.artifactId) {
      drafts.push({
        projectId,
        artifactId: diagram.id,
        severity: "INFO",
        category: "DIAGRAM",
        message: `Architecture diagram "${diagram.title}" is not linked to an artifact.`,
        status: "OPEN",
      });
    }
  }

  // ── Architecture findings (orphan, depends-on-deprecated, fan-out, churn,
  //    deprecated-still-referenced) via the shared finding-rules engine — the
  //    single implementation also used (read-only) by the analysis engine. ──
  const churnCounts = new Map<string, number>();
  for (const e of recentEvents) {
    churnCounts.set(e.entityId, (churnCounts.get(e.entityId) ?? 0) + 1);
  }

  const archFindings = analyzeArchitectureFindings({
    artifacts: artifacts.map((a) => ({ id: a.id, title: a.title, status: a.status })),
    relations: projectRelations.map((r) => ({
      sourceArtifactId: r.sourceArtifactId,
      targetArtifactId: r.targetArtifactId,
    })),
    churnByArtifact: churnCounts,
  });
  for (const f of archFindings) {
    const entry = getFinding(f.code)!; // every architecture code is in the catalog
    drafts.push({
      projectId,
      artifactId: f.artifactId,
      severity: entry.severity,
      category: entry.category,
      message: f.message,
      status: "OPEN",
    });
  }

  // ── Collaboration / governance heuristics ──
  // This finding is project-level, not about any single artifact. `artifactId`
  // is a required column (no FK), so we can't store null without a migration;
  // instead we use the explicit project-level convention: store the projectId
  // (never resolves to an artifact) and prefix the message with PROJECT_LEVEL_PREFIX
  // so the UI renders "Project" instead of falling back to an arbitrary artifact.
  if (project && artifacts.length > 0 && memberCount <= 1) {
    drafts.push({
      projectId,
      artifactId: projectId,
      severity: "INFO",
      category: "ARCHITECTURE",
      message: `${PROJECT_LEVEL_PREFIX}Single-user project may reduce collaboration visibility. Consider inviting team members on the Team page.`,
      status: "OPEN",
    });
  }

  // ── API payload intelligence rules (deterministic, reuses the api-intel
  //    analyzer primitives; codes are encoded as a message prefix). ──
  const apiValidationInput: ApiValidationInput = {
    specs: apiSpecs.map((s) => ({
      id: s.id,
      artifactId: s.artifactId,
      title: s.title,
      endpoints: apiEndpoints
        .filter((e) => e.apiSpecId === s.id)
        .map((e) => ({
          id: e.id,
          method: e.method,
          path: e.path,
          summary: e.summary,
          requestSchema: e.requestSchema,
          responseSchema: e.responseSchema,
          requiresAuth: e.requiresAuth,
        })),
    })),
    models: databaseModels.map((m) => ({
      id: m.id,
      artifactId: m.artifactId,
      title: m.title,
      entities: databaseEntities
        .filter((en) => en.databaseModelId === m.id)
        .map((en) => ({
          id: en.id,
          name: en.name,
          fields: databaseFields.filter((f) => f.entityId === en.id).map((f) => ({ name: f.name })),
        })),
    })),
  };
  const specArtifactById = new Map(apiSpecs.map((s) => [s.id, s.artifactId ?? s.id]));
  for (const f of analyzeApiValidation(apiValidationInput)) {
    drafts.push({
      projectId,
      artifactId: specArtifactById.get(f.apiSpecId) ?? f.apiSpecId,
      severity: f.severity,
      category: f.category,
      message: `${f.code} · ${f.message}`,
      status: "OPEN",
    });
  }

  // Apply in one transaction: carry forward IGNORED (waived) decisions, wipe old
  // issues, insert new, record the run. Issue rows are recreated each run (fresh
  // ids), so a waive is preserved by fingerprint, not by id. RESOLVED is NOT
  // carried forward — a still-produced finding reopens (see validation.status.ts).
  const result = await prisma.$transaction(async (tx) => {
    const previous = await tx.validationIssue.findMany({
      where: { projectId },
      select: { artifactId: true, category: true, severity: true, message: true, status: true },
    });
    const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));

    await tx.validationIssue.deleteMany({ where: { projectId } });
    if (restored.length > 0) {
      await tx.validationIssue.createMany({
        data: restored.map((d) => ({ ...d, createdAt: now, updatedAt: now })),
      });
    }
    return tx.validationIssue.findMany({ where: { projectId } });
  });

  await recordVersionEvent({
    projectId,
    entityType: "VALIDATION",
    entityId: projectId,
    action: "VALIDATED",
    title: `Validation run · ${project?.name ?? "project"}`,
    description: `${result.length} issue${result.length === 1 ? "" : "s"} produced`,
    triggeredBy: triggeredBy ?? project?.ownerId ?? "system",
    metadata: {
      issueCount: result.length,
      bySeverity: result.reduce<Record<string, number>>((acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      }, {}),
    },
  });

  return result;
}
