import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type ArtifactRow,
  type ArtifactStatus,
  type ArtifactType,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { toPublicUser } from "../auth/auth.controller.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const ARTIFACT_TYPES: ArtifactType[] = [
  "DOCUMENTATION",
  "API_SPEC",
  "API_ENDPOINT",
  "SERVICE",
  "DATABASE_MODEL",
  "DATABASE_ENTITY",
  "DIAGRAM",
  "REQUIREMENT",
  "SECURITY_POLICY",
  "ENVIRONMENT",
  "EXTERNAL_SYSTEM",
];

const ARTIFACT_STATUSES: ArtifactStatus[] = ["DRAFT", "ACTIVE", "DEPRECATED"];

export function serializeArtifact(a: ArtifactRow) {
  const state = db();
  const author = state.users.find((u) => u.id === a.createdBy);
  const relationCount = state.relations.filter(
    (r) => r.sourceArtifactId === a.id || r.targetArtifactId === a.id,
  ).length;
  const validationIssueCount = state.validationIssues.filter(
    (v) => v.artifactId === a.id && v.status === "OPEN",
  ).length;
  return {
    id: a.id,
    projectId: a.projectId,
    title: a.title,
    type: a.type,
    status: a.status,
    description: a.description,
    tags: a.tags,
    gx: a.gx,
    gy: a.gy,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    author: author
      ? toPublicUser(author)
      : {
          id: a.createdBy,
          email: "unknown@unknown",
          firstName: "Unknown",
          lastName: "User",
          role: "ENGINEER" as const,
          initials: "UU",
        },
    relationCount,
    validationIssueCount,
    documentationContent: a.documentationContent,
  };
}

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(ARTIFACT_TYPES as [ArtifactType, ...ArtifactType[]]),
  status: z
    .enum(ARTIFACT_STATUSES as [ArtifactStatus, ...ArtifactStatus[]])
    .optional()
    .default("DRAFT"),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  gx: z.number().optional(),
  gy: z.number().optional(),
  documentationContent: z.string().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(ARTIFACT_TYPES as [ArtifactType, ...ArtifactType[]]).optional(),
  status: z.enum(ARTIFACT_STATUSES as [ArtifactStatus, ...ArtifactStatus[]]).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  gx: z.number().optional(),
  gy: z.number().optional(),
  documentationContent: z.string().optional(),
});

function ensureProjectAccess(
  projectId: string,
  userId: string,
): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  if (project.ownerId !== userId) return "forbidden";
  return "ok";
}

export function listArtifacts(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = ensureProjectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { type, status, search, q } = req.query as Record<string, string | undefined>;
  let items = db().artifacts.filter((a) => a.projectId === projectId);
  if (type) items = items.filter((a) => a.type === type);
  if (status) items = items.filter((a) => a.status === status);
  const term = (search || q || "").toLowerCase().trim();
  if (term) {
    items = items.filter(
      (a) =>
        a.title.toLowerCase().includes(term) ||
        a.description.toLowerCase().includes(term),
    );
  }
  return ok(res, items.map(serializeArtifact), "OK");
}

export function createArtifact(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = ensureProjectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const now = new Date().toISOString();
  const artifact: ArtifactRow = {
    id: newId(),
    projectId,
    title: parsed.data.title,
    type: parsed.data.type,
    status: parsed.data.status,
    description: parsed.data.description,
    tags: parsed.data.tags,
    gx: parsed.data.gx ?? Math.floor(Math.random() * 600) + 50,
    gy: parsed.data.gy ?? Math.floor(Math.random() * 400) + 50,
    createdBy: req.user!.userId,
    createdAt: now,
    updatedAt: now,
    documentationContent: parsed.data.documentationContent,
  };
  db().artifacts.push(artifact);
  recordVersionEvent({
    projectId,
    entityType: "ARTIFACT",
    entityId: artifact.id,
    action: "CREATED",
    title: artifact.title,
    description: `${artifact.type} (${artifact.status})`,
    triggeredBy: req.user!.userId,
    metadata: { type: artifact.type, status: artifact.status },
  });
  touchProject(projectId);
  persist();
  return created(res, serializeArtifact(artifact), "Artifact created");
}

function findArtifactForUser(
  artifactId: string,
  userId: string,
): { row: ArtifactRow } | { error: "not_found" | "forbidden" } {
  const row = db().artifacts.find((a) => a.id === artifactId);
  if (!row) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row };
}

export function getArtifact(req: AuthedRequest, res: Response) {
  const result = findArtifactForUser(req.params.artifactId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Artifact not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, serializeArtifact(result.row), "OK");
}

export function updateArtifact(req: AuthedRequest, res: Response) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = findArtifactForUser(req.params.artifactId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Artifact not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    (row as unknown as Record<string, unknown>)[k] = v;
  }
  row.updatedAt = new Date().toISOString();
  recordVersionEvent({
    projectId: row.projectId,
    entityType: "ARTIFACT",
    entityId: row.id,
    action: "UPDATED",
    title: row.title,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { changed: Object.keys(parsed.data) },
  });
  touchProject(row.projectId);
  persist();
  return ok(res, serializeArtifact(row), "Artifact updated");
}

export function deleteArtifact(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.artifacts.findIndex((a) => a.id === req.params.artifactId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Artifact not found");
  const row = state.artifacts[idx];
  const project = state.projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.artifacts.splice(idx, 1);
  state.relations = state.relations.filter(
    (r) => r.sourceArtifactId !== row.id && r.targetArtifactId !== row.id,
  );
  state.validationIssues = state.validationIssues.filter((v) => v.artifactId !== row.id);
  recordVersionEvent({
    projectId: row.projectId,
    entityType: "ARTIFACT",
    entityId: row.id,
    action: "DELETED",
    title: row.title,
    description: `${row.type} removed`,
    triggeredBy: req.user!.userId,
  });
  touchProject(row.projectId);
  persist();
  return ok(res, null, "Artifact deleted");
}

function touchProject(projectId: string) {
  const project = db().projects.find((p) => p.id === projectId);
  if (project) project.updatedAt = new Date().toISOString();
}
