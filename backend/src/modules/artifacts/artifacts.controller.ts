import type { Response } from "express";
import { z } from "zod";
import { ArtifactStatus, ArtifactType, ProjectRole, type Artifact, type User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import { normalizeSearchTerm } from "../../utils/list-filter.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { toPublicUser } from "../auth/auth.controller.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";
import {
  ARTIFACT_TITLE_TAKEN_MESSAGE,
  checkArtifactTitleConflict,
  normalizeArtifactTitle,
} from "./artifact-title.js";

const ARTIFACT_TYPES = Object.values(ArtifactType) as [ArtifactType, ...ArtifactType[]];
const ARTIFACT_STATUSES = Object.values(ArtifactStatus) as [ArtifactStatus, ...ArtifactStatus[]];

// Pure DTO shaping — no queries. Both the per-row serializer (create/get/update)
// and the batched list path build the identical wire shape through this.
function buildArtifactDto(
  a: Artifact,
  author: User | null,
  relationCount: number,
  validationIssueCount: number,
) {
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
          id: a.createdById,
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

// Per-row serializer for the O(1) single-artifact endpoints (create/get/update).
// The list endpoint must NOT use this in a loop — see `loadArtifactAggregates`.
async function serializeArtifact(a: Artifact, authorOverride?: User | null) {
  const [author, relationCount, validationIssueCount] = await Promise.all([
    authorOverride
      ? Promise.resolve(authorOverride)
      : prisma.user.findUnique({ where: { id: a.createdById } }),
    prisma.artifactRelation.count({
      where: {
        OR: [{ sourceArtifactId: a.id }, { targetArtifactId: a.id }],
      },
    }),
    prisma.validationIssue.count({
      where: { artifactId: a.id, status: "OPEN" },
    }),
  ]);
  return buildArtifactDto(a, author, relationCount, validationIssueCount);
}

// Batched aggregates for the list path: resolves authors + relation counts +
// open-issue counts for a whole page of artifacts in a FIXED number of queries
// (1 user findMany + 2 relation groupBys + 1 issue groupBy) instead of 3 per
// row. Relation count = incident edges (incoming + outgoing); self-loops are
// DB-CHECK-blocked so source/target sums never double-count an edge. All three
// queries are index-backed (relation source/target idx, ValidationIssue
// (projectId,status) + (artifactId)).
async function loadArtifactAggregates(projectId: string, artifacts: Artifact[]) {
  const empty = {
    authors: new Map<string, User>(),
    relationCounts: new Map<string, number>(),
    issueCounts: new Map<string, number>(),
  };
  if (artifacts.length === 0) return empty;
  const ids = artifacts.map((a) => a.id);
  const authorIds = Array.from(new Set(artifacts.map((a) => a.createdById)));
  const [users, outgoing, incoming, issues] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: authorIds } } }),
    prisma.artifactRelation.groupBy({
      by: ["sourceArtifactId"],
      where: { sourceArtifactId: { in: ids } },
      _count: true,
    }),
    prisma.artifactRelation.groupBy({
      by: ["targetArtifactId"],
      where: { targetArtifactId: { in: ids } },
      _count: true,
    }),
    prisma.validationIssue.groupBy({
      by: ["artifactId"],
      where: { projectId, artifactId: { in: ids }, status: "OPEN" },
      _count: true,
    }),
  ]);
  const authors = new Map(users.map((u) => [u.id, u]));
  const relationCounts = new Map<string, number>();
  for (const g of outgoing) {
    relationCounts.set(g.sourceArtifactId, (relationCounts.get(g.sourceArtifactId) ?? 0) + g._count);
  }
  for (const g of incoming) {
    relationCounts.set(g.targetArtifactId, (relationCounts.get(g.targetArtifactId) ?? 0) + g._count);
  }
  const issueCounts = new Map<string, number>();
  for (const g of issues) {
    if (g.artifactId) issueCounts.set(g.artifactId, g._count);
  }
  return { authors, relationCounts, issueCounts };
}

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(ARTIFACT_TYPES),
  status: z.enum(ARTIFACT_STATUSES).optional().default("DRAFT"),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  gx: z.number().optional(),
  gy: z.number().optional(),
  documentationContent: z.string().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(ARTIFACT_TYPES).optional(),
  status: z.enum(ARTIFACT_STATUSES).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  gx: z.number().optional(),
  gy: z.number().optional(),
  documentationContent: z.string().optional(),
});

async function ensureProjectAccess(
  projectId: string,
  userId: string,
  minRole: ProjectRole = "VIEWER",
): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await getProjectAccess(projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

export async function listArtifacts(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await ensureProjectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { type, status, search, q } = req.query as Record<string, string | undefined>;
  const items = await prisma.artifact.findMany({
    where: {
      projectId,
      ...(type ? { type: type as ArtifactType } : {}),
      ...(status ? { status: status as ArtifactStatus } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const term = normalizeSearchTerm(search, q);
  const filtered = term
    ? items.filter(
        (a) =>
          a.title.toLowerCase().includes(term) ||
          a.description.toLowerCase().includes(term),
      )
    : items;

  const { authors, relationCounts, issueCounts } = await loadArtifactAggregates(projectId, filtered);
  const serialized = filtered.map((a) =>
    buildArtifactDto(
      a,
      authors.get(a.createdById) ?? null,
      relationCounts.get(a.id) ?? 0,
      issueCounts.get(a.id) ?? 0,
    ),
  );
  return ok(res, serialized, "OK");
}

export async function createArtifact(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await ensureProjectAccess(projectId, req.user!.userId, "DEVELOPER");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const trimmedTitle = parsed.data.title.trim();
  if (!trimmedTitle) return fail(res, 400, "VALIDATION_ERROR", "Title is required");
  const titleCheck = await checkArtifactTitleConflict(projectId, trimmedTitle);
  if (titleCheck.conflict) {
    return fail(res, 409, "ARTIFACT_TITLE_TAKEN", ARTIFACT_TITLE_TAKEN_MESSAGE);
  }

  const artifact = await prisma.artifact.create({
    data: {
      projectId,
      title: trimmedTitle,
      normalizedTitle: titleCheck.normalized,
      type: parsed.data.type,
      status: parsed.data.status,
      description: parsed.data.description,
      tags: parsed.data.tags,
      gx: parsed.data.gx ?? Math.floor(Math.random() * 600) + 50,
      gy: parsed.data.gy ?? Math.floor(Math.random() * 400) + 50,
      createdById: req.user!.userId,
      documentationContent: parsed.data.documentationContent,
    },
  });
  await recordVersionEvent({
    projectId,
    entityType: "ARTIFACT",
    entityId: artifact.id,
    action: "CREATED",
    title: artifact.title,
    description: `${artifact.type} (${artifact.status})`,
    triggeredBy: req.user!.userId,
    metadata: { type: artifact.type, status: artifact.status },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });
  return created(res, await serializeArtifact(artifact), "Artifact created");
}

export async function getArtifact(req: AuthedRequest, res: Response) {
  const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
  if (!artifact) return fail(res, 404, "NOT_FOUND", "Artifact not found");
  const access = await ensureProjectAccess(artifact.projectId, req.user!.userId);
  if (access !== "ok")
    return access === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Artifact not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  return ok(res, await serializeArtifact(artifact), "OK");
}

export async function updateArtifact(req: AuthedRequest, res: Response) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const existing = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
  if (!existing) return fail(res, 404, "NOT_FOUND", "Artifact not found");
  const access = await ensureProjectAccess(existing.projectId, req.user!.userId, "DEVELOPER");
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  let nextTitle: string | undefined;
  let nextNormalized: string | undefined;
  if (parsed.data.title !== undefined) {
    nextTitle = parsed.data.title.trim();
    if (!nextTitle) return fail(res, 400, "VALIDATION_ERROR", "Title is required");
    const normalized = normalizeArtifactTitle(nextTitle);
    if (normalized !== existing.normalizedTitle) {
      const conflict = await checkArtifactTitleConflict(existing.projectId, nextTitle, existing.id);
      if (conflict.conflict) {
        return fail(res, 409, "ARTIFACT_TITLE_TAKEN", ARTIFACT_TITLE_TAKEN_MESSAGE);
      }
      nextNormalized = normalized;
    }
  }

  const updated = await prisma.artifact.update({
    where: { id: existing.id },
    data: {
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(nextNormalized !== undefined ? { normalizedTitle: nextNormalized } : {}),
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      ...(parsed.data.gx !== undefined ? { gx: parsed.data.gx } : {}),
      ...(parsed.data.gy !== undefined ? { gy: parsed.data.gy } : {}),
      ...(parsed.data.documentationContent !== undefined
        ? { documentationContent: parsed.data.documentationContent }
        : {}),
    },
  });
  await recordVersionEvent({
    projectId: updated.projectId,
    entityType: "ARTIFACT",
    entityId: updated.id,
    action: "UPDATED",
    title: updated.title,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { changed: Object.keys(parsed.data) },
  });
  await prisma.project.update({
    where: { id: updated.projectId },
    data: { updatedAt: new Date() },
  });
  return ok(res, await serializeArtifact(updated), "Artifact updated");
}

export async function deleteArtifact(req: AuthedRequest, res: Response) {
  const existing = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
  if (!existing) return fail(res, 404, "NOT_FOUND", "Artifact not found");
  const access = await ensureProjectAccess(existing.projectId, req.user!.userId, "DEVELOPER");
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  await prisma.artifact.delete({ where: { id: existing.id } });
  await recordVersionEvent({
    projectId: existing.projectId,
    entityType: "ARTIFACT",
    entityId: existing.id,
    action: "DELETED",
    title: existing.title,
    description: `${existing.type} removed`,
    triggeredBy: req.user!.userId,
  });
  await prisma.project.update({
    where: { id: existing.projectId },
    data: { updatedAt: new Date() },
  });
  return ok(res, null, "Artifact deleted");
}

export { serializeArtifact };
