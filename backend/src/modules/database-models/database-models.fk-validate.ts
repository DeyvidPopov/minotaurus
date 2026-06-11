// FK target validation for database fields. Resolves + scopes a field's entity
// and precise-column FK targets to the SAME database model. Distinct from the
// pure name->id resolver in fk-resolve.ts: this one does Prisma lookups and
// same-model scoping, and is the create/update write-path validator.
import { prisma } from "../../lib/prisma.js";

/**
 * Validate + normalize a field's FK target against the DB-enforced model scope.
 * `referencesEntityId` is the coarse (entity) target kept for UI/ERD; the new
 * `referencesFieldId` is the precise target column (normally the referenced
 * entity's PK / a unique column). BOTH must resolve inside the SAME database model;
 * a column target must sit in the referenced entity. When only the column is given
 * the entity pointer is derived from it so the two never drift. Returns the resolved
 * pair, or an error string the caller maps to 400 INVALID_FK.
 */
export async function resolveFieldFkTargets(
  databaseModelId: string,
  refEntityId: string | null | undefined,
  refFieldId: string | null | undefined,
): Promise<{ referencesEntityId: string | null; referencesFieldId: string | null } | { error: string }> {
  let entityId = refEntityId ?? null;
  const fieldId = refFieldId ?? null;

  if (entityId) {
    const target = await prisma.databaseEntity.findUnique({ where: { id: entityId } });
    if (!target || target.databaseModelId !== databaseModelId) {
      return { error: "Foreign key target must belong to the same database model" };
    }
  }
  if (fieldId) {
    const targetField = await prisma.databaseField.findUnique({
      where: { id: fieldId },
      include: { entity: { select: { id: true, databaseModelId: true } } },
    });
    if (!targetField || targetField.entity.databaseModelId !== databaseModelId) {
      return { error: "Foreign key target column must belong to the same database model" };
    }
    if (entityId && targetField.entityId !== entityId) {
      return { error: "Foreign key target column must belong to the referenced entity" };
    }
    // Keep the coarse entity pointer consistent with the precise column.
    if (!entityId) entityId = targetField.entityId;
  }
  return { referencesEntityId: entityId, referencesFieldId: fieldId };
}
