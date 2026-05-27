import type { Response } from "express";
import { db } from "../../db/json-db.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export function getGraph(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const artifacts = db().artifacts.filter((a) => a.projectId === projectId);
  const ids = new Set(artifacts.map((a) => a.id));
  const relations = db().relations.filter(
    (r) => ids.has(r.sourceArtifactId) && ids.has(r.targetArtifactId),
  );
  const nodes = artifacts.map((a) => ({
    id: a.id,
    label: a.title,
    type: a.type,
    status: a.status,
    gx: a.gx,
    gy: a.gy,
  }));
  const edges = relations.map((r) => ({
    id: r.id,
    source: r.sourceArtifactId,
    target: r.targetArtifactId,
    type: r.relationType,
  }));
  return ok(res, { nodes, edges }, "OK");
}
