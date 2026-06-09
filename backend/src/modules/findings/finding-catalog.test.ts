import test from "node:test";
import assert from "node:assert/strict";
import { FINDING_CATALOG, FINDING_CODES, getFinding, getFindingOrFallback } from "./finding-catalog.js";
import {
  classifyFindingFromIssue,
  parseFindingCode,
  stripFindingCode,
} from "./finding-classifier.js";
import { UNKNOWN_FINDING } from "./finding-types.js";

const SEVERITIES = new Set(["INFO", "WARNING", "ERROR", "CRITICAL"]);
const CATEGORIES = new Set([
  "DOCUMENTATION", "API", "DATABASE", "SECURITY",
  "ARCHITECTURE", "RELATIONSHIP", "VERSIONING", "DIAGRAM",
]);
const TARGET_KINDS = new Set(["TEAM", "ARTIFACT", "API_SPEC", "DATABASE_MODEL", "DIAGRAM", "PROJECT"]);

// ── Catalog invariants ──

test("every catalog entry is complete and well-formed", () => {
  for (const [key, e] of Object.entries(FINDING_CATALOG)) {
    assert.equal(e.code, key, `${key}: code must equal its key`);
    assert.ok(SEVERITIES.has(e.severity), `${key}: severity`);
    assert.ok(CATEGORIES.has(e.category), `${key}: category`);
    assert.ok(TARGET_KINDS.has(e.targetKind), `${key}: targetKind`);
    assert.ok(e.title.trim().length > 0, `${key}: title`);
    assert.ok(e.why.trim().length > 0, `${key}: why`);
    assert.ok(e.suggestedFix.trim().length > 0, `${key}: suggestedFix`);
  }
});

test("the Phase A required codes are all present", () => {
  const required = [
    "ORPHAN_ARTIFACT", "DEPENDS_ON_DEPRECATED", "DEPRECATED_STILL_REFERENCED",
    "HIGH_FAN_OUT", "HIGH_CHURN", "SINGLE_MEMBER_PROJECT",
    "MISSING_DOCUMENTATION",
    "SECURITY_POLICY_NOT_LINKED", "PUBLIC_SECURITY_ENDPOINT",
    "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD", "USER_SCOPED_ENDPOINT_WITHOUT_AUTH",
    "RESPONSE_EXPOSES_TOKEN_OR_SECRET",
    "API_SPEC_NO_ENDPOINTS", "ENDPOINT_NO_SUMMARY", "API_FIELD_UNMAPPED",
    "DB_MODEL_NO_ENTITIES", "DB_ENTITY_NO_FIELDS", "DB_ENTITY_NO_PK",
    "DB_FK_NO_TARGET", "DB_FK_MISSING_TARGET",
    "DIAGRAM_EMPTY", "DIAGRAM_INVALID", "DIAGRAM_UNLINKED",
    "STALE_VALIDATION",
  ];
  for (const code of required) assert.ok(FINDING_CODES.includes(code), `missing ${code}`);
});

test("getFinding is strict; getFindingOrFallback never returns undefined", () => {
  assert.equal(getFinding("NOPE_NOT_A_CODE"), undefined);
  assert.equal(getFindingOrFallback("NOPE_NOT_A_CODE").code, UNKNOWN_FINDING);
  assert.equal(getFindingOrFallback("DEPENDS_ON_DEPRECATED").code, "DEPENDS_ON_DEPRECATED");
});

// ── parse / strip ──

test("parseFindingCode splits a real CODE prefix", () => {
  const { code, cleanMessage } = parseFindingCode('API_FIELD_UNMAPPED · POST /x: field "y" maps to nothing');
  assert.equal(code, "API_FIELD_UNMAPPED");
  assert.equal(cleanMessage, 'POST /x: field "y" maps to nothing');
});

test("parseFindingCode leaves an un-prefixed message intact", () => {
  const { code, cleanMessage } = parseFindingCode('Artifact "X" is orphaned — no incoming or outgoing relations.');
  assert.equal(code, null);
  assert.equal(cleanMessage, 'Artifact "X" is orphaned — no incoming or outgoing relations.');
});

test("stripFindingCode removes a prefix and is a no-op otherwise", () => {
  assert.equal(stripFindingCode("DEPENDS_ON_DEPRECATED · a depends on b"), "a depends on b");
  assert.equal(stripFindingCode("a depends on b"), "a depends on b");
});

// ── classification: a representative message per validation-producible rule ──
// (STALE_VALIDATION is emitted directly by the analysis engine, never classified
//  from a ValidationIssue message, so it is intentionally excluded here.)

const CASES: Record<string, { category: string; message: string }> = {
  ORPHAN_ARTIFACT: { category: "RELATIONSHIP", message: 'Artifact "X" is orphaned — no incoming or outgoing relations.' },
  DEPENDS_ON_DEPRECATED: { category: "ARCHITECTURE", message: 'Active artifact "X" depends on deprecated artifact "Y".' },
  DEPRECATED_STILL_REFERENCED: { category: "ARCHITECTURE", message: 'Deprecated artifact "X" still has 3 incoming references.' },
  HIGH_FAN_OUT: { category: "ARCHITECTURE", message: 'Artifact "X" has 9 relations — consider splitting responsibilities.' },
  HIGH_CHURN: { category: "ARCHITECTURE", message: 'Artifact "X" was changed 7 times in the last 7 days.' },
  SINGLE_MEMBER_PROJECT: { category: "ARCHITECTURE", message: "PROJECT_LEVEL · Single-user project may reduce collaboration visibility." },
  MISSING_DOCUMENTATION: { category: "DOCUMENTATION", message: 'Documentation artifact "X" has no documentation content.' },
  SECURITY_POLICY_NOT_LINKED: { category: "SECURITY", message: 'Security policy "X" has no SECURES outgoing relation.' },
  PUBLIC_SECURITY_ENDPOINT: { category: "SECURITY", message: 'Endpoint GET /admin on security-related spec "X" is marked public (requiresAuth=false).' },
  PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD: { category: "SECURITY", message: 'PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD · POST /x: public endpoint accepts sensitive field "password" without authentication' },
  USER_SCOPED_ENDPOINT_WITHOUT_AUTH: { category: "SECURITY", message: "USER_SCOPED_ENDPOINT_WITHOUT_AUTH · GET /users/{id}: operates on user-scoped resource but requires no authentication" },
  RESPONSE_EXPOSES_TOKEN_OR_SECRET: { category: "SECURITY", message: 'RESPONSE_EXPOSES_TOKEN_OR_SECRET · GET /x: response exposes credential field "token"' },
  API_SPEC_NO_ENDPOINTS: { category: "API", message: 'API spec "X" has no endpoints.' },
  ENDPOINT_NO_SUMMARY: { category: "API", message: 'Endpoint POST /x in "X" has no summary.' },
  API_FIELD_UNMAPPED: { category: "API", message: 'API_FIELD_UNMAPPED · POST /x: field "y" looks like an entity reference but maps to no database entity' },
  DB_MODEL_NO_ENTITIES: { category: "DATABASE", message: 'Database model "X" has no entities.' },
  DB_ENTITY_NO_FIELDS: { category: "DATABASE", message: 'Entity "E" in "X" has no fields.' },
  DB_ENTITY_NO_PK: { category: "DATABASE", message: 'Entity "E" in "X" has no primary key.' },
  DB_FK_NO_TARGET: { category: "DATABASE", message: 'Foreign key "E.f" has no target entity.' },
  DB_FK_MISSING_TARGET: { category: "DATABASE", message: 'Foreign key "E.f" references a missing entity.' },
  DB_FK_TARGET_NOT_KEY: { category: "DATABASE", message: 'Foreign key "E.f" references a non-key column "T.c".' },
  DB_FK_NO_PRECISE_COLUMN: { category: "DATABASE", message: 'Foreign key "E.f" references entity "T" but no specific referenced column.' },
  DB_FK_COLUMN_WITHOUT_ENTITY: { category: "DATABASE", message: 'Foreign key "E.f" has a referenced column but no referenced entity.' },
  DB_FK_MISSING_TARGET_COLUMN: { category: "DATABASE", message: 'Foreign key "E.f" references a missing column.' },
  DB_FK_COLUMN_ENTITY_MISMATCH: { category: "DATABASE", message: 'Foreign key "E.f" references a column outside its referenced entity.' },
  DB_FK_CROSS_MODEL_ENTITY: { category: "DATABASE", message: 'Foreign key "E.f" references an entity in a different database model.' },
  DB_FK_CROSS_MODEL_COLUMN: { category: "DATABASE", message: 'Foreign key "E.f" references a column in a different database model.' },
  DIAGRAM_EMPTY: { category: "DIAGRAM", message: 'Diagram "X" has an empty Mermaid source.' },
  DIAGRAM_INVALID: { category: "DIAGRAM", message: 'Diagram "X" may be invalid Mermaid (missing diagram-type header).' },
  DIAGRAM_UNLINKED: { category: "DIAGRAM", message: 'Architecture diagram "X" is not linked to an artifact.' },
};

for (const [code, input] of Object.entries(CASES)) {
  test(`classifyFindingFromIssue → ${code}`, () => {
    assert.equal(classifyFindingFromIssue(input), code);
  });
}

test("no known validation rule classifies as UNKNOWN_FINDING", () => {
  for (const [code, input] of Object.entries(CASES)) {
    assert.notEqual(classifyFindingFromIssue(input), UNKNOWN_FINDING, `${code} must not be UNKNOWN_FINDING`);
  }
});

test("every classified code resolves in the catalog", () => {
  for (const input of Object.values(CASES)) {
    assert.ok(getFinding(classifyFindingFromIssue(input)), "classified code must be a catalog code");
  }
});

test("a genuinely unrecognised message falls back to UNKNOWN_FINDING (never VALIDATION_ISSUE)", () => {
  const code = classifyFindingFromIssue({ category: "ARCHITECTURE", message: "Some brand new situation." });
  assert.equal(code, UNKNOWN_FINDING);
  assert.notEqual(code, "VALIDATION_ISSUE");
});

test("an unknown CODE prefix is NOT honoured (must be a real catalog code)", () => {
  // A prefix that looks like a code but isn't in the catalog falls through to
  // keyword classification, not blind acceptance.
  assert.equal(classifyFindingFromIssue({ category: "API", message: "MADE_UP_CODE · has no endpoints" }), "API_SPEC_NO_ENDPOINTS");
});
