// Pure rule runner — used by the validation HTTP handler and the seed script.
// Mutates the in-memory db (replacing the project's open issues with a fresh
// computation) and persists to disk. Caller is responsible for any response.

import { db, persist, type ValidationIssueRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";

export function runValidationForProject(projectId: string): ValidationIssueRow[] {
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

  state.validationIssues.push(...issues);
  persist();

  return issues;
}
