import type { Response } from "express";
import { db } from "../../db/json-db.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

interface SummarizedArtifact {
  id: string;
  title: string;
  type: string;
  status: string;
}

interface RelationLink {
  relationId: string;
  artifact: SummarizedArtifact;
  relationType: string;
  description: string;
}

function summarizeArtifact(
  a: { id: string; title: string; type: string; status: string },
): SummarizedArtifact {
  return { id: a.id, title: a.title, type: a.type, status: a.status };
}

export function analyzeImpact(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const artifactId = req.params.artifactId;

  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const state = db();
  const artifact = state.artifacts.find((a) => a.id === artifactId);
  if (!artifact || artifact.projectId !== projectId) {
    return fail(res, 404, "NOT_FOUND", "Artifact not found in this project");
  }

  const artifactsById = new Map(state.artifacts.map((a) => [a.id, a]));

  // Relations the target depends on (outgoing edges).
  const outgoing = state.relations
    .filter((r) => r.sourceArtifactId === artifact.id)
    .map((r): RelationLink | null => {
      const target = artifactsById.get(r.targetArtifactId);
      if (!target || target.projectId !== projectId) return null;
      return {
        relationId: r.id,
        artifact: summarizeArtifact(target),
        relationType: r.relationType,
        description: r.description,
      };
    })
    .filter((x): x is RelationLink => !!x);

  // Relations that depend on the target (incoming edges).
  const incoming = state.relations
    .filter((r) => r.targetArtifactId === artifact.id)
    .map((r): RelationLink | null => {
      const source = artifactsById.get(r.sourceArtifactId);
      if (!source || source.projectId !== projectId) return null;
      return {
        relationId: r.id,
        artifact: summarizeArtifact(source),
        relationType: r.relationType,
        description: r.description,
      };
    })
    .filter((x): x is RelationLink => !!x);

  const apiSpecs = state.apiSpecs
    .filter((s) => s.projectId === projectId && s.artifactId === artifact.id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      version: s.version,
      baseUrl: s.baseUrl,
      endpointCount: state.apiEndpoints.filter((e) => e.apiSpecId === s.id).length,
    }));

  const databaseModels = state.databaseModels
    .filter((m) => m.projectId === projectId && m.artifactId === artifact.id)
    .map((m) => ({
      id: m.id,
      title: m.title,
      databaseType: m.databaseType,
      entityCount: state.databaseEntities.filter((e) => e.databaseModelId === m.id).length,
    }));

  const diagrams = state.diagrams
    .filter((d) => d.projectId === projectId && d.artifactId === artifact.id)
    .map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
    }));

  // Documentation: surface this artifact's own doc (truncated) and any
  // DOCUMENTATION-typed artifact that DOCUMENTS the target.
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
  for (const r of state.relations) {
    if (r.targetArtifactId !== artifact.id || r.relationType !== "DOCUMENTS") continue;
    const documenter = artifactsById.get(r.sourceArtifactId);
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

  const recentEvents = state.versionEvents
    .filter((e) => e.projectId === projectId && e.entityId === artifact.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

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
      apiSpecs,
      databaseModels,
      diagrams,
      documentation,
      recentEvents,
      impactSummary: {
        affectedArtifacts: incoming.length + outgoing.length,
        affectedApis: apiSpecs.length,
        affectedDatabases: databaseModels.length,
        affectedDiagrams: diagrams.length,
        affectedDocumentation: documentation.length,
      },
    },
    "OK",
  );
}
