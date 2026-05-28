import type { Response } from "express";
import { z } from "zod";
import {
  IngestionSourceType,
  IngestionStatus,
  type IngestionRecord,
  type User,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const SOURCE_TYPES = [
  IngestionSourceType.MARKDOWN,
  IngestionSourceType.OPENAPI_JSON,
  IngestionSourceType.MERMAID,
  IngestionSourceType.SQL_SCHEMA,
] as const;

const draftSchema = z.object({
  sourceType: z.enum([
    "MARKDOWN",
    "OPENAPI_JSON",
    "MERMAID",
    "SQL_SCHEMA",
  ]),
  title: z.string().min(1).max(160),
  sourceName: z.string().max(240).optional().default(""),
});

type RecordWithUser = IngestionRecord & {
  createdBy: Pick<User, "id" | "firstName" | "lastName" | "email"> | null;
};

function serializeRecord(r: RecordWithUser) {
  const u = r.createdBy;
  const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() : "";
  return {
    id: r.id,
    projectId: r.projectId,
    sourceType: r.sourceType,
    status: r.status,
    title: r.title,
    sourceName: r.sourceName,
    createdRecords: r.createdRecords,
    errorMessage: r.errorMessage,
    createdById: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: u
      ? {
          id: u.id,
          email: u.email,
          name: name || null,
          initials:
            `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() || null,
        }
      : null,
  };
}

export async function listIngestionRecords(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");

  const rows = await prisma.ingestionRecord.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return ok(res, rows.map(serializeRecord), "OK");
}

export async function createDraft(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  if (!hasAtLeast(access.role!, "DEVELOPER")) {
    return fail(res, 403, "INSUFFICIENT_ROLE", "Requires DEVELOPER or higher");
  }

  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  if (!SOURCE_TYPES.includes(parsed.data.sourceType as IngestionSourceType)) {
    return fail(res, 400, "VALIDATION_ERROR", "Invalid source type");
  }

  const row = await prisma.ingestionRecord.create({
    data: {
      projectId,
      sourceType: parsed.data.sourceType as IngestionSourceType,
      status: IngestionStatus.DRAFT,
      title: parsed.data.title,
      sourceName: parsed.data.sourceName ?? "",
      createdRecords: [],
      createdById: req.user!.userId,
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  await recordVersionEvent({
    projectId,
    entityType: "PROJECT",
    entityId: projectId,
    action: "CREATED",
    title: "Ingestion draft created",
    description: `${row.sourceType} · ${row.title}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
    },
  });

  return created(res, serializeRecord(row), "Ingestion draft created");
}

export async function getIngestionRecord(req: AuthedRequest, res: Response) {
  const row = await prisma.ingestionRecord.findUnique({
    where: { id: req.params.ingestionId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!row) return fail(res, 404, "NOT_FOUND", "Ingestion record not found");
  const access = await getProjectAccess(row.projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  return ok(res, serializeRecord(row), "OK");
}

export async function deleteIngestionRecord(req: AuthedRequest, res: Response) {
  const row = await prisma.ingestionRecord.findUnique({
    where: { id: req.params.ingestionId },
  });
  if (!row) return fail(res, 404, "NOT_FOUND", "Ingestion record not found");
  const access = await getProjectAccess(row.projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  if (!hasAtLeast(access.role!, "DEVELOPER")) {
    return fail(res, 403, "INSUFFICIENT_ROLE", "Requires DEVELOPER or higher");
  }

  await prisma.ingestionRecord.delete({ where: { id: row.id } });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "DELETED",
    title: "Ingestion draft deleted",
    description: `${row.sourceType} · ${row.title}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      previousStatus: row.status,
    },
  });

  return ok(res, null, "Ingestion record deleted");
}
