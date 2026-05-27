// Pure rule runner — used by the validation HTTP handler and the seed script.
// Mutates the in-memory db (replacing the project's open issues with a fresh
// computation) and persists to disk. Caller is responsible for any response.

import { db, persist, type ValidationIssueRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

export function runValidationForProject(
  projectId: string,
  triggeredBy?: string,
): ValidationIssueRow[] {
  const state = db();
  const artifacts = state.artifacts.filter((a) => a.projectId === projectId);
  const ids = new Set(artifacts.map((a) => a.id));
  const projectRelations = state.relations.filter(
    (r) => ids.has(r.sourceArtifactId) && ids.has(r.targetArtifactId),
  );
  const apiSpecs = state.apiSpecs.filter((s) => s.projectId === projectId);
  const apiEndpoints = state.apiEndpoints.filter((e) =>
    apiSpecs.some((s) => s.id === e.apiSpecId),
  );
  const databaseModels = state.databaseModels.filter((m) => m.projectId === projectId);
  const dbModelIds = new Set(databaseModels.map((m) => m.id));
  const databaseEntities = state.databaseEntities.filter((e) =>
    dbModelIds.has(e.databaseModelId),
  );
  const entityIds = new Set(databaseEntities.map((e) => e.id));
  const databaseFields = state.databaseFields.filter((f) => entityIds.has(f.entityId));
  const diagrams = state.diagrams.filter((d) => d.projectId === projectId);

  state.validationIssues = state.validationIssues.filter((v) => v.projectId !== projectId);

  const now = new Date().toISOString();
  const issues: ValidationIssueRow[] = [];

  for (const a of artifacts) {
    const hasIncoming = projectRelations.some((r) => r.targetArtifactId === a.id);
    const hasOutgoing = projectRelations.some((r) => r.sourceArtifactId === a.id);

    if (!hasIncoming && !hasOutgoing) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: a.id,
        severity: "WARNING",
        category: "RELATIONSHIP",
        message: `Artifact "${a.title}" is orphaned — no incoming or outgoing relations.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (
      a.type === "DOCUMENTATION" &&
      (!a.documentationContent || a.documentationContent.trim() === "")
    ) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: a.id,
        severity: "WARNING",
        category: "DOCUMENTATION",
        message: `Documentation artifact "${a.title}" has no documentation content.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (a.type === "SECURITY_POLICY") {
      const securesOutgoing = projectRelations.some(
        (r) => r.sourceArtifactId === a.id && r.relationType === "SECURES",
      );
      if (!securesOutgoing) {
        issues.push({
          id: newId(),
          projectId,
          artifactId: a.id,
          severity: "WARNING",
          category: "SECURITY",
          message: `Security policy "${a.title}" has no SECURES outgoing relation.`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
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
      issues.push({
        id: newId(),
        projectId,
        artifactId: src.id,
        severity: "ERROR",
        category: "ARCHITECTURE",
        message: `Active artifact "${src.title}" depends on deprecated artifact "${tgt.title}".`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ── API spec rules ──
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));
  for (const spec of apiSpecs) {
    const specEndpoints = apiEndpoints.filter((e) => e.apiSpecId === spec.id);

    // Rule: API spec with no endpoints
    if (specEndpoints.length === 0) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: spec.artifactId ?? spec.id,
        severity: "WARNING",
        category: "API",
        message: `API spec "${spec.title}" has no endpoints.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }

    const linkedArtifact = spec.artifactId ? artifactById.get(spec.artifactId) : null;
    const isSecuritySpec =
      /\b(auth|security)/i.test(spec.title) ||
      (linkedArtifact && linkedArtifact.type === "SECURITY_POLICY");

    for (const ep of specEndpoints) {
      // Rule: endpoint missing summary
      if (!ep.summary || !ep.summary.trim()) {
        issues.push({
          id: newId(),
          projectId,
          artifactId: spec.artifactId ?? spec.id,
          severity: "WARNING",
          category: "API",
          message: `Endpoint ${ep.method} ${ep.path} in "${spec.title}" has no summary.`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      }

      // Rule: requiresAuth=false on security-related API
      if (isSecuritySpec && !ep.requiresAuth) {
        issues.push({
          id: newId(),
          projectId,
          artifactId: spec.artifactId ?? spec.id,
          severity: "WARNING",
          category: "SECURITY",
          message: `Endpoint ${ep.method} ${ep.path} on security-related spec "${spec.title}" is marked public (requiresAuth=false).`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // ── Database model rules ──
  for (const model of databaseModels) {
    const modelEntities = databaseEntities.filter((e) => e.databaseModelId === model.id);

    // Empty database model
    if (modelEntities.length === 0) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: model.artifactId ?? model.id,
        severity: "WARNING",
        category: "DATABASE",
        message: `Database model "${model.title}" has no entities.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const entity of modelEntities) {
      const entityFields = databaseFields.filter((f) => f.entityId === entity.id);

      if (entityFields.length === 0) {
        issues.push({
          id: newId(),
          projectId,
          artifactId: model.artifactId ?? model.id,
          severity: "WARNING",
          category: "DATABASE",
          message: `Entity "${entity.name}" in "${model.title}" has no fields.`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      } else if (!entityFields.some((f) => f.isPrimaryKey)) {
        issues.push({
          id: newId(),
          projectId,
          artifactId: model.artifactId ?? model.id,
          severity: "WARNING",
          category: "DATABASE",
          message: `Entity "${entity.name}" in "${model.title}" has no primary key.`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const field of entityFields) {
        if (field.isForeignKey || field.referencesEntityId) {
          if (!field.referencesEntityId) {
            issues.push({
              id: newId(),
              projectId,
              artifactId: model.artifactId ?? model.id,
              severity: "ERROR",
              category: "DATABASE",
              message: `Foreign key "${entity.name}.${field.name}" has no target entity.`,
              status: "OPEN",
              createdAt: now,
              updatedAt: now,
            });
          } else if (!entityIds.has(field.referencesEntityId)) {
            issues.push({
              id: newId(),
              projectId,
              artifactId: model.artifactId ?? model.id,
              severity: "ERROR",
              category: "DATABASE",
              message: `Foreign key "${entity.name}.${field.name}" references a missing entity.`,
              status: "OPEN",
              createdAt: now,
              updatedAt: now,
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
    // Rule 1: empty Mermaid source
    if (!src.trim()) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: diagram.artifactId ?? diagram.id,
        severity: "WARNING",
        category: "DIAGRAM",
        message: `Diagram "${diagram.title}" has an empty Mermaid source.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Rule 2: heuristic — header keyword + at least one arrow-like token
      const headerRe = HEADER_BY_TYPE[diagram.type] ?? HEADER_BY_TYPE.FLOWCHART;
      const headerOk = headerRe.test(src);
      const arrowOk = ARROW_RE.test(src);
      if (!headerOk || !arrowOk) {
        const reasons: string[] = [];
        if (!headerOk) reasons.push("missing diagram-type header");
        if (!arrowOk) reasons.push("no relations/arrows detected");
        issues.push({
          id: newId(),
          projectId,
          artifactId: diagram.artifactId ?? diagram.id,
          severity: "WARNING",
          category: "DIAGRAM",
          message: `Diagram "${diagram.title}" may be invalid Mermaid (${reasons.join(", ")}).`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Rule 3: ARCHITECTURE diagram without a linked artifact
    if (diagram.type === "ARCHITECTURE" && !diagram.artifactId) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: diagram.id,
        severity: "INFO",
        category: "DIAGRAM",
        message: `Architecture diagram "${diagram.title}" is not linked to an artifact.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ── Architecture / change-history heuristics ──
  const DEPENDENCY_LIMIT = 6;
  const CHURN_LIMIT = 5;
  const CHURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - CHURN_WINDOW_MS;

  const eventsForArtifact = (artifactId: string) =>
    state.versionEvents.filter(
      (e) => e.projectId === projectId && e.entityId === artifactId,
    );

  for (const a of artifacts) {
    const dependencyCount = projectRelations.filter(
      (r) => r.sourceArtifactId === a.id || r.targetArtifactId === a.id,
    ).length;

    // Rule: artifact with excessive dependency count
    if (dependencyCount > DEPENDENCY_LIMIT) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: a.id,
        severity: "INFO",
        category: "ARCHITECTURE",
        message: `Artifact "${a.title}" has ${dependencyCount} relations — consider splitting responsibilities.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Rule: artifact changed many times in the last 7 days
    const recentChanges = eventsForArtifact(a.id).filter((e) => {
      if (e.action !== "UPDATED" && e.action !== "CREATED") return false;
      const t = Date.parse(e.createdAt);
      return Number.isFinite(t) && t >= cutoff;
    });
    if (recentChanges.length > CHURN_LIMIT) {
      issues.push({
        id: newId(),
        projectId,
        artifactId: a.id,
        severity: "INFO",
        category: "ARCHITECTURE",
        message: `Artifact "${a.title}" was changed ${recentChanges.length} times in the last 7 days.`,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Rule: deprecated artifact still heavily referenced
    if (a.status === "DEPRECATED") {
      const incomingRefs = projectRelations.filter(
        (r) => r.targetArtifactId === a.id,
      ).length;
      if (incomingRefs > 2) {
        issues.push({
          id: newId(),
          projectId,
          artifactId: a.id,
          severity: "WARNING",
          category: "ARCHITECTURE",
          message: `Deprecated artifact "${a.title}" still has ${incomingRefs} incoming references.`,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  state.validationIssues.push(...issues);

  const project = state.projects.find((p) => p.id === projectId);
  recordVersionEvent({
    projectId,
    entityType: "VALIDATION",
    entityId: projectId,
    action: "VALIDATED",
    title: `Validation run · ${project?.name ?? "project"}`,
    description: `${issues.length} issue${issues.length === 1 ? "" : "s"} produced`,
    triggeredBy: triggeredBy ?? project?.ownerId ?? "system",
    metadata: {
      issueCount: issues.length,
      bySeverity: issues.reduce<Record<string, number>>((acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      }, {}),
    },
  });

  persist();

  return issues;
}
