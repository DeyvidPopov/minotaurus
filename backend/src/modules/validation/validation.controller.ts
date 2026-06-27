import type { Response } from "express";
import { z } from "zod";
import { IssueCategory, IssueSeverity, IssueStatus, type ValidationIssue } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok, respondProjectAccessDenied } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { runValidationForProject } from "./validation.engine.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { explainIssue, type ResourceIndex } from "./validation.presenter.js";
import { projectAccessStatus } from "../../lib/project-access.js";
import { sendValidationAlerts } from "../notifications/validation-alert.service.js";

const updateSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "IGNORED"] as [IssueStatus, ...IssueStatus[]]),
});

export function serializeIssue(v: ValidationIssue) {
  return {
    id: v.id,
    projectId: v.projectId,
    // The finding's polymorphic subject (drives the UI nav target via `meta`).
    subjectType: v.subjectType,
    subjectId: v.subjectId,
    // Real Artifact FK — non-null only for ARTIFACT-subject findings.
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
 * Serialize + enrich a set of issues with actionable `meta` (rule, why, fix,
 * nav target, quick-fix actions). Shared by the list endpoint and the quick-fix
 * apply endpoint so both return the identical issue shape.
 */
export async function enrichIssues(projectId: string, items: ValidationIssue[]) {
  const index = await buildResourceIndex(projectId);
  return items.map((v) => ({ ...serializeIssue(v), meta: explainIssue(v, index) }));
}

/**
 * Build the resource index `explainIssue` uses to resolve navigation targets.
 * The engine stores either a resource id or its linked artifact id in
 * `subjectId`, so the presenter needs every resource keyed by both.
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

export async function runValidation(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccessStatus(projectId, req.user!.userId, "ARCHITECT");
  if (respondProjectAccessDenied(res, access)) return;

  const { issues, newErrorIssues } = await runValidationForProject(projectId, req.user!.userId);

  // Side effect, fully isolated from the deterministic run: alert project owners
  // about NEW ERROR findings. sendValidationAlerts never throws, but we still
  // guard here so a notification problem can never affect the validation response.
  try {
    await sendValidationAlerts({ projectId, errorIssues: newErrorIssues });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] validation alert dispatch error", {
      projectId,
      error: err instanceof Error ? err.name : "unknown",
    });
  }

  return created(
    res,
    { runId: newId(), issueCount: issues.length, issues: issues.map(serializeIssue) },
    "Validation completed",
  );
}

export async function listIssues(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccessStatus(projectId, req.user!.userId);
  if (respondProjectAccessDenied(res, access)) return;

  const { severity, category, status, artifactId } = req.query as Record<string, string | undefined>;
  const items = await prisma.validationIssue.findMany({
    where: {
      projectId,
      ...(severity ? { severity: severity as IssueSeverity } : {}),
      ...(category ? { category: category as IssueCategory } : {}),
      ...(status ? { status: status as IssueStatus } : {}),
      // Optional artifact scope (index-backed via ValidationIssue(artifactId)) so
      // the artifact-detail page fetches just one artifact's findings instead of
      // the whole project set. Non-null only for ARTIFACT-subject findings.
      ...(artifactId ? { artifactId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  // Enrich each issue with actionable metadata (rule, why, fix, nav target, actions).
  return ok(res, await enrichIssues(projectId, items), "OK");
}

export async function updateIssue(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const issue = await prisma.validationIssue.findUnique({
    where: { id: req.params.issueId },
  });
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");
  const access = await projectAccessStatus(issue.projectId, req.user!.userId, "ARCHITECT");
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
        subjectType: issue.subjectType,
        subjectId: issue.subjectId,
        artifactId: issue.artifactId,
      },
    });
  }

  return ok(res, serializeIssue(updated), "Issue updated");
}
