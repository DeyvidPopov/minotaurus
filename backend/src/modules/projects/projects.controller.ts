import type { Response } from "express";
import { z } from "zod";
import { db, persist, type ProjectRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function colorFromId(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return COLORS[sum % COLORS.length];
}

export function serializeProject(p: ProjectRow) {
  const state = db();
  const artifactCount = state.artifacts.filter((a) => a.projectId === p.id).length;
  const validationIssueCount = state.validationIssues.filter(
    (v) => v.projectId === p.id && v.status === "OPEN",
  ).length;
  return {
    id: p.id,
    name: p.name,
    slug: slugify(p.name),
    description: p.description,
    ownerId: p.ownerId,
    artifactCount,
    validationIssueCount,
    members: 1,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    starred: false,
    color: colorFromId(p.id),
  };
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export function listProjects(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const items = db()
    .projects.filter((p) => p.ownerId === userId)
    .map(serializeProject);
  return ok(res, items, "OK");
}

export function createProject(req: AuthedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const now = new Date().toISOString();
  const project: ProjectRow = {
    id: newId(),
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    ownerId: req.user!.userId,
    createdAt: now,
    updatedAt: now,
  };
  db().projects.push(project);
  persist();
  return created(res, serializeProject(project), "Project created");
}

export function getProject(req: AuthedRequest, res: Response) {
  const project = db().projects.find((p) => p.id === req.params.projectId);
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  }
  return ok(res, serializeProject(project), "OK");
}

export function updateProject(req: AuthedRequest, res: Response) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const project = db().projects.find((p) => p.id === req.params.projectId);
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  }
  if (parsed.data.name !== undefined) project.name = parsed.data.name;
  if (parsed.data.description !== undefined) project.description = parsed.data.description;
  project.updatedAt = new Date().toISOString();
  persist();
  return ok(res, serializeProject(project), "Project updated");
}

export function deleteProject(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.projects.findIndex((p) => p.id === req.params.projectId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (state.projects[idx].ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  }
  const projectId = state.projects[idx].id;
  state.projects.splice(idx, 1);
  state.artifacts = state.artifacts.filter((a) => a.projectId !== projectId);
  const remainingArtifactIds = new Set(state.artifacts.map((a) => a.id));
  state.relations = state.relations.filter(
    (r) =>
      remainingArtifactIds.has(r.sourceArtifactId) &&
      remainingArtifactIds.has(r.targetArtifactId),
  );
  state.validationIssues = state.validationIssues.filter((v) => v.projectId !== projectId);
  state.exports = state.exports.filter((e) => e.projectId !== projectId);
  persist();
  return ok(res, null, "Project deleted");
}
