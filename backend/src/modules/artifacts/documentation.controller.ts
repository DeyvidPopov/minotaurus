import type { Response } from "express";
import { z } from "zod";
import { db, persist } from "../../db/json-db.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const updateSchema = z.object({
  markdownContent: z.string().optional(),
  content: z.string().optional(),
});

function findArtifactForUser(artifactId: string, userId: string) {
  const artifact = db().artifacts.find((a) => a.id === artifactId);
  if (!artifact) return { error: "not_found" as const };
  const project = db().projects.find((p) => p.id === artifact.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" as const };
  return { artifact };
}

export function getDocumentation(req: AuthedRequest, res: Response) {
  const result = findArtifactForUser(req.params.artifactId, req.user!.userId);
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

export function putDocumentation(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const content = parsed.data.markdownContent ?? parsed.data.content ?? "";

  const result = findArtifactForUser(req.params.artifactId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Artifact not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const artifact = result.artifact;
  const hadContent = !!artifact.documentationContent?.trim();
  const willHaveContent = !!content.trim();
  artifact.documentationContent = content;
  artifact.updatedAt = new Date().toISOString();

  // Treat empty-after-clear as DELETED; first non-empty save as CREATED; else UPDATED.
  const action =
    !hadContent && willHaveContent
      ? "CREATED"
      : hadContent && !willHaveContent
        ? "DELETED"
        : "UPDATED";
  recordVersionEvent({
    projectId: artifact.projectId,
    entityType: "DOCUMENTATION",
    entityId: artifact.id,
    action,
    title: artifact.title,
    description: `Documentation ${action.toLowerCase()}`,
    triggeredBy: req.user!.userId,
    metadata: { length: content.length },
  });

  persist();

  return ok(
    res,
    {
      artifactId: artifact.id,
      content,
      updatedAt: artifact.updatedAt,
    },
    "Documentation saved",
  );
}
