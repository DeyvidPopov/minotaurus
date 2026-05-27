import type { Response } from "express";
import { z } from "zod";
import { IssueCategory, IssueSeverity, IssueStatus, ProjectRole, type ValidationIssue } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { runValidationForProject } from "./validation.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

const updateSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "IGNORED"] as [IssueStatus, ...IssueStatus[]]),
});

function serializeIssue(v: ValidationIssue) {
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

async function projectAccess(projectId: string, userId: string, minRole: ProjectRole = "VIEWER"): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await getProjectAccess(projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

export async function runValidation(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId, "ARCHITECT");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const issues = await runValidationForProject(projectId, req.user!.userId);
  return created(
    res,
    { runId: newId(), issueCount: issues.length, issues: issues.map(serializeIssue) },
    "Validation completed",
  );
}

export async function listIssues(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { severity, category, status } = req.query as Record<string, string | undefined>;
  const items = await prisma.validationIssue.findMany({
    where: {
      projectId,
      ...(severity ? { severity: severity as IssueSeverity } : {}),
      ...(category ? { category: category as IssueCategory } : {}),
      ...(status ? { status: status as IssueStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return ok(res, items.map(serializeIssue), "OK");
}

export async function updateIssue(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const issue = await prisma.validationIssue.findUnique({
    where: { id: req.params.issueId },
  });
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");
  const access = await projectAccess(issue.projectId, req.user!.userId, "ARCHITECT");
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const updated = await prisma.validationIssue.update({
    where: { id: issue.id },
    data: { status: parsed.data.status },
  });
  return ok(res, serializeIssue(updated), "Issue updated");
}
