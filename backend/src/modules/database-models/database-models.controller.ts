import type { Response } from "express";
import { z } from "zod";
import { DatabaseType, Prisma, type DatabaseEntity, type DatabaseField } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok, respondAccessError, respondProjectAccessDenied } from "../../utils/response.js";
import { normalizeSearchTerm } from "../../utils/list-filter.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { projectAccessStatus } from "../../lib/project-access.js";
import { serializeEntity, serializeField, serializeModel } from "./database-models.serializers.js";
import { findEntityForUser, findFieldForUser, findModelForUser } from "./database-models.access.js";
import { resolveFieldFkTargets } from "./database-models.fk-validate.js";
import { isUniqueViolation } from "../../utils/prisma-errors.js";

const DATABASE_TYPES = Object.values(DatabaseType) as [DatabaseType, ...DatabaseType[]];

const createModelSchema = z.object({
  title: z.string().min(1),
  databaseType: z.enum(DATABASE_TYPES).optional().default("PostgreSQL"),
  description: z.string().optional().default(""),
  artifactId: z.string().nullable().optional(),
});

const patchModelSchema = z.object({
  title: z.string().min(1).optional(),
  databaseType: z.enum(DATABASE_TYPES).optional(),
  description: z.string().optional(),
  artifactId: z.string().nullable().optional(),
});

const createEntitySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
});

const patchEntitySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const createFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).optional().default("text"),
  required: z.boolean().optional().default(false),
  isPrimaryKey: z.boolean().optional().default(false),
  isForeignKey: z.boolean().optional().default(false),
  referencesEntityId: z.string().nullable().optional(),
  referencesFieldId: z.string().nullable().optional(),
  description: z.string().optional().default(""),
});

const patchFieldSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  required: z.boolean().optional(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  referencesEntityId: z.string().nullable().optional(),
  referencesFieldId: z.string().nullable().optional(),
  description: z.string().optional(),
});

const reorderFieldsSchema = z.object({
  // The full, new left-to-right order of this entity's field ids.
  fieldIds: z.array(z.string().min(1)).min(1),
});

export async function listModels(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccessStatus(projectId, req.user!.userId);
  if (respondProjectAccessDenied(res, access)) return;

  const { search, q, artifactId, databaseType } = req.query as Record<string, string | undefined>;
  const items = await prisma.databaseModel.findMany({
    where: {
      projectId,
      ...(artifactId ? { artifactId } : {}),
      ...(databaseType ? { databaseType: databaseType as DatabaseType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const term = normalizeSearchTerm(search, q);
  const filtered = term
    ? items.filter(
        (m) =>
          m.title.toLowerCase().includes(term) ||
          m.description.toLowerCase().includes(term),
      )
    : items;
  const serialized = await Promise.all(filtered.map((m) => serializeModel(m)));
  return ok(res, serialized, "OK");
}

export async function createModel(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccessStatus(projectId, req.user!.userId, "DEVELOPER");
  if (respondProjectAccessDenied(res, access)) return;

  const parsed = createModelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({
      where: { id: parsed.data.artifactId },
    });
    if (!artifact || artifact.projectId !== projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const row = await prisma.databaseModel.create({
    data: {
      projectId,
      artifactId: parsed.data.artifactId ?? null,
      title: parsed.data.title,
      databaseType: parsed.data.databaseType,
      description: parsed.data.description,
      createdById: req.user!.userId,
    },
  });
  await recordVersionEvent({
    projectId,
    entityType: "DATABASE_MODEL",
    entityId: row.id,
    action: "CREATED",
    title: row.title,
    description: row.databaseType,
    triggeredBy: req.user!.userId,
    metadata: { databaseType: row.databaseType },
  });
  return created(res, await serializeModel(row), "Database model created");
}

export async function getModel(req: AuthedRequest, res: Response) {
  const result = await findModelForUser(req.params.databaseModelId, req.user!.userId);
  if ("error" in result) return respondAccessError(res, result.error, "Database model not found");
  return ok(res, await serializeModel(result.row), "OK");
}

export async function patchModel(req: AuthedRequest, res: Response) {
  const parsed = patchModelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findModelForUser(req.params.databaseModelId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Database model not found");
  const row = result.row;

  if (parsed.data.artifactId !== undefined && parsed.data.artifactId !== null) {
    const artifact = await prisma.artifact.findUnique({
      where: { id: parsed.data.artifactId },
    });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const updated = await prisma.databaseModel.update({
    where: { id: row.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.databaseType !== undefined ? { databaseType: parsed.data.databaseType } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.artifactId !== undefined ? { artifactId: parsed.data.artifactId } : {}),
    },
  });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DATABASE_MODEL",
    entityId: row.id,
    action: "UPDATED",
    title: updated.title,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { changed: Object.keys(parsed.data) },
  });
  return ok(res, await serializeModel(updated), "Database model updated");
}

export async function deleteModel(req: AuthedRequest, res: Response) {
  const result = await findModelForUser(req.params.databaseModelId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Database model not found");
  const row = result.row;
  await prisma.databaseModel.delete({ where: { id: row.id } });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DATABASE_MODEL",
    entityId: row.id,
    action: "DELETED",
    title: row.title,
    description: "Database model removed",
    triggeredBy: req.user!.userId,
  });
  return ok(res, null, "Database model deleted");
}

export async function listEntities(req: AuthedRequest, res: Response) {
  const result = await findModelForUser(req.params.databaseModelId, req.user!.userId);
  if ("error" in result) return respondAccessError(res, result.error, "Database model not found");
  const entities = await prisma.databaseEntity.findMany({
    where: { databaseModelId: result.row.id },
    orderBy: { createdAt: "asc" },
  });
  const serialized = await Promise.all(entities.map((e) => serializeEntity(e)));
  return ok(res, serialized, "OK");
}

export async function createEntity(req: AuthedRequest, res: Response) {
  const modelResult = await findModelForUser(req.params.databaseModelId, req.user!.userId, "DEVELOPER");
  if ("error" in modelResult) return respondAccessError(res, modelResult.error, "Database model not found");
  const parsed = createEntitySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  let row: DatabaseEntity;
  try {
    row = await prisma.databaseEntity.create({
      data: {
        databaseModelId: modelResult.row.id,
        name: parsed.data.name,
        description: parsed.data.description,
      },
    });
  } catch (err) {
    // DB-enforced @@unique([databaseModelId, name]) — clean 409, race-safe.
    if (isUniqueViolation(err)) return fail(res, 409, "ENTITY_NAME_TAKEN", `An entity named "${parsed.data.name}" already exists in this model.`);
    throw err;
  }
  await prisma.databaseModel.update({
    where: { id: modelResult.row.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: modelResult.row.projectId,
    entityType: "DATABASE_ENTITY",
    entityId: row.id,
    action: "CREATED",
    title: row.name,
    description: `Added to "${modelResult.row.title}"`,
    triggeredBy: req.user!.userId,
    metadata: { databaseModelId: modelResult.row.id },
  });
  return created(res, await serializeEntity(row), "Entity created");
}

export async function patchEntity(req: AuthedRequest, res: Response) {
  const parsed = patchEntitySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findEntityForUser(req.params.entityId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Entity not found");
  let updated: DatabaseEntity;
  try {
    updated = await prisma.databaseEntity.update({
      where: { id: result.row.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail(res, 409, "ENTITY_NAME_TAKEN", `An entity named "${parsed.data.name}" already exists in this model.`);
    throw err;
  }
  await prisma.databaseModel.update({
    where: { id: result.model.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: result.model.projectId,
    entityType: "DATABASE_ENTITY",
    entityId: updated.id,
    action: "UPDATED",
    title: updated.name,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { databaseModelId: result.model.id, changed: Object.keys(parsed.data) },
  });
  return ok(res, await serializeEntity(updated), "Entity updated");
}

export async function deleteEntity(req: AuthedRequest, res: Response) {
  const result = await findEntityForUser(req.params.entityId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Entity not found");
  await prisma.databaseEntity.delete({ where: { id: result.row.id } });
  await prisma.databaseModel.update({
    where: { id: result.model.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: result.model.projectId,
    entityType: "DATABASE_ENTITY",
    entityId: result.row.id,
    action: "DELETED",
    title: result.row.name,
    description: `Removed from "${result.model.title}"`,
    triggeredBy: req.user!.userId,
    metadata: { databaseModelId: result.model.id },
  });
  return ok(res, null, "Entity deleted");
}

export async function createField(req: AuthedRequest, res: Response) {
  const entityResult = await findEntityForUser(req.params.entityId, req.user!.userId, "DEVELOPER");
  if ("error" in entityResult) return respondAccessError(res, entityResult.error, "Entity not found");
  const parsed = createFieldSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const fk = await resolveFieldFkTargets(
    entityResult.row.databaseModelId,
    parsed.data.referencesEntityId,
    parsed.data.referencesFieldId,
  );
  if ("error" in fk) return fail(res, 400, "INVALID_FK", fk.error);

  // Append the new field after existing ones (max position + 1).
  const positionAgg = await prisma.databaseField.aggregate({
    where: { entityId: entityResult.row.id },
    _max: { position: true },
  });
  const nextPosition = (positionAgg._max.position ?? -1) + 1;

  let row: DatabaseField;
  try {
    row = await prisma.databaseField.create({
      data: {
        entityId: entityResult.row.id,
        name: parsed.data.name,
        type: parsed.data.type,
        required: parsed.data.required,
        isPrimaryKey: parsed.data.isPrimaryKey,
        isForeignKey: parsed.data.isForeignKey || !!fk.referencesEntityId || !!fk.referencesFieldId,
        referencesEntityId: fk.referencesEntityId,
        referencesFieldId: fk.referencesFieldId,
        description: parsed.data.description,
        position: nextPosition,
      },
    });
  } catch (err) {
    // DB-enforced @@unique([entityId, name]) — clean 409, race-safe.
    if (isUniqueViolation(err)) return fail(res, 409, "FIELD_NAME_TAKEN", `A field named "${parsed.data.name}" already exists in this entity.`);
    throw err;
  }
  await prisma.databaseEntity.update({
    where: { id: entityResult.row.id },
    data: { updatedAt: new Date() },
  });
  await prisma.databaseModel.update({
    where: { id: entityResult.model.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: entityResult.model.projectId,
    entityType: "DATABASE_FIELD",
    entityId: row.id,
    action: "CREATED",
    title: `${entityResult.row.name}.${row.name}`,
    description: `${row.type}${row.isPrimaryKey ? " · PK" : ""}${row.isForeignKey ? " · FK" : ""}`,
    triggeredBy: req.user!.userId,
    metadata: { entityId: entityResult.row.id, databaseModelId: entityResult.model.id },
  });
  return created(res, serializeField(row), "Field created");
}

export async function patchField(req: AuthedRequest, res: Response) {
  const parsed = patchFieldSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findFieldForUser(req.params.fieldId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Field not found");

  // Resolve + validate the FK target (entity + precise column) only when the patch
  // touches either pointer. An absent value falls back to the existing row so the
  // two stay consistent (and a column target stays inside its referenced entity).
  let fkData: Prisma.DatabaseFieldUncheckedUpdateInput = {};
  if (parsed.data.referencesEntityId !== undefined || parsed.data.referencesFieldId !== undefined) {
    const refEntityId =
      parsed.data.referencesEntityId !== undefined ? parsed.data.referencesEntityId : result.row.referencesEntityId;
    const refFieldId =
      parsed.data.referencesFieldId !== undefined ? parsed.data.referencesFieldId : result.row.referencesFieldId;
    const fk = await resolveFieldFkTargets(result.entity.databaseModelId, refEntityId, refFieldId);
    if ("error" in fk) return fail(res, 400, "INVALID_FK", fk.error);
    fkData = {
      referencesEntityId: fk.referencesEntityId,
      referencesFieldId: fk.referencesFieldId,
      // Setting any FK target implies the column is a foreign key.
      ...(fk.referencesEntityId || fk.referencesFieldId ? { isForeignKey: true } : {}),
    };
  }

  let updated: DatabaseField;
  try {
    updated = await prisma.databaseField.update({
      where: { id: result.row.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
        ...(parsed.data.required !== undefined ? { required: parsed.data.required } : {}),
        ...(parsed.data.isPrimaryKey !== undefined ? { isPrimaryKey: parsed.data.isPrimaryKey } : {}),
        ...(parsed.data.isForeignKey !== undefined ? { isForeignKey: parsed.data.isForeignKey } : {}),
        ...fkData,
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail(res, 409, "FIELD_NAME_TAKEN", `A field named "${parsed.data.name}" already exists in this entity.`);
    throw err;
  }
  await prisma.databaseEntity.update({
    where: { id: result.entity.id },
    data: { updatedAt: new Date() },
  });
  await prisma.databaseModel.update({
    where: { id: result.model.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: result.model.projectId,
    entityType: "DATABASE_FIELD",
    entityId: updated.id,
    action: "UPDATED",
    title: `${result.entity.name}.${updated.name}`,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: {
      entityId: result.entity.id,
      databaseModelId: result.model.id,
      changed: Object.keys(parsed.data),
    },
  });
  return ok(res, serializeField(updated), "Field updated");
}

export async function deleteField(req: AuthedRequest, res: Response) {
  const result = await findFieldForUser(req.params.fieldId, req.user!.userId, "DEVELOPER");
  if ("error" in result) return respondAccessError(res, result.error, "Field not found");
  await prisma.databaseField.delete({ where: { id: result.row.id } });
  await prisma.databaseEntity.update({
    where: { id: result.entity.id },
    data: { updatedAt: new Date() },
  });
  await prisma.databaseModel.update({
    where: { id: result.model.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: result.model.projectId,
    entityType: "DATABASE_FIELD",
    entityId: result.row.id,
    action: "DELETED",
    title: `${result.entity.name}.${result.row.name}`,
    description: `Removed from "${result.model.title}"`,
    triggeredBy: req.user!.userId,
    metadata: { entityId: result.entity.id, databaseModelId: result.model.id },
  });
  return ok(res, null, "Field deleted");
}

export async function reorderFields(req: AuthedRequest, res: Response) {
  const entityResult = await findEntityForUser(req.params.entityId, req.user!.userId, "DEVELOPER");
  if ("error" in entityResult) return respondAccessError(res, entityResult.error, "Entity not found");
  const parsed = reorderFieldsSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const existing = await prisma.databaseField.findMany({
    where: { entityId: entityResult.row.id },
    select: { id: true },
  });
  const requested = parsed.data.fieldIds;
  const requestedSet = new Set(requested);
  const existingIds = new Set(existing.map((f) => f.id));
  // The payload must be an exact permutation of this entity's fields — no missing,
  // extra, duplicate, or foreign ids — so a stale/partial client can't corrupt order.
  const isExactPermutation =
    requested.length === existing.length &&
    requestedSet.size === requested.length &&
    requested.every((id) => existingIds.has(id));
  if (!isExactPermutation) {
    return fail(res, 400, "INVALID_REORDER", "fieldIds must list exactly this entity's fields, each once.");
  }

  await prisma.$transaction(
    requested.map((id, index) =>
      prisma.databaseField.update({ where: { id }, data: { position: index } }),
    ),
  );
  await prisma.databaseEntity.update({
    where: { id: entityResult.row.id },
    data: { updatedAt: new Date() },
  });
  await prisma.databaseModel.update({
    where: { id: entityResult.model.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: entityResult.model.projectId,
    entityType: "DATABASE_ENTITY",
    entityId: entityResult.row.id,
    action: "UPDATED",
    title: entityResult.row.name,
    description: "Reordered fields",
    triggeredBy: req.user!.userId,
    metadata: { databaseModelId: entityResult.model.id, reorderedFields: true },
  });

  const fields = await prisma.databaseField.findMany({
    where: { entityId: entityResult.row.id },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return ok(res, fields.map(serializeField), "Fields reordered");
}
