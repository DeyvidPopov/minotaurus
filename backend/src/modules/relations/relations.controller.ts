import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type RelationRow,
  type RelationType,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const RELATION_TYPES: RelationType[] = [
  "DEPENDS_ON",
  "DOCUMENTS",
  "IMPLEMENTS",
  "USES",
  "EXPOSES",
  "BELONGS_TO",
  "SECURES",
  "VALIDATES",
  "COMMUNICATES_WITH",
];

export function serializeRelation(r: RelationRow) {
  return {
    id: r.id,
    source: r.sourceArtifactId,
    target: r.targetArtifactId,
    type: r.relationType,
    description: r.description,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

function ownerForArtifact(artifactId: string): string | null {
  const artifact = db().artifacts.find((a) => a.id === artifactId);
  if (!artifact) return null;
  const project = db().projects.find((p) => p.id === artifact.projectId);
  return project ? project.ownerId : null;
}

const createSchema = z.object({
  targetArtifactId: z.string().min(1),
  relationType: z.enum(RELATION_TYPES as [RelationType, ...RelationType[]]),
  description: z.string().optional().default(""),
});

export function listRelations(req: AuthedRequest, res: Response) {
  const artifactId = req.params.artifactId;
  const artifact = db().artifacts.find((a) => a.id === artifactId);
  if (!artifact) return fail(res, 404, "NOT_FOUND", "Artifact not found");
  const owner = ownerForArtifact(artifactId);
  if (owner !== req.user!.userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

  const all = db().relations;
  const outgoing = all.filter((r) => r.sourceArtifactId === artifactId).map(serializeRelation);
  const incoming = all.filter((r) => r.targetArtifactId === artifactId).map(serializeRelation);
  return ok(res, { incoming, outgoing }, "OK");
}

export function createRelation(req: AuthedRequest, res: Response) {
  const artifactId = req.params.artifactId;
  const source = db().artifacts.find((a) => a.id === artifactId);
  if (!source) return fail(res, 404, "NOT_FOUND", "Source artifact not found");
  const owner = ownerForArtifact(artifactId);
  if (owner !== req.user!.userId) return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const target = db().artifacts.find((a) => a.id === parsed.data.targetArtifactId);
  if (!target) return fail(res, 404, "NOT_FOUND", "Target artifact not found");
  if (target.projectId !== source.projectId) {
    return fail(res, 400, "CROSS_PROJECT", "Source and target must belong to the same project");
  }
  if (target.id === source.id) {
    return fail(res, 400, "SELF_RELATION", "Cannot relate an artifact to itself");
  }

  const relation: RelationRow = {
    id: newId(),
    sourceArtifactId: source.id,
    targetArtifactId: target.id,
    relationType: parsed.data.relationType,
    description: parsed.data.description,
    createdBy: req.user!.userId,
    createdAt: new Date().toISOString(),
  };
  db().relations.push(relation);
  recordVersionEvent({
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
  persist();
  return created(res, serializeRelation(relation), "Relation created");
}

export function deleteRelation(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.relations.findIndex((r) => r.id === req.params.relationId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Relation not found");
  const rel = state.relations[idx];
  const owner = ownerForArtifact(rel.sourceArtifactId);
  if (owner !== req.user!.userId) return fail(res, 403, "FORBIDDEN", "Forbidden");
  state.relations.splice(idx, 1);
  const source = state.artifacts.find((a) => a.id === rel.sourceArtifactId);
  const target = state.artifacts.find((a) => a.id === rel.targetArtifactId);
  if (source) {
    recordVersionEvent({
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
  persist();
  return ok(res, null, "Relation deleted");
}
