import type { Response } from "express";
import { z } from "zod";
import { db, persist, type ValidationIssueRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { runValidationForProject } from "./validation.engine.js";

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

  const issues = runValidationForProject(projectId, req.user!.userId);

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
