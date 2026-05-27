import type { Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const updateSchema = z.object({
  markdownContent: z.string().optional(),
  content: z.string().optional(),
});

async function findArtifactForUser(artifactId: string, userId: string) {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return { error: "not_found" as const };
  const project = await prisma.project.findUnique({ where: { id: artifact.projectId } });
  if (!project || project.ownerId !== userId) return { error: "forbidden" as const };
  return { artifact };
}

export async function getDocumentation(req: AuthedRequest, res: Response) {
  const result = await findArtifactForUser(req.params.artifactId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Artifact not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
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

  const result = await findArtifactForUser(req.params.artifactId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Artifact not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
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
