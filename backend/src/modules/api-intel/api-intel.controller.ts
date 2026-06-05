// api-intel.controller.ts — read-only API Payload Intelligence endpoint.
// Loads project SSOT data, runs the pure deterministic analyzer, returns
// EndpointIntel[]. No writes, no persistence, no ArtifactRelation creation.

import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess } from "../../lib/project-access.js";
import { analyzeProjectApiIntel } from "./payload-analyzer.js";
import type { AnalyzerInput } from "./api-intel.types.js";

export async function getApiIntel(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const [specs, models, artifacts, relations] = await Promise.all([
    prisma.apiSpec.findMany({
      where: { projectId },
      select: { id: true, artifactId: true, title: true },
    }),
    prisma.databaseModel.findMany({
      where: { projectId },
      select: {
        id: true,
        artifactId: true,
        title: true,
        entities: {
          select: { id: true, name: true, fields: { select: { name: true } } },
        },
      },
    }),
    prisma.artifact.findMany({
      where: { projectId },
      select: { id: true, title: true, type: true, status: true, documentationContent: true },
    }),
    prisma.artifactRelation.findMany({
      where: { sourceArtifact: { projectId } },
      select: { sourceArtifactId: true, targetArtifactId: true, relationType: true },
    }),
  ]);

  const endpoints = await prisma.apiEndpoint.findMany({
    where: { apiSpec: { projectId } },
    select: {
      id: true,
      apiSpecId: true,
      method: true,
      path: true,
      summary: true,
      requestSchema: true,
      responseSchema: true,
      requiresAuth: true,
    },
  });

  const endpointsBySpec = new Map<string, AnalyzerInput["specs"][number]["endpoints"]>();
  for (const e of endpoints) {
    const list = endpointsBySpec.get(e.apiSpecId) ?? [];
    list.push({
      id: e.id,
      method: e.method,
      path: e.path,
      summary: e.summary,
      requestSchema: e.requestSchema,
      responseSchema: e.responseSchema,
      requiresAuth: e.requiresAuth,
    });
    endpointsBySpec.set(e.apiSpecId, list);
  }

  const input: AnalyzerInput = {
    specs: specs.map((s) => ({
      id: s.id,
      artifactId: s.artifactId,
      title: s.title,
      endpoints: endpointsBySpec.get(s.id) ?? [],
    })),
    models: models.map((m) => ({
      id: m.id,
      artifactId: m.artifactId,
      title: m.title,
      entities: m.entities.map((e) => ({ id: e.id, name: e.name, fields: e.fields.map((f) => ({ name: f.name })) })),
    })),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      status: a.status,
      documentationContent: a.documentationContent,
    })),
    relations: relations.map((r) => ({
      sourceArtifactId: r.sourceArtifactId,
      targetArtifactId: r.targetArtifactId,
      relationType: r.relationType,
    })),
  };

  const result = analyzeProjectApiIntel(input);
  return ok(res, result, "OK");
}
