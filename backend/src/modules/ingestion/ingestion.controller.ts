// Ingestion controller entry point: the format-agnostic record CRUD (list /
// create-draft / get / delete) plus re-exports of the per-format parse/confirm
// handlers, which live in colocated files (ingestion.{markdown,openapi,mermaid,sql}.ts).
// Keeping the re-exports here means ingestion.routes.ts imports every handler from
// this one module — keep the exported handler set stable when adding a format.
import type { Response } from "express";
import { z } from "zod";
import { IngestionSourceType, IngestionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { serializeRecord } from "./ingestion.shared.js";

export { parseMarkdownEndpoint, confirmMarkdownEndpoint } from "./ingestion.markdown.js";
export { parseOpenApiJsonEndpoint, confirmOpenApiJsonEndpoint } from "./ingestion.openapi.js";
export { parseMermaidEndpoint, confirmMermaidEndpoint } from "./ingestion.mermaid.js";
export { parseSqlSchemaEndpoint, confirmSqlSchemaEndpoint } from "./ingestion.sql.js";

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

  // IngestionRecord is an audit log; deleting it never cascades to the
  // artifacts / API specs / diagrams / database models the confirm step
  // produced (those rows have no FK back to IngestionRecord). The version
  // event title differs only so the timeline reads honestly.
  const wasConfirmed = row.status === IngestionStatus.CONFIRMED;
  await prisma.ingestionRecord.delete({ where: { id: row.id } });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "DELETED",
    title: wasConfirmed ? "Removed ingestion log" : "Ingestion draft deleted",
    description: `${row.sourceType} · ${row.title}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      previousStatus: row.status,
      logRemovalOnly: wasConfirmed,
    },
  });

  return ok(
    res,
    null,
    wasConfirmed
      ? "Ingestion log removed (created assets unchanged)"
      : "Ingestion record deleted",
  );
}
