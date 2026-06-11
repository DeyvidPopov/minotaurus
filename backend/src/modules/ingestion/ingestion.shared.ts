// Cross-format helpers shared by the ingestion controller and the per-format
// (markdown/openapi/mermaid/sql) parse/confirm handlers: the IngestionRecord DTO
// serializer, the createdBy select shape, and the auth+load gate every mutation
// runs first. Stateless — no module-level mutable state.
import type { Response } from "express";
import type { IngestionRecord, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

export type RecordWithUser = IngestionRecord & {
  createdBy: Pick<User, "id" | "firstName" | "lastName" | "email"> | null;
};

export function serializeRecord(r: RecordWithUser) {
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
    parserResult: r.parserResult,
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

export const INCLUDE_USER = {
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

// Loads the IngestionRecord by id and gates the mutation behind DEVELOPER+. On
// any deny it has ALREADY sent the response and returns null (callers do
// `if (!row) return;`). Keeps 404-before-403 ordering: a missing record / missing
// project is NOT_FOUND, an under-privileged member is INSUFFICIENT_ROLE.
export async function loadIngestionForMutation(req: AuthedRequest, res: Response) {
  const row = await prisma.ingestionRecord.findUnique({
    where: { id: req.params.ingestionId },
  });
  if (!row) {
    fail(res, 404, "NOT_FOUND", "Ingestion record not found");
    return null;
  }
  const access = await getProjectAccess(row.projectId, req.user!.userId);
  if (access.status === "not_found") {
    fail(res, 404, "NOT_FOUND", "Project not found");
    return null;
  }
  if (access.status !== "ok" || !hasAtLeast(access.role!, "DEVELOPER")) {
    fail(res, 403, "INSUFFICIENT_ROLE", "Requires DEVELOPER or higher");
    return null;
  }
  return row;
}
