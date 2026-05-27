// Pure rule runner — used by the validation HTTP handler and the seed script.
// Wipes existing issues for the project, recomputes them, and writes a single
// VALIDATED version event recording the outcome.

import type { ValidationIssue } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const CHURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEPENDENCY_LIMIT = 6;
const CHURN_LIMIT = 5;

export async function runValidationForProject(
  projectId: string,
  triggeredBy?: string,
): Promise<ValidationIssue[]> {
  const [project, artifacts, relations, apiSpecs, apiEndpoints, databaseModels, databaseEntities, databaseFields, diagrams, recentEvents] =
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
    ]);

  const now = new Date();
  const artifactIds = new Set(artifacts.map((a) => a.id));
  const projectRelations = relations.filter(
    (r) => artifactIds.has(r.sourceArtifactId) && artifactIds.has(r.targetArtifactId),
  );
  const entityIds = new Set(databaseEntities.map((e) => e.id));

  type DraftIssue = Omit<ValidationIssue, "id" | "createdAt" | "updatedAt">;
  const drafts: DraftIssue[] = [];

  for (const a of artifacts) {
    const hasIncoming = projectRelations.some((r) => r.targetArtifactId === a.id);
    const hasOutgoing = projectRelations.some((r) => r.sourceArtifactId === a.id);

    if (!hasIncoming && !hasOutgoing) {
      drafts.push({
        projectId,
        artifactId: a.id,
        severity: "WARNING",
        category: "RELATIONSHIP",
        message: `Artifact "${a.title}" is orphaned — no incoming or outgoing relations.`,
        status: "OPEN",
      });
    }

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
  for (const r of projectRelations) {
    const src = byId.get(r.sourceArtifactId);
    const tgt = byId.get(r.targetArtifactId);
    if (!src || !tgt) continue;
    if (tgt.status === "DEPRECATED" && src.status === "ACTIVE") {
      drafts.push({
        projectId,
        artifactId: src.id,
        severity: "ERROR",
        category: "ARCHITECTURE",
        message: `Active artifact "${src.title}" depends on deprecated artifact "${tgt.title}".`,
        status: "OPEN",
      });
    }
  }

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
      if (isSecuritySpec && !ep.requiresAuth) {
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

  // ── Architecture / change-history heuristics ──
  const churnCounts = new Map<string, number>();
  for (const e of recentEvents) {
    churnCounts.set(e.entityId, (churnCounts.get(e.entityId) ?? 0) + 1);
  }

  for (const a of artifacts) {
    const dependencyCount = projectRelations.filter(
      (r) => r.sourceArtifactId === a.id || r.targetArtifactId === a.id,
    ).length;
    if (dependencyCount > DEPENDENCY_LIMIT) {
      drafts.push({
        projectId,
        artifactId: a.id,
        severity: "INFO",
        category: "ARCHITECTURE",
        message: `Artifact "${a.title}" has ${dependencyCount} relations — consider splitting responsibilities.`,
        status: "OPEN",
      });
    }

    const recentChanges = churnCounts.get(a.id) ?? 0;
    if (recentChanges > CHURN_LIMIT) {
      drafts.push({
        projectId,
        artifactId: a.id,
        severity: "INFO",
        category: "ARCHITECTURE",
        message: `Artifact "${a.title}" was changed ${recentChanges} times in the last 7 days.`,
        status: "OPEN",
      });
    }

    if (a.status === "DEPRECATED") {
      const incomingRefs = projectRelations.filter((r) => r.targetArtifactId === a.id).length;
      if (incomingRefs > 2) {
        drafts.push({
          projectId,
          artifactId: a.id,
          severity: "WARNING",
          category: "ARCHITECTURE",
          message: `Deprecated artifact "${a.title}" still has ${incomingRefs} incoming references.`,
          status: "OPEN",
        });
      }
    }
  }

  // Apply in one transaction: wipe old issues, insert new, record the run.
  const result = await prisma.$transaction(async (tx) => {
    await tx.validationIssue.deleteMany({ where: { projectId } });
    if (drafts.length > 0) {
      await tx.validationIssue.createMany({
        data: drafts.map((d) => ({ ...d, createdAt: now, updatedAt: now })),
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
