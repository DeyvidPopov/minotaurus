// Response mappers for database models / entities / fields. serializeField is a
// pure field-by-field map; serializeModel and serializeEntity also hit Prisma (an
// entity count, the ordered field load). All three shapes are the API contract.
import type { DatabaseEntity, DatabaseField, DatabaseModel } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export async function serializeModel(m: DatabaseModel) {
  const entityCount = await prisma.databaseEntity.count({ where: { databaseModelId: m.id } });
  return {
    id: m.id,
    projectId: m.projectId,
    artifactId: m.artifactId,
    title: m.title,
    databaseType: m.databaseType,
    description: m.description,
    createdBy: m.createdById,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    entityCount,
  };
}

export async function serializeEntity(e: DatabaseEntity) {
  // Fields are user-orderable (see `position`); secondary `name` keeps ties
  // deterministic (e.g. bulk-created rows that share the default position 0).
  const fields = await prisma.databaseField.findMany({
    where: { entityId: e.id },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return {
    id: e.id,
    databaseModelId: e.databaseModelId,
    name: e.name,
    description: e.description,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    fields: fields.map(serializeField),
  };
}

export function serializeField(f: DatabaseField) {
  return {
    id: f.id,
    entityId: f.entityId,
    name: f.name,
    type: f.type,
    required: f.required,
    isPrimaryKey: f.isPrimaryKey,
    isForeignKey: f.isForeignKey,
    referencesEntityId: f.referencesEntityId,
    referencesFieldId: f.referencesFieldId,
    description: f.description,
  };
}
