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

  state.validationIssues.push(...issues);
  persist();

  return issues;
}
