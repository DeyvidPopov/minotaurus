import type { Response } from "express";
import { z } from "zod";
import { DatabaseType, ProjectRole, type DatabaseEntity, type DatabaseField, type DatabaseModel } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

const DATABASE_TYPES = Object.values(DatabaseType) as [DatabaseType, ...DatabaseType[]];

async function serializeModel(m: DatabaseModel) {
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

async function serializeEntity(e: DatabaseEntity) {
  const fields = await prisma.databaseField.findMany({ where: { entityId: e.id } });
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

function serializeField(f: DatabaseField) {
  return {
    id: f.id,
    entityId: f.entityId,
    name: f.name,
    type: f.type,
    required: f.required,
    isPrimaryKey: f.isPrimaryKey,
    isForeignKey: f.isForeignKey,
    referencesEntityId: f.referencesEntityId,
    description: f.description,
  };
}

async function projectAccess(projectId: string, userId: string, minRole: ProjectRole = "VIEWER"): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await getProjectAccess(projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

async function findModelForUser(modelId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.databaseModel.findUnique({ where: { id: modelId } });
  if (!row) return { error: "not_found" as const };
  const a = await getProjectAccess(row.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row };
}

async function findEntityForUser(entityId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.databaseEntity.findUnique({ where: { id: entityId } });
  if (!row) return { error: "not_found" as const };
  const model = await prisma.databaseModel.findUnique({ where: { id: row.databaseModelId } });
  if (!model) return { error: "not_found" as const };
  const a = await getProjectAccess(model.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row, model };
}

async function findFieldForUser(fieldId: string, userId: string, minRole: ProjectRole = "VIEWER") {
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
  description: z.string().optional().default(""),
});

const patchFieldSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  required: z.boolean().optional(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  referencesEntityId: z.string().nullable().optional(),
  description: z.string().optional(),
});

export async function listModels(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { search, q, artifactId, databaseType } = req.query as Record<string, string | undefined>;
  const items = await prisma.databaseModel.findMany({
    where: {
      projectId,
      ...(artifactId ? { artifactId } : {}),
      ...(databaseType ? { databaseType: databaseType as DatabaseType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const term = (search || q || "").toLowerCase().trim();
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
  const access = await projectAccess(projectId, req.user!.userId, "DEVELOPER");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, await serializeModel(result.row), "OK");
}

export async function patchModel(req: AuthedRequest, res: Response) {
  const parsed = patchModelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findModelForUser(req.params.databaseModelId, req.user!.userId, "DEVELOPER");
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const entities = await prisma.databaseEntity.findMany({
    where: { databaseModelId: result.row.id },
    orderBy: { createdAt: "asc" },
  });
  const serialized = await Promise.all(entities.map((e) => serializeEntity(e)));
  return ok(res, serialized, "OK");
}

export async function createEntity(req: AuthedRequest, res: Response) {
  const modelResult = await findModelForUser(req.params.databaseModelId, req.user!.userId, "DEVELOPER");
  if ("error" in modelResult) {
    return modelResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const parsed = createEntitySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const row = await prisma.databaseEntity.create({
    data: {
      databaseModelId: modelResult.row.id,
      name: parsed.data.name,
      description: parsed.data.description,
    },
  });
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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Entity not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const updated = await prisma.databaseEntity.update({
    where: { id: result.row.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
  });
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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Entity not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
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
  if ("error" in entityResult) {
    return entityResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Entity not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const parsed = createFieldSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.referencesEntityId) {
    const target = await prisma.databaseEntity.findUnique({
      where: { id: parsed.data.referencesEntityId },
    });
    if (!target || target.databaseModelId !== entityResult.row.databaseModelId) {
      return fail(res, 400, "INVALID_FK", "Foreign key target must belong to the same database model");
    }
  }

  const row = await prisma.databaseField.create({
    data: {
      entityId: entityResult.row.id,
      name: parsed.data.name,
      type: parsed.data.type,
      required: parsed.data.required,
      isPrimaryKey: parsed.data.isPrimaryKey,
      isForeignKey: parsed.data.isForeignKey || !!parsed.data.referencesEntityId,
      referencesEntityId: parsed.data.referencesEntityId ?? null,
      description: parsed.data.description,
    },
  });
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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Field not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }

  if (parsed.data.referencesEntityId !== undefined && parsed.data.referencesEntityId !== null) {
    const target = await prisma.databaseEntity.findUnique({
      where: { id: parsed.data.referencesEntityId },
    });
    if (!target || target.databaseModelId !== result.entity.databaseModelId) {
      return fail(res, 400, "INVALID_FK", "Foreign key target must belong to the same database model");
    }
  }

  const updated = await prisma.databaseField.update({
    where: { id: result.row.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.required !== undefined ? { required: parsed.data.required } : {}),
      ...(parsed.data.isPrimaryKey !== undefined
        ? { isPrimaryKey: parsed.data.isPrimaryKey }
        : {}),
      ...(parsed.data.isForeignKey !== undefined
        ? { isForeignKey: parsed.data.isForeignKey }
        : {}),
      ...(parsed.data.referencesEntityId !== undefined
        ? {
            referencesEntityId: parsed.data.referencesEntityId,
            ...(parsed.data.referencesEntityId ? { isForeignKey: true } : {}),
          }
        : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
  });
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
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Field not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
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
