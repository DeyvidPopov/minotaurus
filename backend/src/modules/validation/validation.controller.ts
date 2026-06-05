import type { Response } from "express";
import { z } from "zod";
import { IssueCategory, IssueSeverity, IssueStatus, ProjectRole, type ValidationIssue } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { runValidationForProject } from "./validation.engine.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { explainIssue, type ResourceIndex } from "./validation.presenter.js";
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

/**
 * Build the resource index `explainIssue` uses to resolve navigation targets.
 * The engine stores either a resource id or its linked artifact id in
 * `artifactId`, so the presenter needs every resource keyed by both.
 */
async function buildResourceIndex(projectId: string): Promise<ResourceIndex> {
  const [artifacts, specs, models, diagrams] = await Promise.all([
    prisma.artifact.findMany({ where: { projectId }, select: { id: true, title: true, type: true } }),
    prisma.apiSpec.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true } }),
    prisma.databaseModel.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true } }),
    prisma.diagram.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true } }),
  ]);
  return {
    artifactsById: new Map(artifacts.map((a) => [a.id, a])),
    specs,
    models,
    diagrams,
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
  const [items, index] = await Promise.all([
    prisma.validationIssue.findMany({
      where: {
        projectId,
        ...(severity ? { severity: severity as IssueSeverity } : {}),
        ...(category ? { category: category as IssueCategory } : {}),
        ...(status ? { status: status as IssueStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    buildResourceIndex(projectId),
  ]);
  // Enrich each issue with actionable metadata (rule, why, fix, nav target).
  return ok(res, items.map((v) => ({ ...serializeIssue(v), meta: explainIssue(v, index) })), "OK");
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

  const nextStatus = parsed.data.status;
  const updated = await prisma.validationIssue.update({
    where: { id: issue.id },
    data: { status: nextStatus },
  });

  // Audit trail for manual triage. IGNORED (waive) decisions persist across
  // reruns (validation.status.ts); RESOLVED does not — a still-produced finding
  // reopens. Either way the triage action itself is worth recording.
  if (issue.status !== nextStatus) {
    await recordVersionEvent({
      projectId: issue.projectId,
      entityType: "VALIDATION",
      entityId: issue.id,
      action: "UPDATED",
      title: `Validation issue marked ${nextStatus}`,
      description: issue.message,
      triggeredBy: req.user!.userId,
      metadata: {
        from: issue.status,
        to: nextStatus,
        category: issue.category,
        severity: issue.severity,
        message: issue.message,
        artifactId: issue.artifactId,
      },
    });
  }

  return ok(res, serializeIssue(updated), "Issue updated");
}
