import type { Response } from "express";
import { VersionAction, VersionEntityType, type VersionEvent } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export function serializeEvent(e: VersionEvent) {
  return {
    id: e.id,
    projectId: e.projectId,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    title: e.title,
    description: e.description,
    triggeredBy: e.triggeredById,
    metadata: e.metadata,
    createdAt: e.createdAt,
  };
}

async function projectAccess(projectId: string, userId: string): Promise<"ok" | "not_found" | "forbidden"> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

export async function listVersionHistory(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { entityType, action, search, q, limit } = req.query as Record<string, string | undefined>;
  const items = await prisma.versionEvent.findMany({
    where: {
      projectId,
      ...(entityType ? { entityType: entityType as VersionEntityType } : {}),
      ...(action ? { action: action as VersionAction } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const term = (search || q || "").toLowerCase().trim();
  let filtered = term
    ? items.filter(
        (e) =>
          e.title.toLowerCase().includes(term) || e.description.toLowerCase().includes(term),
      )
    : items;
  if (limit) {
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) filtered = filtered.slice(0, n);
  }
  return ok(res, filtered.map(serializeEvent), "OK");
}

export async function getVersionEvent(req: AuthedRequest, res: Response) {
  const row = await prisma.versionEvent.findUnique({ where: { id: req.params.eventId } });
  if (!row) return fail(res, 404, "NOT_FOUND", "Event not found");
  const access = await projectAccess(row.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");
  return ok(res, serializeEvent(row), "OK");
}
