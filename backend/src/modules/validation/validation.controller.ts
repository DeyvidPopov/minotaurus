import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type ValidationIssueRow,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const updateSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "IGNORED"]),
});

function serializeIssue(v: ValidationIssueRow) {
  return {
    id: v.id,
    projectId: v.projectId,
    artifactId: v.artifactId,
    severity: v.severity,
    category: v.category,
    message: v.message,
    status: v.status,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

export function runValidation(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const state = db();
  const artifacts = state.artifacts.filter((a) => a.projectId === projectId);
  const relations = state.relations;
  const ids = new Set(artifacts.map((a) => a.id));
  const projectRelations = relations.filter(
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

  return created(
    res,
    { runId: newId(), issueCount: issues.length, issues: issues.map(serializeIssue) },
    "Validation completed",
  );
}

export function listIssues(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { severity, category, status } = req.query as Record<string, string | undefined>;
  let items = db().validationIssues.filter((v) => v.projectId === projectId);
  if (severity) items = items.filter((v) => v.severity === severity);
  if (category) items = items.filter((v) => v.category === category);
  if (status) items = items.filter((v) => v.status === status);
  return ok(res, items.map(serializeIssue), "OK");
}

export function updateIssue(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const issue = db().validationIssues.find((v) => v.id === req.params.issueId);
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");
  const access = projectAccess(issue.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  issue.status = parsed.data.status;
  issue.updatedAt = new Date().toISOString();
  persist();
  return ok(res, serializeIssue(issue), "Issue updated");
}
