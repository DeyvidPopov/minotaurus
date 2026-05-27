import type { Response } from "express";
import { z } from "zod";
import { RelationType, type ArtifactRelation } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

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

async function ownerForArtifact(artifactId: string): Promise<string | null> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return null;
  const project = await prisma.project.findUnique({ where: { id: artifact.projectId } });
  return project?.ownerId ?? null;
}

const createSchema = z.object({
  targetArtifactId: z.string().min(1),
  relationType: z.enum(RELATION_TYPES),
  description: z.string().optional().default(""),
});

export async function listRelations(req: AuthedRequest, res: Response) {
  const artifactId = req.params.artifactId;
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return fail(res, 404, "NOT_FOUND", "Artifact not found");
  const owner = await ownerForArtifact(artifactId);
  if (owner !== req.user!.userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

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
  const owner = await ownerForArtifact(artifactId);
  if (owner !== req.user!.userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

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

  const relation = await prisma.artifactRelation.create({
    data: {
      sourceArtifactId: source.id,
      targetArtifactId: target.id,
      relationType: parsed.data.relationType,
      description: parsed.data.description,
      createdById: req.user!.userId,
    },
  });
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
  const owner = await ownerForArtifact(rel.sourceArtifactId);
  if (owner !== req.user!.userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

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
