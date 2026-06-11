// Load-and-authorize helpers for database model / entity / field rows. Each loads
// the row, walks to its owning project, runs the shared project-access check, and
// returns { row, ... } | { error: "not_found" | "forbidden" }. The
// not_found-before-forbidden ordering is a deliberate info-disclosure boundary —
// preserve it (a missing row reads not_found; a real row the user can't see reads
// forbidden).
import { type ProjectRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

export async function findModelForUser(modelId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.databaseModel.findUnique({ where: { id: modelId } });
  if (!row) return { error: "not_found" as const };
  const a = await getProjectAccess(row.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row };
}

export async function findEntityForUser(entityId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.databaseEntity.findUnique({ where: { id: entityId } });
  if (!row) return { error: "not_found" as const };
  const model = await prisma.databaseModel.findUnique({ where: { id: row.databaseModelId } });
  if (!model) return { error: "not_found" as const };
  const a = await getProjectAccess(model.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row, model };
}

export async function findFieldForUser(fieldId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.databaseField.findUnique({ where: { id: fieldId } });
  if (!row) return { error: "not_found" as const };
  const entity = await prisma.databaseEntity.findUnique({ where: { id: row.entityId } });
  if (!entity) return { error: "not_found" as const };
  const model = await prisma.databaseModel.findUnique({ where: { id: entity.databaseModelId } });
  if (!model) return { error: "not_found" as const };
  const a = await getProjectAccess(model.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row, entity, model };
}
