// finding-catalog.ts — THE canonical registry of architectural finding codes.
//
// Single source of truth for each finding's identity, category, severity, title,
// why, suggested fix and navigation target. Imported by the validation presenter,
// the analysis engine, the PDF renderer and the AI review digest so a code like
// DEPENDS_ON_DEPRECATED means exactly one thing everywhere.
//
// Pure data — no IO, no deps beyond finding-types.

import { type FindingCatalogEntry, UNKNOWN_FINDING } from "./finding-types.js";

export const FINDING_CATALOG: Record<string, FindingCatalogEntry> = {
  // ── Architecture / Relationship ──
  ORPHAN_ARTIFACT: {
    code: "ORPHAN_ARTIFACT",
    category: "RELATIONSHIP",
    severity: "WARNING",
    title: "Orphaned artifact",
    why: "This artifact has no incoming or outgoing relations, so it is disconnected from the rest of the architecture graph.",
    suggestedFix: "Open the artifact and add a relation to whatever depends on it or that it depends on — or delete it if it is genuinely unused.",
    targetKind: "ARTIFACT",
  },
  DEPENDS_ON_DEPRECATED: {
    code: "DEPENDS_ON_DEPRECATED",
    category: "ARCHITECTURE",
    severity: "ERROR",
    title: "Depends on deprecated artifact",
    why: "An active artifact depends on a deprecated one, which risks breaking when the dependency is removed.",
    suggestedFix: "Migrate this artifact off the deprecated dependency, or un-deprecate the target if it is still supported.",
    targetKind: "ARTIFACT",
  },
  DEPRECATED_STILL_REFERENCED: {
    code: "DEPRECATED_STILL_REFERENCED",
    category: "ARCHITECTURE",
    severity: "WARNING",
    title: "Deprecated artifact still referenced",
    why: "A deprecated artifact is still referenced by others, so it cannot be safely removed yet.",
    suggestedFix: "Migrate the referencing artifacts off it, then delete the deprecated artifact.",
    targetKind: "ARTIFACT",
  },
  HIGH_FAN_OUT: {
    code: "HIGH_FAN_OUT",
    category: "ARCHITECTURE",
    severity: "INFO",
    title: "High fan-out",
    why: "This artifact has an unusually high number of relations, a sign it may be doing too much.",
    suggestedFix: "Consider splitting its responsibilities into smaller artifacts to reduce coupling.",
    targetKind: "ARTIFACT",
  },
  HIGH_CHURN: {
    code: "HIGH_CHURN",
    category: "ARCHITECTURE",
    severity: "INFO",
    title: "High churn",
    why: "This artifact changed many times in the last 7 days, which can indicate an unstable design.",
    suggestedFix: "Review recent changes and stabilise the interface; no immediate action is required.",
    targetKind: "ARTIFACT",
  },
  SINGLE_MEMBER_PROJECT: {
    code: "SINGLE_MEMBER_PROJECT",
    category: "ARCHITECTURE",
    severity: "INFO",
    title: "Single-member project",
    why: "The project has a single member, which reduces collaboration and review visibility.",
    suggestedFix: "Invite teammates from the Team page.",
    targetKind: "TEAM",
  },

  // ── Documentation ──
  MISSING_DOCUMENTATION: {
    code: "MISSING_DOCUMENTATION",
    category: "DOCUMENTATION",
    severity: "WARNING",
    title: "Missing documentation",
    why: "This artifact has no documentation — neither its own documentation content nor a linked documentation artifact.",
    suggestedFix: "Open the Documentation tab and write the content (or generate a draft), then Save.",
    targetKind: "ARTIFACT",
    tab: "documentation",
  },

  // ── Security ──
  SECURITY_POLICY_NOT_LINKED: {
    code: "SECURITY_POLICY_NOT_LINKED",
    category: "SECURITY",
    severity: "WARNING",
    title: "Security policy not linked",
    why: "A SECURITY_POLICY artifact does not SECURE anything, so nothing in the graph is protected by it.",
    suggestedFix: "Add a SECURES relation from this policy to the artifact(s) it protects.",
    targetKind: "ARTIFACT",
  },
  PUBLIC_SECURITY_ENDPOINT: {
    code: "PUBLIC_SECURITY_ENDPOINT",
    category: "SECURITY",
    severity: "WARNING",
    title: "Public endpoint on a security spec",
    why: "An endpoint on a security-related spec is marked public (requiresAuth=false).",
    suggestedFix: "Set requiresAuth=true on the endpoint unless it is intentionally public (e.g. an auth action).",
    targetKind: "API_SPEC",
  },
  PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD: {
    code: "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD",
    category: "SECURITY",
    severity: "WARNING",
    title: "Public endpoint exposes sensitive field",
    why: "A public, non-auth endpoint accepts a sensitive field without requiring authentication.",
    suggestedFix: "Require authentication on the endpoint, or remove the sensitive field from its public payload.",
    targetKind: "API_SPEC",
  },
  USER_SCOPED_ENDPOINT_WITHOUT_AUTH: {
    code: "USER_SCOPED_ENDPOINT_WITHOUT_AUTH",
    category: "SECURITY",
    severity: "ERROR",
    title: "User-scoped endpoint without auth",
    why: "A public endpoint operates on user-owned data but requires no authentication.",
    suggestedFix: "Set requiresAuth=true so only the owning user can access this endpoint.",
    targetKind: "API_SPEC",
  },
  RESPONSE_EXPOSES_TOKEN_OR_SECRET: {
    code: "RESPONSE_EXPOSES_TOKEN_OR_SECRET",
    category: "SECURITY",
    severity: "WARNING",
    title: "Response exposes token or secret",
    why: "A non-auth endpoint returns a credential/token field in its response.",
    suggestedFix: "Remove the credential from the response payload; only auth endpoints should return tokens.",
    targetKind: "API_SPEC",
  },

  // ── API ──
  API_SPEC_NO_ENDPOINTS: {
    code: "API_SPEC_NO_ENDPOINTS",
    category: "API",
    severity: "WARNING",
    title: "API spec has no endpoints",
    why: "This API spec defines no endpoints, so it documents nothing.",
    suggestedFix: "Add endpoints to the spec, or remove the spec if it is no longer needed.",
    targetKind: "API_SPEC",
  },
  ENDPOINT_NO_SUMMARY: {
    code: "ENDPOINT_NO_SUMMARY",
    category: "API",
    severity: "WARNING",
    title: "Endpoint has no summary",
    why: "An endpoint has no summary, so its purpose is undocumented.",
    suggestedFix: "Open the API spec and add a one-line summary to the endpoint.",
    targetKind: "API_SPEC",
  },
  API_FIELD_UNMAPPED: {
    code: "API_FIELD_UNMAPPED",
    category: "API",
    severity: "INFO",
    title: "API field unmapped",
    why: "A request/response field looks like an entity reference but maps to no database entity.",
    suggestedFix: "Add the entity/field to a database model, or rename the field if it is not actually a reference.",
    targetKind: "API_SPEC",
  },

  // ── Database ──
  DB_MODEL_NO_ENTITIES: {
    code: "DB_MODEL_NO_ENTITIES",
    category: "DATABASE",
    severity: "WARNING",
    title: "Database model has no entities",
    why: "This database model has no entities.",
    suggestedFix: "Add entities to the model, or remove the model if it is unused.",
    targetKind: "DATABASE_MODEL",
  },
  DB_ENTITY_NO_FIELDS: {
    code: "DB_ENTITY_NO_FIELDS",
    category: "DATABASE",
    severity: "WARNING",
    title: "Entity has no fields",
    why: "An entity in this model has no fields.",
    suggestedFix: "Open the model and add fields to the entity.",
    targetKind: "DATABASE_MODEL",
  },
  DB_ENTITY_NO_PK: {
    code: "DB_ENTITY_NO_PK",
    category: "DATABASE",
    severity: "WARNING",
    title: "Entity has no primary key",
    why: "An entity has no primary key, so its rows are not uniquely identifiable.",
    suggestedFix: "Mark one of the entity's fields as the primary key.",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_NO_TARGET: {
    code: "DB_FK_NO_TARGET",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key has no target",
    why: "A foreign key is declared but points at no target entity.",
    suggestedFix: "Set the referenced entity on the foreign-key field.",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_MISSING_TARGET: {
    code: "DB_FK_MISSING_TARGET",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key references a missing entity",
    why: "A foreign key references an entity that does not exist in the model.",
    suggestedFix: "Point the foreign key at an existing entity, or create the missing entity.",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_TARGET_NOT_KEY: {
    code: "DB_FK_TARGET_NOT_KEY",
    category: "DATABASE",
    severity: "WARNING",
    title: "Foreign key target is not a key",
    why: "A foreign key points at a specific column that is neither a primary key nor unique, so the reference may not resolve to a uniquely-identifying value.",
    suggestedFix: "Point the foreign key at the referenced entity's primary key (or a unique column).",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_NO_PRECISE_COLUMN: {
    code: "DB_FK_NO_PRECISE_COLUMN",
    category: "DATABASE",
    severity: "WARNING",
    title: "Foreign key has no precise column",
    why: "A foreign key references an entity but not a specific column, so the exact target column is ambiguous.",
    suggestedFix: "Set the referenced column on the foreign-key field (normally the target entity's primary key).",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_COLUMN_WITHOUT_ENTITY: {
    code: "DB_FK_COLUMN_WITHOUT_ENTITY",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key column has no entity",
    why: "A foreign key pins a specific target column but names no target entity, so the reference is incomplete.",
    suggestedFix: "Set the referenced entity (it must own the referenced column), or clear the referenced column.",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_MISSING_TARGET_COLUMN: {
    code: "DB_FK_MISSING_TARGET_COLUMN",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key references a missing column",
    why: "A foreign key references a specific column that does not exist.",
    suggestedFix: "Point the foreign key at an existing column of the referenced entity.",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_COLUMN_ENTITY_MISMATCH: {
    code: "DB_FK_COLUMN_ENTITY_MISMATCH",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key column/entity mismatch",
    why: "A foreign key's referenced column belongs to a different entity than its referenced entity, so the two pointers disagree.",
    suggestedFix: "Make the referenced column belong to the referenced entity (or fix the referenced entity).",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_CROSS_MODEL_ENTITY: {
    code: "DB_FK_CROSS_MODEL_ENTITY",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key crosses database models",
    why: "A foreign key references an entity in a different database model; foreign keys must stay within one model.",
    suggestedFix: "Reference an entity within the same database model, or move the entities into one model.",
    targetKind: "DATABASE_MODEL",
  },
  DB_FK_CROSS_MODEL_COLUMN: {
    code: "DB_FK_CROSS_MODEL_COLUMN",
    category: "DATABASE",
    severity: "ERROR",
    title: "Foreign key column crosses database models",
    why: "A foreign key's referenced column belongs to an entity in a different database model; foreign keys must stay within one model.",
    suggestedFix: "Reference a column within the same database model.",
    targetKind: "DATABASE_MODEL",
  },

  // ── Diagram ──
  DIAGRAM_EMPTY: {
    code: "DIAGRAM_EMPTY",
    category: "DIAGRAM",
    severity: "WARNING",
    title: "Diagram is empty",
    why: "This diagram has an empty Mermaid source.",
    suggestedFix: "Open the diagram and add Mermaid source, or remove the diagram.",
    targetKind: "DIAGRAM",
  },
  DIAGRAM_INVALID: {
    code: "DIAGRAM_INVALID",
    category: "DIAGRAM",
    severity: "WARNING",
    title: "Diagram may be invalid",
    why: "This diagram's Mermaid source is missing a type header and/or any relations/arrows.",
    suggestedFix: "Open the diagram and fix the Mermaid (add the diagram-type header and at least one connection).",
    targetKind: "DIAGRAM",
  },
  DIAGRAM_UNLINKED: {
    code: "DIAGRAM_UNLINKED",
    category: "DIAGRAM",
    severity: "INFO",
    title: "Diagram not linked to an artifact",
    why: "An architecture diagram is not linked to any artifact.",
    suggestedFix: "Link the diagram to the artifact it depicts.",
    targetKind: "DIAGRAM",
  },

  // ── Analysis-only findings (emitted directly by the analysis engine, NOT
  //    persisted as ValidationIssue rows and NOT produced by the message
  //    classifier — cataloged here so their identity/recommendation is consistent
  //    in PDF/AI Review). ──
  UNIMPLEMENTED_REQUIREMENT: {
    code: "UNIMPLEMENTED_REQUIREMENT",
    category: "ARCHITECTURE",
    severity: "WARNING",
    title: "Unimplemented requirement",
    why: "A REQUIREMENT artifact has no inbound IMPLEMENTS relation, so nothing is recorded as fulfilling it.",
    suggestedFix: "Link this requirement to the artifact(s) that implement it via an IMPLEMENTS relation.",
    targetKind: "ARTIFACT",
  },
  UNDOCUMENTED_SECURITY_POLICY: {
    code: "UNDOCUMENTED_SECURITY_POLICY",
    category: "SECURITY",
    severity: "ERROR",
    title: "Undocumented security policy",
    why: "A SECURITY_POLICY artifact has no documentation, so its scope and enforcement are unclear.",
    suggestedFix: "Add documentation explaining the scope, enforcement point, and affected components.",
    targetKind: "ARTIFACT",
  },
  SINGLE_OWNER: {
    code: "SINGLE_OWNER",
    category: "ARCHITECTURE",
    severity: "INFO",
    title: "Single project owner",
    why: "The project has exactly one OWNER, a continuity risk if that person is unavailable.",
    suggestedFix: "Assign at least one additional OWNER to reduce continuity risk.",
    targetKind: "TEAM",
  },
  STALE_VALIDATION: {
    code: "STALE_VALIDATION",
    category: "ARCHITECTURE",
    severity: "INFO",
    title: "Validation is stale",
    why: "No validation run happened recently, so the findings may be out of date.",
    suggestedFix: "Run validation to refresh findings for this project.",
    targetKind: "PROJECT",
  },
};

// Fallback metadata for an unclassifiable finding. Its code is UNKNOWN_FINDING,
// not a real catalog key, so `getFinding(UNKNOWN_FINDING)` is undefined.
export const FALLBACK_FINDING: FindingCatalogEntry = {
  code: UNKNOWN_FINDING,
  category: "ARCHITECTURE",
  severity: "INFO",
  title: "Validation finding",
  why: "This issue was flagged by the validation engine.",
  suggestedFix: "Open the affected resource and review it against the message above.",
  targetKind: "ARTIFACT",
};

/** Strict lookup — undefined for an unknown code. */
export function getFinding(code: string): FindingCatalogEntry | undefined {
  return FINDING_CATALOG[code];
}

/** Lookup that always returns an entry (FALLBACK_FINDING for unknown codes). */
export function getFindingOrFallback(code: string): FindingCatalogEntry {
  return FINDING_CATALOG[code] ?? FALLBACK_FINDING;
}

/** Every canonical code in the catalog. */
export const FINDING_CODES = Object.keys(FINDING_CATALOG);
