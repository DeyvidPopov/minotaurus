import type { Response } from "express";
import { db, type VersionEventRow } from "../../db/json-db.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export function serializeEvent(e: VersionEventRow) {
  return {
    id: e.id,
    projectId: e.projectId,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    title: e.title,
    description: e.description,
    triggeredBy: e.triggeredBy,
    metadata: e.metadata,
    createdAt: e.createdAt,
  };
}

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

export function listVersionHistory(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { entityType, action, search, q, limit } = req.query as Record<string, string | undefined>;
  let items = db().versionEvents.filter((e) => e.projectId === projectId);
  if (entityType) items = items.filter((e) => e.entityType === entityType);
  if (action) items = items.filter((e) => e.action === action);
  const term = (search || q || "").toLowerCase().trim();
  if (term) {
    items = items.filter(
      (e) => e.title.toLowerCase().includes(term) || e.description.toLowerCase().includes(term),
    );
  }
  items = items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (limit) {
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) items = items.slice(0, n);
  }
  return ok(res, items.map(serializeEvent), "OK");
}

export function getVersionEvent(req: AuthedRequest, res: Response) {
  const row = db().versionEvents.find((e) => e.id === req.params.eventId);
  if (!row) return fail(res, 404, "NOT_FOUND", "Event not found");
  const access = projectAccess(row.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");
  return ok(res, serializeEvent(row), "OK");
}
