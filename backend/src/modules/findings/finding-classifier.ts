// finding-classifier.ts — recover a canonical finding code from a stored message.
//
// ValidationIssue has no `code` column (no-migration constraint), so identity is
// carried two ways and recovered here:
//   1. A "CODE · " message prefix (the engine already does this for api-intel
//      rules; any catalog code in that position is honoured).
//   2. Otherwise, keyword classification by (category, message) — the same logic
//      the validation presenter used, promoted here so every module shares it.
// If neither resolves, fall back to UNKNOWN_FINDING (never "VALIDATION_ISSUE").
//
// Pure — string ops + the catalog only. No IO.

import { FINDING_CATALOG } from "./finding-catalog.js";
import { UNKNOWN_FINDING } from "./finding-types.js";

// Separator the engine writes between a machine code and the human message
// (e.g. "API_FIELD_UNMAPPED · POST /x: …"). PROJECT_LEVEL_PREFIX reuses it.
export const CODE_SEPARATOR = " · ";
export const PROJECT_LEVEL_PREFIX = "PROJECT_LEVEL · ";

export interface ClassifiableIssue {
  category: string;
  message: string;
}

/** Split a "CODE · message" prefix off a stored message. */
export function parseFindingCode(message: string): { code: string | null; cleanMessage: string } {
  const i = message.indexOf(CODE_SEPARATOR);
  if (i > 0) {
    const candidate = message.slice(0, i);
    if (/^[A-Z][A-Z0-9_]+$/.test(candidate)) {
      return { code: candidate, cleanMessage: message.slice(i + CODE_SEPARATOR.length) };
    }
  }
  return { code: null, cleanMessage: message };
}

/** The message with any "CODE · " / "PROJECT_LEVEL · " prefix removed. */
export function stripFindingCode(message: string): string {
  return parseFindingCode(message).cleanMessage;
}

/** Recover a stable canonical code from a stored issue. */
export function classifyFindingFromIssue(issue: ClassifiableIssue): string {
  // PROJECT_LEVEL is a scope marker, not a code — map it to its rule.
  if (issue.message.startsWith(PROJECT_LEVEL_PREFIX)) return "SINGLE_MEMBER_PROJECT";

  const { code, cleanMessage } = parseFindingCode(issue.message);
  // Honour an explicit code prefix only when it names a real catalog code.
  if (code && FINDING_CATALOG[code]) return code;

  const m = cleanMessage;
  switch (issue.category) {
    case "RELATIONSHIP":
      if (m.includes("orphaned")) return "ORPHAN_ARTIFACT";
      break;
    case "DOCUMENTATION":
      if (m.includes("no documentation content")) return "MISSING_DOCUMENTATION";
      break;
    case "SECURITY":
      if (m.includes("no SECURES outgoing relation")) return "SECURITY_POLICY_NOT_LINKED";
      if (m.includes("marked public")) return "PUBLIC_SECURITY_ENDPOINT";
      break;
    case "API":
      if (m.includes("has no endpoints")) return "API_SPEC_NO_ENDPOINTS";
      if (m.includes("has no summary")) return "ENDPOINT_NO_SUMMARY";
      break;
    case "DATABASE":
      if (m.includes("has no entities")) return "DB_MODEL_NO_ENTITIES";
      if (m.includes("has no fields")) return "DB_ENTITY_NO_FIELDS";
      if (m.includes("has no primary key")) return "DB_ENTITY_NO_PK";
      if (m.includes("no target entity")) return "DB_FK_NO_TARGET";
      if (m.includes("references a missing entity")) return "DB_FK_MISSING_TARGET";
      break;
    case "DIAGRAM":
      if (m.includes("empty Mermaid source")) return "DIAGRAM_EMPTY";
      if (m.includes("invalid Mermaid")) return "DIAGRAM_INVALID";
      if (m.includes("not linked to an artifact")) return "DIAGRAM_UNLINKED";
      break;
    case "ARCHITECTURE":
      if (m.includes("depends on deprecated")) return "DEPENDS_ON_DEPRECATED";
      if (m.includes("consider splitting")) return "HIGH_FAN_OUT";
      if (m.includes("was changed")) return "HIGH_CHURN";
      if (m.includes("incoming references")) return "DEPRECATED_STILL_REFERENCED";
      break;
  }
  return UNKNOWN_FINDING;
}
