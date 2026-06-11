import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { fail, ok, respondProjectAccessDenied } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { projectAccessStatus } from "../../lib/project-access.js";

interface SummarizedArtifact {
  id: string;
  title: string;
  type: string;
  status: string;
}

function summarizeArtifact(
  a: { id: string; title: string; type: string; status: string },
): SummarizedArtifact {
  return { id: a.id, title: a.title, type: a.type, status: a.status };
}

export async function analyzeImpact(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const artifactId = req.params.artifactId;

  const access = await projectAccessStatus(projectId, req.user!.userId);
  if (respondProjectAccessDenied(res, access)) return;

  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact || artifact.projectId !== projectId) {
    return fail(res, 404, "NOT_FOUND", "Artifact not found in this project");
  }

  const [outgoingRels, incomingRels, apiSpecs, databaseModels, diagrams, documenterRels, recentEvents] =
    await Promise.all([
      prisma.artifactRelation.findMany({
        where: { sourceArtifactId: artifact.id },
        include: { targetArtifact: true },
      }),
      prisma.artifactRelation.findMany({
        where: { targetArtifactId: artifact.id },
        include: { sourceArtifact: true },
      }),
      prisma.apiSpec.findMany({ where: { projectId, artifactId: artifact.id } }),
      prisma.databaseModel.findMany({ where: { projectId, artifactId: artifact.id } }),
      prisma.diagram.findMany({ where: { projectId, artifactId: artifact.id } }),
      prisma.artifactRelation.findMany({
        where: { targetArtifactId: artifact.id, relationType: "DOCUMENTS" },
        include: { sourceArtifact: true },
      }),
      prisma.versionEvent.findMany({
        where: { projectId, entityId: artifact.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  const outgoing = outgoingRels
    .filter((r) => r.targetArtifact.projectId === projectId)
    .map((r) => ({
      relationId: r.id,
      artifact: summarizeArtifact(r.targetArtifact),
      relationType: r.relationType,
      description: r.description,
    }));
  const incoming = incomingRels
    .filter((r) => r.sourceArtifact.projectId === projectId)
    .map((r) => ({
      relationId: r.id,
      artifact: summarizeArtifact(r.sourceArtifact),
      relationType: r.relationType,
      description: r.description,
    }));

  const apiSpecsOut = await Promise.all(
    apiSpecs.map(async (s) => ({
      id: s.id,
      title: s.title,
      version: s.version,
      baseUrl: s.baseUrl,
      endpointCount: await prisma.apiEndpoint.count({ where: { apiSpecId: s.id } }),
    })),
  );

  const databaseModelsOut = await Promise.all(
    databaseModels.map(async (m) => ({
      id: m.id,
      title: m.title,
      databaseType: m.databaseType,
      entityCount: await prisma.databaseEntity.count({ where: { databaseModelId: m.id } }),
    })),
  );

  const diagramsOut = diagrams.map((d) => ({ id: d.id, title: d.title, type: d.type }));

  const documentation: {
    artifactId: string;
    title: string;
    excerpt: string;
    source: "self" | "documenter";
  }[] = [];
  if (artifact.documentationContent && artifact.documentationContent.trim()) {
    documentation.push({
      artifactId: artifact.id,
      title: artifact.title,
      excerpt: artifact.documentationContent.trim().slice(0, 220),
      source: "self",
    });
  }
  for (const r of documenterRels) {
    const documenter = r.sourceArtifact;
    if (!documenter || documenter.projectId !== projectId) continue;
    documentation.push({
      artifactId: documenter.id,
      title: documenter.title,
      excerpt:
        documenter.documentationContent && documenter.documentationContent.trim()
          ? documenter.documentationContent.trim().slice(0, 220)
          : documenter.description,
      source: "documenter",
    });
  }

  return ok(
    res,
    {
      artifact: {
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        status: artifact.status,
        description: artifact.description,
      },
      directDependencies: outgoing,
      dependentArtifacts: incoming,
      apiSpecs: apiSpecsOut,
      databaseModels: databaseModelsOut,
      diagrams: diagramsOut,
      documentation,
      recentEvents: await (async () => {
        const ids = Array.from(new Set(recentEvents.map((e) => e.triggeredById).filter(Boolean)));
        const users = ids.length
          ? await prisma.user.findMany({
              where: { id: { in: ids } },
              select: { id: true, firstName: true, lastName: true },
            })
          : [];
        const nameById = new Map(
          users.map((u) => [
            u.id,
            {
              name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null,
              initials: `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() || null,
            },
          ]),
        );
        return recentEvents.map((e) => ({
          id: e.id,
          projectId: e.projectId,
          entityType: e.entityType,
          entityId: e.entityId,
          action: e.action,
          title: e.title,
          description: e.description,
          triggeredBy: e.triggeredById,
          triggeredByName: nameById.get(e.triggeredById)?.name ?? null,
          triggeredByInitials: nameById.get(e.triggeredById)?.initials ?? null,
          metadata: e.metadata,
          createdAt: e.createdAt,
        }));
      })(),
      impactSummary: {
        affectedArtifacts: incoming.length + outgoing.length,
        affectedApis: apiSpecsOut.length,
        affectedDatabases: databaseModelsOut.length,
        affectedDiagrams: diagramsOut.length,
        affectedDocumentation: documentation.length,
      },
    },
    "OK",
  );
}
