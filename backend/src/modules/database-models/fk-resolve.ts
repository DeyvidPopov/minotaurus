// fk-resolve.ts — the SINGLE deterministic resolver for a foreign key's PRECISE
// target column (DatabaseField.referencesFieldId), shared by SQL ingestion confirm
// and AI bootstrap apply so the heuristic can never drift between the two.
//
// Pure & deterministic: no IO, no clock, no randomness, no Prisma. Given the same
// inputs it returns a deep-equal result. The caller owns persistence — this only
// decides WHICH column id (if any) a foreign key should point at.
//
// Resolution order (matches the spec):
//   1. Explicit referenced-column name → match a field of the target entity by
//      case-insensitive name.
//   2. No name given → fall back to the target entity's primary key, but ONLY when
//      there is exactly one PK (unambiguous).
//   3. Otherwise leave it unresolved (fieldId = null) — the caller keeps
//      referencesFieldId NULL and the deterministic validation engine surfaces a
//      "no precise column" warning. Never throws, never guesses ambiguously.

/** The shape the resolver needs for each candidate column of the target entity. */
export interface FkTargetField {
  id: string;
  name: string;
  isPrimaryKey: boolean;
}

/** Why the resolver returned the id it did (or why it couldn't) — used by tests
 *  and callers that want to log/surface the precision gap. */
export type FkResolveReason =
  | "BY_NAME" // matched the explicit referenced-column name
  | "PK_FALLBACK" // no name given; the target entity has exactly one primary key
  | "NAME_NOT_FOUND" // a name was given but no column of the target entity matches it
  | "AMBIGUOUS_PK" // no name given and the target entity has multiple primary keys
  | "NO_PK" // no name given and the target entity has no primary key
  | "NO_TARGET"; // the target entity has no columns / was not resolved

export interface FkResolveResult {
  /** The resolved precise target column id, or null when it cannot be pinned. */
  fieldId: string | null;
  reason: FkResolveReason;
}

/** Case/space-insensitive field-name key. Field names have no internal spaces by
 *  convention, so a simple trim+lowercase is enough (and matches what the DB
 *  unique index compares case-sensitively — we are deliberately MORE lenient here
 *  so `User_Id` resolves to `user_id`). */
export function normalizeFieldName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/**
 * Resolve a foreign key's precise target column.
 *
 * @param refFieldName  the referenced column name, when known (SQL `REFERENCES
 *                      table(col)`, or an AI `referencesFieldName`). Empty/undefined
 *                      means "not specified" → PK fallback is attempted.
 * @param targetFields  every column of the RESOLVED target entity (id + name + PK
 *                      flag). Null/empty means the target entity wasn't resolved.
 */
export function resolvePreciseFkFieldId(
  refFieldName: string | null | undefined,
  targetFields: ReadonlyArray<FkTargetField> | null | undefined,
): FkResolveResult {
  if (!targetFields || targetFields.length === 0) {
    return { fieldId: null, reason: "NO_TARGET" };
  }

  const wanted = (refFieldName ?? "").trim();
  if (wanted) {
    const norm = normalizeFieldName(wanted);
    const match = targetFields.find((f) => normalizeFieldName(f.name) === norm);
    return match
      ? { fieldId: match.id, reason: "BY_NAME" }
      : { fieldId: null, reason: "NAME_NOT_FOUND" };
  }

  const pks = targetFields.filter((f) => f.isPrimaryKey);
  if (pks.length === 1) return { fieldId: pks[0].id, reason: "PK_FALLBACK" };
  if (pks.length > 1) return { fieldId: null, reason: "AMBIGUOUS_PK" };
  return { fieldId: null, reason: "NO_PK" };
}
