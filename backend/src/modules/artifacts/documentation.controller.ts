import type { Response } from "express";
import { z } from "zod";
import { ProjectRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok, respondAccessError } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

const updateSchema = z.object({
  markdownContent: z.string().optional(),
  content: z.string().optional(),
});

async function findArtifactForUser(artifactId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return { error: "not_found" as const };
  const a = await getProjectAccess(artifact.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { artifact };
}

function buildExcerpt(markdown: string, max = 220): string {
  const trimmed = markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[*+-]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

export async function getProjectDocumentationOverview(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");

  const artifacts = await prisma.artifact.findMany({
    where: { projectId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      documentationContent: true,
      updatedAt: true,
    },
  });

  const documents = artifacts
    .filter((a) => !!a.documentationContent && a.documentationContent.trim().length > 0)
    .map((a) => ({
      artifactId: a.id,
      artifactTitle: a.title,
      artifactType: a.type,
      artifactStatus: a.status,
      hasDocumentation: true,
      markdownContent: a.documentationContent ?? "",
      excerpt: buildExcerpt(a.documentationContent ?? ""),
      updatedAt: a.updatedAt,
    }));

  const missing = artifacts
    .filter((a) => !a.documentationContent || a.documentationContent.trim().length === 0)
    .map((a) => ({
      artifactId: a.id,
      artifactTitle: a.title,
      artifactType: a.type,
      artifactStatus: a.status,
    }));

  const total = artifacts.length;
  const documented = documents.length;
  const coveragePercent = total === 0 ? 0 : Math.round((documented / total) * 100);

  return ok(
    res,
    {
      summary: {
        totalArtifacts: total,
        documentedArtifacts: documented,
        missingDocumentation: missing.length,
        coveragePercent,
      },
      documents,
      missing,
    },
    "Documentation overview loaded",
  );
}

export async function getDocumentation(req: AuthedRequest, res: Response) {
  const result = await findArtifactForUser(req.params.artifactId, req.user!.userId);
  if ("error" in result) return respondAccessError(res, result.error, "Artifact not found");
  return ok(
    res,
    {
      artifactId: result.artifact.id,
      content: result.artifact.documentationContent ?? "",
      updatedAt: result.artifact.updatedAt,
    },
    "OK",
  );
}

export async function putDocumentation(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const content = parsed.data.markdownContent ?? parsed.data.content ?? "";

  const result = await findArtifactForUser(req.params.artifactId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Artifact not found");
  const artifact = result.artifact;
  const hadContent = !!artifact.documentationContent?.trim();
  const willHaveContent = !!content.trim();

  const updated = await prisma.artifact.update({
    where: { id: artifact.id },
    data: { documentationContent: content },
  });

  const action =
    !hadContent && willHaveContent
      ? "CREATED"
      : hadContent && !willHaveContent
        ? "DELETED"
        : "UPDATED";
  await recordVersionEvent({
    projectId: artifact.projectId,
    entityType: "DOCUMENTATION",
    entityId: artifact.id,
    action,
    title: artifact.title,
    description: `Documentation ${action.toLowerCase()}`,
    triggeredBy: req.user!.userId,
    metadata: { length: content.length },
  });

  return ok(
    res,
    {
      artifactId: updated.id,
      content,
      updatedAt: updated.updatedAt,
    },
    "Documentation saved",
  );
}
