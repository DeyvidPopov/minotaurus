import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess } from "../../lib/project-access.js";

export async function getGraph(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");
  // Select only the columns the graph projects — skips the wide
  // documentationContent / description / tags / normalizedTitle on every node.
  const [artifacts, relations] = await Promise.all([
    prisma.artifact.findMany({
      where: { projectId },
      select: { id: true, title: true, type: true, status: true, gx: true, gy: true },
    }),
    prisma.artifactRelation.findMany({
      where: { sourceArtifact: { projectId } },
      select: { id: true, sourceArtifactId: true, targetArtifactId: true, relationType: true },
    }),
  ]);
  const ids = new Set(artifacts.map((a) => a.id));
  const safeRelations = relations.filter(
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
  const edges = safeRelations.map((r) => ({
    id: r.id,
    source: r.sourceArtifactId,
    target: r.targetArtifactId,
    type: r.relationType,
  }));
  return ok(res, { nodes, edges }, "OK");
}
