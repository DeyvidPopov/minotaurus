import type { Response } from "express";
import { VersionAction, VersionEntityType, type VersionEvent } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok, respondProjectAccessDenied } from "../../utils/response.js";
import { normalizeSearchTerm } from "../../utils/list-filter.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { projectAccessStatus } from "../../lib/project-access.js";

interface AuthorInfo {
  id: string;
  name: string | null;
  initials: string | null;
}

function authorFromUser(u: { id: string; firstName: string; lastName: string } | undefined): AuthorInfo | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  const initials = `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
  return { id: u.id, name: name || null, initials: initials || null };
}

export function serializeEvent(e: VersionEvent, author?: AuthorInfo | null) {
  return {
    id: e.id,
    projectId: e.projectId,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    title: e.title,
    description: e.description,
    triggeredBy: e.triggeredById,
    triggeredByName: author?.name ?? null,
    triggeredByInitials: author?.initials ?? null,
    metadata: e.metadata,
    createdAt: e.createdAt,
  };
}

async function loadAuthorsFor(events: VersionEvent[]): Promise<Map<string, AuthorInfo>> {
  const ids = Array.from(new Set(events.map((e) => e.triggeredById).filter(Boolean)));
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  const map = new Map<string, AuthorInfo>();
  for (const u of users) {
    const a = authorFromUser(u);
    if (a) map.set(u.id, a);
  }
  return map;
}

export async function listVersionHistory(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccessStatus(projectId, req.user!.userId);
  if (respondProjectAccessDenied(res, access)) return;

  const { entityType, action, search, q, limit } = req.query as Record<string, string | undefined>;
  const items = await prisma.versionEvent.findMany({
    where: {
      projectId,
      ...(entityType ? { entityType: entityType as VersionEntityType } : {}),
      ...(action ? { action: action as VersionAction } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const term = normalizeSearchTerm(search, q);
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
  const authors = await loadAuthorsFor(filtered);
  return ok(
    res,
    filtered.map((e) => serializeEvent(e, authors.get(e.triggeredById))),
    "OK",
  );
}

export async function getVersionEvent(req: AuthedRequest, res: Response) {
  const row = await prisma.versionEvent.findUnique({ where: { id: req.params.eventId } });
  if (!row) return fail(res, 404, "NOT_FOUND", "Event not found");
  const access = await projectAccessStatus(row.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");
  const authors = await loadAuthorsFor([row]);
  return ok(res, serializeEvent(row, authors.get(row.triggeredById)), "OK");
}
