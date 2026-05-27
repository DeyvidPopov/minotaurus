import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type DatabaseEntityRow,
  type DatabaseFieldRow,
  type DatabaseModelRow,
  type DatabaseType,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const DATABASE_TYPES: DatabaseType[] = [
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "SQLite",
];

// ───────────────────── serializers ─────────────────────

export function serializeModel(m: DatabaseModelRow) {
  const state = db();
  const entityCount = state.databaseEntities.filter((e) => e.databaseModelId === m.id).length;
  return {
    id: m.id,
    projectId: m.projectId,
    artifactId: m.artifactId,
    title: m.title,
    databaseType: m.databaseType,
    description: m.description,
    createdBy: m.createdBy,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    entityCount,
  };
}

export function serializeEntity(e: DatabaseEntityRow) {
  const state = db();
  const fields = state.databaseFields.filter((f) => f.entityId === e.id);
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

export function serializeField(f: DatabaseFieldRow) {
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

// ───────────────────── access ─────────────────────

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

function findModelForUser(
  modelId: string,
  userId: string,
): { row: DatabaseModelRow } | { error: "not_found" | "forbidden" } {
  const row = db().databaseModels.find((m) => m.id === modelId);
  if (!row) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row };
}

function findEntityForUser(
  entityId: string,
  userId: string,
):
  | { row: DatabaseEntityRow; model: DatabaseModelRow }
  | { error: "not_found" | "forbidden" } {
  const row = db().databaseEntities.find((e) => e.id === entityId);
  if (!row) return { error: "not_found" };
  const model = db().databaseModels.find((m) => m.id === row.databaseModelId);
  if (!model) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === model.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row, model };
}

function findFieldForUser(
  fieldId: string,
  userId: string,
):
  | { row: DatabaseFieldRow; entity: DatabaseEntityRow; model: DatabaseModelRow }
  | { error: "not_found" | "forbidden" } {
  const row = db().databaseFields.find((f) => f.id === fieldId);
  if (!row) return { error: "not_found" };
  const entity = db().databaseEntities.find((e) => e.id === row.entityId);
  if (!entity) return { error: "not_found" };
  const model = db().databaseModels.find((m) => m.id === entity.databaseModelId);
  if (!model) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === model.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row, entity, model };
}

// ───────────────────── schemas ─────────────────────

const createModelSchema = z.object({
  title: z.string().min(1),
  databaseType: z.enum(DATABASE_TYPES as [DatabaseType, ...DatabaseType[]]).optional().default("PostgreSQL"),
  description: z.string().optional().default(""),
  artifactId: z.string().nullable().optional(),
});

const patchModelSchema = z.object({
  title: z.string().min(1).optional(),
  databaseType: z.enum(DATABASE_TYPES as [DatabaseType, ...DatabaseType[]]).optional(),
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

// ───────────────────── model handlers ─────────────────────

export function listModels(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { search, q, artifactId, databaseType } = req.query as Record<string, string | undefined>;
  let items = db().databaseModels.filter((m) => m.projectId === projectId);
  if (artifactId) items = items.filter((m) => m.artifactId === artifactId);
  if (databaseType) items = items.filter((m) => m.databaseType === databaseType);
  const term = (search || q || "").toLowerCase().trim();
  if (term) {
    items = items.filter(
      (m) =>
        m.title.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term),
    );
  }
  return ok(res, items.map(serializeModel), "OK");
}

export function createModel(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createModelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.artifactId) {
    const artifact = db().artifacts.find((a) => a.id === parsed.data.artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const now = new Date().toISOString();
  const row: DatabaseModelRow = {
    id: newId(),
    projectId,
    artifactId: parsed.data.artifactId ?? null,
    title: parsed.data.title,
    databaseType: parsed.data.databaseType,
    description: parsed.data.description,
    createdBy: req.user!.userId,
    createdAt: now,
    updatedAt: now,
  };
  db().databaseModels.push(row);
  persist();
  return created(res, serializeModel(row), "Database model created");
}

export function getModel(req: AuthedRequest, res: Response) {
  const result = findModelForUser(req.params.databaseModelId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, serializeModel(result.row), "OK");
}

export function patchModel(req: AuthedRequest, res: Response) {
  const parsed = patchModelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = findModelForUser(req.params.databaseModelId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;

  if (parsed.data.artifactId !== undefined && parsed.data.artifactId !== null) {
    const artifact = db().artifacts.find((a) => a.id === parsed.data.artifactId);
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  if (parsed.data.title !== undefined) row.title = parsed.data.title;
  if (parsed.data.databaseType !== undefined) row.databaseType = parsed.data.databaseType;
  if (parsed.data.description !== undefined) row.description = parsed.data.description;
  if (parsed.data.artifactId !== undefined) row.artifactId = parsed.data.artifactId;
  row.updatedAt = new Date().toISOString();
  persist();
  return ok(res, serializeModel(row), "Database model updated");
}

export function deleteModel(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.databaseModels.findIndex((m) => m.id === req.params.databaseModelId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Database model not found");
  const row = state.databaseModels[idx];
  const project = state.projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.databaseModels.splice(idx, 1);
  const entityIds = new Set(
    state.databaseEntities.filter((e) => e.databaseModelId === row.id).map((e) => e.id),
  );
  state.databaseEntities = state.databaseEntities.filter((e) => !entityIds.has(e.id));
  state.databaseFields = state.databaseFields.filter((f) => !entityIds.has(f.entityId));
  // Detach foreign-key references pointing at deleted entities.
  for (const f of state.databaseFields) {
    if (f.referencesEntityId && entityIds.has(f.referencesEntityId)) {
      f.referencesEntityId = null;
      f.isForeignKey = false;
    }
  }
  persist();
  return ok(res, null, "Database model deleted");
}

// ───────────────────── entity handlers ─────────────────────

export function listEntities(req: AuthedRequest, res: Response) {
  const result = findModelForUser(req.params.databaseModelId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const items = db().databaseEntities.filter((e) => e.databaseModelId === result.row.id);
  return ok(res, items.map(serializeEntity), "OK");
}

export function createEntity(req: AuthedRequest, res: Response) {
  const modelResult = findModelForUser(req.params.databaseModelId, req.user!.userId);
  if ("error" in modelResult) {
    return modelResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Database model not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }

  const parsed = createEntitySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const now = new Date().toISOString();
  const row: DatabaseEntityRow = {
    id: newId(),
    databaseModelId: modelResult.row.id,
    name: parsed.data.name,
    description: parsed.data.description,
    createdAt: now,
    updatedAt: now,
  };
  db().databaseEntities.push(row);
  modelResult.row.updatedAt = now;
  persist();
  return created(res, serializeEntity(row), "Entity created");
}

export function patchEntity(req: AuthedRequest, res: Response) {
  const parsed = patchEntitySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = findEntityForUser(req.params.entityId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Entity not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;
  if (parsed.data.name !== undefined) row.name = parsed.data.name;
  if (parsed.data.description !== undefined) row.description = parsed.data.description;
  row.updatedAt = new Date().toISOString();
  result.model.updatedAt = row.updatedAt;
  persist();
  return ok(res, serializeEntity(row), "Entity updated");
}

export function deleteEntity(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.databaseEntities.findIndex((e) => e.id === req.params.entityId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Entity not found");
  const row = state.databaseEntities[idx];
  const model = state.databaseModels.find((m) => m.id === row.databaseModelId);
  if (!model) return fail(res, 404, "NOT_FOUND", "Entity not found");
  const project = state.projects.find((p) => p.id === model.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.databaseEntities.splice(idx, 1);
  state.databaseFields = state.databaseFields.filter((f) => f.entityId !== row.id);
  // Detach FK references pointing at the deleted entity
  for (const f of state.databaseFields) {
    if (f.referencesEntityId === row.id) {
      f.referencesEntityId = null;
      f.isForeignKey = false;
    }
  }
  model.updatedAt = new Date().toISOString();
  persist();
  return ok(res, null, "Entity deleted");
}

// ───────────────────── field handlers ─────────────────────

export function createField(req: AuthedRequest, res: Response) {
  const entityResult = findEntityForUser(req.params.entityId, req.user!.userId);
  if ("error" in entityResult) {
    return entityResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Entity not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const parsed = createFieldSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.referencesEntityId) {
    const target = db().databaseEntities.find((e) => e.id === parsed.data.referencesEntityId);
    if (!target || target.databaseModelId !== entityResult.row.databaseModelId) {
      return fail(res, 400, "INVALID_FK", "Foreign key target must belong to the same database model");
    }
  }

  const row: DatabaseFieldRow = {
    id: newId(),
    entityId: entityResult.row.id,
    name: parsed.data.name,
    type: parsed.data.type,
    required: parsed.data.required,
    isPrimaryKey: parsed.data.isPrimaryKey,
    isForeignKey: parsed.data.isForeignKey || !!parsed.data.referencesEntityId,
    referencesEntityId: parsed.data.referencesEntityId ?? null,
    description: parsed.data.description,
  };
  db().databaseFields.push(row);
  entityResult.row.updatedAt = new Date().toISOString();
  entityResult.model.updatedAt = entityResult.row.updatedAt;
  persist();
  return created(res, serializeField(row), "Field created");
}

export function patchField(req: AuthedRequest, res: Response) {
  const parsed = patchFieldSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = findFieldForUser(req.params.fieldId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Field not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;

  if (parsed.data.referencesEntityId !== undefined && parsed.data.referencesEntityId !== null) {
    const target = db().databaseEntities.find((e) => e.id === parsed.data.referencesEntityId);
    if (!target || target.databaseModelId !== result.entity.databaseModelId) {
      return fail(res, 400, "INVALID_FK", "Foreign key target must belong to the same database model");
    }
  }

  if (parsed.data.name !== undefined) row.name = parsed.data.name;
  if (parsed.data.type !== undefined) row.type = parsed.data.type;
  if (parsed.data.required !== undefined) row.required = parsed.data.required;
  if (parsed.data.isPrimaryKey !== undefined) row.isPrimaryKey = parsed.data.isPrimaryKey;
  if (parsed.data.isForeignKey !== undefined) row.isForeignKey = parsed.data.isForeignKey;
  if (parsed.data.referencesEntityId !== undefined) {
    row.referencesEntityId = parsed.data.referencesEntityId;
    if (parsed.data.referencesEntityId) row.isForeignKey = true;
  }
  if (parsed.data.description !== undefined) row.description = parsed.data.description;

  result.entity.updatedAt = new Date().toISOString();
  result.model.updatedAt = result.entity.updatedAt;
  persist();
  return ok(res, serializeField(row), "Field updated");
}

export function deleteField(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.databaseFields.findIndex((f) => f.id === req.params.fieldId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Field not found");
  const row = state.databaseFields[idx];
  const entity = state.databaseEntities.find((e) => e.id === row.entityId);
  if (!entity) return fail(res, 404, "NOT_FOUND", "Field not found");
  const model = state.databaseModels.find((m) => m.id === entity.databaseModelId);
  if (!model) return fail(res, 404, "NOT_FOUND", "Field not found");
  const project = state.projects.find((p) => p.id === model.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.databaseFields.splice(idx, 1);
  entity.updatedAt = new Date().toISOString();
  model.updatedAt = entity.updatedAt;
  persist();
  return ok(res, null, "Field deleted");
}
