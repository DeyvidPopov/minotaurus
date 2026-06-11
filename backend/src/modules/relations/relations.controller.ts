import type { Response } from "express";
import { z } from "zod";
import { ProjectRole, RelationType, type ArtifactRelation } from "@prisma/client";
import { isUniqueViolation } from "../../utils/prisma-errors.js";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

const RELATION_TYPES = Object.values(RelationType) as [RelationType, ...RelationType[]];

export function serializeRelation(r: ArtifactRelation) {
  return {
    id: r.id,
    source: r.sourceArtifactId,
    target: r.targetArtifactId,
    type: r.relationType,
    description: r.description,
    createdBy: r.createdById,
    createdAt: r.createdAt,
  };
}

async function accessForArtifact(
  artifactId: string,
  userId: string,
  minRole: ProjectRole = "VIEWER",
): Promise<"ok" | "not_found" | "forbidden"> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return "not_found";
  const a = await getProjectAccess(artifact.projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

const createSchema = z.object({
  targetArtifactId: z.string().min(1),
  relationType: z.enum(RELATION_TYPES),
  description: z.string().optional().default(""),
});

export async function listRelations(req: AuthedRequest, res: Response) {
  const artifactId = req.params.artifactId;
  const access = await accessForArtifact(artifactId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Artifact not found");
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const [outgoing, incoming] = await Promise.all([
    prisma.artifactRelation.findMany({ where: { sourceArtifactId: artifactId } }),
    prisma.artifactRelation.findMany({ where: { targetArtifactId: artifactId } }),
  ]);

  return ok(
    res,
    {
      incoming: incoming.map(serializeRelation),
      outgoing: outgoing.map(serializeRelation),
    },
    "OK",
  );
}

export async function createRelation(req: AuthedRequest, res: Response) {
  const artifactId = req.params.artifactId;
  const source = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!source) return fail(res, 404, "NOT_FOUND", "Source artifact not found");
  const access = await accessForArtifact(artifactId, req.user!.userId, "DEVELOPER");
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const target = await prisma.artifact.findUnique({ where: { id: parsed.data.targetArtifactId } });
  if (!target) return fail(res, 404, "NOT_FOUND", "Target artifact not found");
  if (target.projectId !== source.projectId) {
    return fail(res, 400, "CROSS_PROJECT", "Source and target must belong to the same project");
  }
  if (target.id === source.id) {
    return fail(res, 400, "SELF_RELATION", "Cannot relate an artifact to itself");
  }

  let relation: ArtifactRelation;
  try {
    relation = await prisma.artifactRelation.create({
      data: {
        sourceArtifactId: source.id,
        targetArtifactId: target.id,
        relationType: parsed.data.relationType,
        description: parsed.data.description,
        createdById: req.user!.userId,
      },
    });
  } catch (err) {
    // The DB enforces edge uniqueness (source, target, type). Map the unique
    // violation to a clean 409 instead of a 500 — race-safe vs. a pre-check.
    if (isUniqueViolation(err)) {
      return fail(res, 409, "RELATION_EXISTS", "Relation already exists");
    }
    // eslint-disable-next-line no-console
    console.error("[relations] create failed", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to create relation");
  }
  await recordVersionEvent({
    projectId: source.projectId,
    entityType: "RELATION",
    entityId: relation.id,
    action: "LINKED",
    title: `${source.title} → ${target.title}`,
    description: relation.relationType,
    triggeredBy: req.user!.userId,
    metadata: {
      relationType: relation.relationType,
      sourceArtifactId: source.id,
      targetArtifactId: target.id,
    },
  });
  return created(res, serializeRelation(relation), "Relation created");
}

export async function deleteRelation(req: AuthedRequest, res: Response) {
  const rel = await prisma.artifactRelation.findUnique({ where: { id: req.params.relationId } });
  if (!rel) return fail(res, 404, "NOT_FOUND", "Relation not found");
  const access = await accessForArtifact(rel.sourceArtifactId, req.user!.userId, "DEVELOPER");
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const [source, target] = await Promise.all([
    prisma.artifact.findUnique({ where: { id: rel.sourceArtifactId } }),
    prisma.artifact.findUnique({ where: { id: rel.targetArtifactId } }),
  ]);
  await prisma.artifactRelation.delete({ where: { id: rel.id } });
  if (source) {
    await recordVersionEvent({
      projectId: source.projectId,
      entityType: "RELATION",
      entityId: rel.id,
      action: "UNLINKED",
      title: `${source.title} ↮ ${target?.title ?? rel.targetArtifactId}`,
      description: rel.relationType,
      triggeredBy: req.user!.userId,
      metadata: {
        relationType: rel.relationType,
        sourceArtifactId: rel.sourceArtifactId,
        targetArtifactId: rel.targetArtifactId,
      },
    });
  }
  return ok(res, null, "Relation deleted");
}
