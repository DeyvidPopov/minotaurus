// database-fk-rule.ts — pure, deterministic foreign-key integrity rules for the
// validation engine. ONE place for the FK heuristics so Validation (and any future
// reader) can't drift. No IO, no clock, no randomness, no Prisma — same input gives
// a deep-equal result, so it is unit-tested directly (database-fk-rule.test.ts).
//
// Covers the full FK contract for DatabaseField:
//   • DB_FK_NO_TARGET            (ERROR)   isForeignKey but no referenced entity
//   • DB_FK_COLUMN_WITHOUT_ENTITY(ERROR)   a precise column but no referenced entity
//   • DB_FK_MISSING_TARGET       (ERROR)   referenced entity does not exist
//   • DB_FK_CROSS_MODEL_ENTITY   (ERROR)   referenced entity lives in another model
//   • DB_FK_NO_PRECISE_COLUMN    (WARNING) entity-level FK with no pinned column
//   • DB_FK_MISSING_TARGET_COLUMN(ERROR)   referencesFieldId resolves to nothing
//   • DB_FK_COLUMN_ENTITY_MISMATCH(ERROR)  pinned column is in a different entity
//   • DB_FK_CROSS_MODEL_COLUMN   (ERROR)   pinned column lives in another model
//   • DB_FK_TARGET_NOT_KEY       (WARNING) pinned column is neither PK nor UNIQUE
//
// Severities/categories are NOT decided here — the engine reads them from the
// shared finding catalog by `code`, so the catalog stays the single source of a
// finding's identity. This module only decides WHICH code fires and the message.

export interface FkRuleModel {
  id: string;
  artifactId: string | null;
}
export interface FkRuleEntity {
  id: string;
  name: string;
  databaseModelId: string;
}
export interface FkRuleField {
  id: string;
  entityId: string;
  name: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntityId: string | null;
  referencesFieldId: string | null;
  /** Free-text column notes; the SQL importer stores "UNIQUE" here. */
  description: string;
}

export interface FkRuleFinding {
  code: string;
  /** The DatabaseModel the finding is about (the engine maps it to the subject). */
  modelId: string;
  message: string;
}

/** A column is "key-like" (a valid FK target) when it is a primary key or the
 *  importer/editor marked it UNIQUE (stored in the description). */
function isKeyLike(field: FkRuleField): boolean {
  return field.isPrimaryKey || /\bunique\b/i.test(field.description ?? "");
}

/**
 * Compute every foreign-key integrity finding across a project's database models.
 * `entities`/`fields` are the FULL project sets (across all models) so cross-model
 * references can be detected. Returns findings in field-input order (deterministic).
 */
export function analyzeForeignKeyFindings(input: {
  models: ReadonlyArray<FkRuleModel>;
  entities: ReadonlyArray<FkRuleEntity>;
  fields: ReadonlyArray<FkRuleField>;
}): FkRuleFinding[] {
  const entityById = new Map(input.entities.map((e) => [e.id, e]));
  const fieldById = new Map(input.fields.map((f) => [f.id, f]));
  const findings: FkRuleFinding[] = [];

  for (const field of input.fields) {
    const entity = entityById.get(field.entityId);
    if (!entity) continue; // orphan field (no entity) — not an FK concern
    const thisModelId = entity.databaseModelId;
    const refEntityId = field.referencesEntityId;
    const refFieldId = field.referencesFieldId;

    const isFk = field.isForeignKey || !!refEntityId || !!refFieldId;
    if (!isFk) continue;

    const fk = `Foreign key "${entity.name}.${field.name}"`;
    const push = (code: string, message: string) => findings.push({ code, modelId: thisModelId, message });

    // ── entity side ──
    if (!refEntityId) {
      if (refFieldId) {
        push("DB_FK_COLUMN_WITHOUT_ENTITY", `${fk} has a referenced column but no referenced entity.`);
      } else {
        push("DB_FK_NO_TARGET", `${fk} has no target entity.`);
      }
      continue;
    }
    const refEntity = entityById.get(refEntityId);
    if (!refEntity) {
      push("DB_FK_MISSING_TARGET", `${fk} references a missing entity.`);
      continue;
    }
    if (refEntity.databaseModelId !== thisModelId) {
      push("DB_FK_CROSS_MODEL_ENTITY", `${fk} references an entity in a different database model.`);
      continue;
    }

    // ── column side (referenced entity exists and is in the same model) ──
    if (!refFieldId) {
      push("DB_FK_NO_PRECISE_COLUMN", `${fk} references entity "${refEntity.name}" but no specific referenced column.`);
      continue;
    }
    const targetField = fieldById.get(refFieldId);
    if (!targetField) {
      push("DB_FK_MISSING_TARGET_COLUMN", `${fk} references a missing column.`);
      continue;
    }
    if (targetField.entityId !== refEntityId) {
      const targetFieldEntity = entityById.get(targetField.entityId);
      if (targetFieldEntity && targetFieldEntity.databaseModelId !== thisModelId) {
        push("DB_FK_CROSS_MODEL_COLUMN", `${fk} references a column in a different database model.`);
      } else {
        push("DB_FK_COLUMN_ENTITY_MISMATCH", `${fk} references a column outside its referenced entity.`);
      }
      continue;
    }
    // Pinned column is in the referenced entity (same model). Advisory: it should
    // normally be a primary key or a unique column.
    if (!isKeyLike(targetField)) {
      push("DB_FK_TARGET_NOT_KEY", `${fk} references a non-key column "${refEntity.name}.${targetField.name}".`);
    }
  }

  return findings;
}
