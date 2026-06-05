// finding-types.ts — the shared vocabulary for Minotaurus architectural findings.
//
// A "finding" is one deterministic architectural fact (e.g. DEPENDS_ON_DEPRECATED).
// Its CODE is its single canonical identity and must survive end-to-end:
//   Validation → Analysis → PDF → AI Review.
// This module is the lowest-level shared base: pure types + constants, no deps on
// validation/analysis/ai (those depend on it, never the reverse).

// Mirrors Prisma `IssueSeverity`.
export type FindingSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

// Mirrors Prisma `IssueCategory` (kept in sync so a finding's category can be
// persisted on a ValidationIssue without translation).
export type FindingCategory =
  | "DOCUMENTATION"
  | "API"
  | "DATABASE"
  | "SECURITY"
  | "ARCHITECTURE"
  | "RELATIONSHIP"
  | "VERSIONING"
  | "DIAGRAM";

// Where a finding's "Open" action should navigate.
export type FindingTargetKind =
  | "TEAM"
  | "ARTIFACT"
  | "API_SPEC"
  | "DATABASE_MODEL"
  | "DIAGRAM"
  | "PROJECT";

export interface FindingCatalogEntry {
  /** Canonical, stable identity — MUST equal the catalog key. */
  code: string;
  category: FindingCategory;
  /** Canonical severity (Phase B's single source of truth; advisory in Phase A). */
  severity: FindingSeverity;
  /** Short human label for the rule. */
  title: string;
  /** Plain-language explanation of why the rule fired. */
  why: string;
  /** Manual remediation guidance (never AI-generated). */
  suggestedFix: string;
  targetKind: FindingTargetKind;
  /** Optional artifact-detail tab hint (e.g. "documentation"). */
  tab?: string;
}

// Fallback identity for a finding that cannot be classified to a known code.
// Deliberately NOT "VALIDATION_ISSUE" — a generic-but-namespaced code that still
// flags "unknown" without flattening every rule into one bucket.
export const UNKNOWN_FINDING = "UNKNOWN_FINDING";
