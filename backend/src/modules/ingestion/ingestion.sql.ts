// SQL schema ingestion: parse a CREATE TABLE script into an entity/field preview,
// then confirm it into a DatabaseModel. Confirm runs a two-pass transaction —
// pass 1 creates every entity + column, pass 2 resolves FK targets (entity +
// precise column) so forward references (a table declared later) still resolve.
import type { Response } from "express";
import { z } from "zod";
import { DatabaseType, IngestionSourceType, IngestionStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { SqlParseError, parseSqlSchema, type SqlSchemaPreview } from "./sql.engine.js";
import { resolvePreciseFkFieldId } from "../database-models/fk-resolve.js";
import { INCLUDE_USER, loadIngestionForMutation, serializeRecord } from "./ingestion.shared.js";

const DATABASE_TYPES = Object.values(DatabaseType) as [DatabaseType, ...DatabaseType[]];

const parseSqlSchemaSchema = z.object({
  sql: z.string().min(1, "sql is required"),
});

const confirmSqlSchemaSchema = z.object({
  mode: z.literal("CREATE_DATABASE_MODEL"),
  artifactId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(160),
  databaseType: z.enum(DATABASE_TYPES),
});

export async function parseSqlSchemaEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.SQL_SCHEMA) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Parser does not support ${row.sourceType}`);
  }
  if (row.status === IngestionStatus.CONFIRMED) {
    return fail(res, 400, "ALREADY_CONFIRMED", "Ingestion record is already confirmed");
  }

  const parsed = parseSqlSchemaSchema.safeParse(req.body);
  if (!parsed.success) {
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: parsed.error.message },
    });
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }

  let preview: SqlSchemaPreview;
  try {
    preview = parseSqlSchema(parsed.data.sql);
  } catch (err) {
    const message =
      err instanceof SqlParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "SQL parse failed";
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: message },
    });
    return fail(res, 422, "PARSE_FAILED", message);
  }

  // Stash the original SQL alongside the parsed preview so the confirm step
  // (and the detail modal) can show it without a second upload.
  const stored = { ...preview, rawSql: parsed.data.sql };
  const nextTitle = row.title && row.title.trim() ? row.title : preview.title;
  const updated = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.PARSED,
      title: nextTitle,
      parserResult: stored as unknown as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "UPDATED",
    title: `SQL schema parsed · ${preview.entityCount} entities`,
    description: `${preview.fieldCount} fields · ${preview.relationships.length} relationships`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      entityCount: preview.entityCount,
      fieldCount: preview.fieldCount,
      relationshipCount: preview.relationships.length,
    },
  });

  return ok(res, { record: serializeRecord(updated), preview }, "SQL schema parsed");
}

export async function confirmSqlSchemaEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.SQL_SCHEMA) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Confirm does not support ${row.sourceType}`);
  }
  if (row.status !== IngestionStatus.PARSED) {
    return fail(res, 400, "NOT_PARSED", "Run parse-sql-schema before confirming");
  }
  const stored = row.parserResult as Partial<SqlSchemaPreview> | null;
  if (!stored || stored.source !== "SQL_SCHEMA" || !Array.isArray(stored.entities)) {
    return fail(res, 400, "EMPTY_PARSE", "Parser result is missing or malformed");
  }

  const parsed = confirmSqlSchemaSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  let linkedArtifactId: string | null = null;
  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({ where: { id: parsed.data.artifactId } });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to this project");
    }
    linkedArtifactId = artifact.id;
  }

  const result = await prisma.$transaction(async (tx) => {
    const model = await tx.databaseModel.create({
      data: {
        projectId: row.projectId,
        artifactId: linkedArtifactId,
        title: parsed.data.title.trim() || stored.title || "Imported Database Schema",
        databaseType: parsed.data.databaseType,
        description: `Imported via ingestion · ${stored.entities!.length} entities`,
        createdById: req.user!.userId,
      },
    });
    // First pass: create entities + their columns with NO field references.
    const entityIds = new Map<string, string>();
    // Per-entity created columns (id + name + PK flag), keyed by the source entity
    // name — pass 2 uses this to resolve a FK's PRECISE target column.
    const fieldsByEntityName = new Map<string, { id: string; name: string; isPrimaryKey: boolean }[]>();
    const created: { entityId: string; fields: { id: string; name: string }[] }[] = [];
    for (const e of stored.entities!) {
      const ent = await tx.databaseEntity.create({
        data: {
          databaseModelId: model.id,
          name: e.name,
          description: e.description ?? "",
        },
      });
      entityIds.set(e.name, ent.id);
      const createdFields: { id: string; name: string }[] = [];
      const fieldMeta: { id: string; name: string; isPrimaryKey: boolean }[] = [];
      let fieldPosition = 0;
      for (const f of e.fields ?? []) {
        const field = await tx.databaseField.create({
          data: {
            entityId: ent.id,
            name: f.name,
            type: f.type || "text",
            required: !!f.required,
            isPrimaryKey: !!f.isPrimaryKey,
            isForeignKey: !!f.isForeignKey,
            description: f.description ?? "",
            // referencesEntityId / referencesFieldId left null in pass 1; pass 2 resolves them.
            position: fieldPosition++, // preserve the declared column order from the SQL
          },
        });
        createdFields.push({ id: field.id, name: field.name });
        fieldMeta.push({ id: field.id, name: field.name, isPrimaryKey: !!f.isPrimaryKey });
      }
      fieldsByEntityName.set(e.name, fieldMeta);
      created.push({ entityId: ent.id, fields: createdFields });
    }
    // Second pass: resolve each FK's referencesEntityId AND the precise
    // referencesFieldId. Because EVERY entity + column already exists, a forward
    // reference (referenced table declared later in the SQL) resolves correctly.
    // The precise column is matched by the parsed `REFERENCES table(col)` name, with
    // a single-PK fallback; if neither resolves the import still succeeds with
    // referencesFieldId NULL and the validation engine surfaces a warning later.
    for (let i = 0; i < stored.entities!.length; i++) {
      const e = stored.entities![i];
      for (const f of e.fields ?? []) {
        if (!f.isForeignKey || !f.referencesEntity) continue;
        const targetEntityId = entityIds.get(f.referencesEntity);
        if (!targetEntityId) continue;
        const dbField = created[i].fields.find((cf) => cf.name === f.name);
        if (!dbField) continue;
        const { fieldId } = resolvePreciseFkFieldId(
          f.referencesField,
          fieldsByEntityName.get(f.referencesEntity),
        );
        await tx.databaseField.update({
          where: { id: dbField.id },
          data: {
            referencesEntityId: targetEntityId,
            ...(fieldId ? { referencesFieldId: fieldId } : {}),
          },
        });
      }
    }
    return { model, created };
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DATABASE_MODEL",
    entityId: result.model.id,
    action: "CREATED",
    title: `${result.model.title} (imported)`,
    description: `${result.created.length} entities · ${stored.fieldCount ?? 0} fields`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      databaseType: result.model.databaseType,
      linkedArtifactId,
    },
  });
  for (const c of result.created) {
    await recordVersionEvent({
      projectId: row.projectId,
      entityType: "DATABASE_ENTITY",
      entityId: c.entityId,
      action: "CREATED",
      title: stored.entities!.find((_, i) => result.created[i].entityId === c.entityId)?.name || "entity",
      description: `Added to ${result.model.title}`,
      triggeredBy: req.user!.userId,
      metadata: { databaseModelId: result.model.id, ingestionId: row.id },
    });
  }

  const createdRecords = [
    { type: "DATABASE_MODEL" as const, id: result.model.id, mode: "CREATE_DATABASE_MODEL" as const },
    ...result.created.map((c) => ({ type: "DATABASE_ENTITY" as const, id: c.entityId })),
    ...result.created.flatMap((c) => c.fields.map((f) => ({ type: "DATABASE_FIELD" as const, id: f.id }))),
  ];

  const updatedRecord = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.CONFIRMED,
      createdRecords: createdRecords as unknown as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  return ok(
    res,
    {
      record: serializeRecord(updatedRecord),
      databaseModel: {
        id: result.model.id,
        title: result.model.title,
        databaseType: result.model.databaseType,
        entityCount: result.created.length,
        linkedArtifactId,
      },
    },
    "SQL schema imported",
  );
}
