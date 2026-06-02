// bootstrap.schema.test.ts — the Zod contract for AI bootstrap proposals.
// Focus: Bootstrap V2 (Phase 1) database leniency + caps. The database block is the
// newest, most expendable field; the schema must accept a DB-less or truncated
// response (default []) while keeping names/structure strict and caps enforced.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { bootstrapProposalSchema } from "./bootstrap.schema.js";

const CORE = {
  summary: "x",
  artifacts: [{ title: "A", type: "SERVICE", rationale: "", confidence: 0.9 }],
  diagrams: [{ title: "D", mermaidSource: "flowchart TD\n A[A]", confidence: 0.5 }],
  relations: [],
};

test("a proposal omitting databaseModels parses with databaseModels defaulting to []", () => {
  const r = bootstrapProposalSchema.safeParse({ ...CORE });
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.databaseModels, []);
});

// ── API catalog (Bootstrap V2, Phase 2) ──

const VALID_SPEC = {
  title: "Booking API",
  version: "1.0.0",
  endpoints: [{ method: "GET", path: "/bookings", summary: "List", requiresAuth: true, confidence: 0.9 }],
  confidence: 0.9,
};

test("a proposal omitting apiSpecs parses with apiSpecs defaulting to []", () => {
  const r = bootstrapProposalSchema.safeParse({ ...CORE });
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.apiSpecs, []);
});

test("a valid API spec is accepted", () => {
  const r = bootstrapProposalSchema.safeParse({ ...CORE, apiSpecs: [VALID_SPEC] });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.apiSpecs[0].endpoints[0].method, "GET");
});

test("version defaults to 1.0.0 when blank (lenient)", () => {
  const r = bootstrapProposalSchema.safeParse({ ...CORE, apiSpecs: [{ ...VALID_SPEC, version: "" }] });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.apiSpecs[0].version, "1.0.0");
});

test("requiresAuth defaults to true when missing", () => {
  const ep = { method: "GET", path: "/x", summary: "y", confidence: 0.9 };
  const r = bootstrapProposalSchema.safeParse({ ...CORE, apiSpecs: [{ ...VALID_SPEC, endpoints: [ep] }] });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.apiSpecs[0].endpoints[0].requiresAuth, true);
});

test("caps enforced: more than 4 specs rejected", () => {
  const r = bootstrapProposalSchema.safeParse({ ...CORE, apiSpecs: [VALID_SPEC, VALID_SPEC, VALID_SPEC, VALID_SPEC, VALID_SPEC] });
  assert.equal(r.success, false);
});

test("caps enforced: more than 10 endpoints rejected", () => {
  const endpoints = Array.from({ length: 11 }, (_, i) => ({
    method: "GET",
    path: `/p${i}`,
    summary: "s",
    requiresAuth: true,
    confidence: 0.9,
  }));
  const r = bootstrapProposalSchema.safeParse({ ...CORE, apiSpecs: [{ ...VALID_SPEC, endpoints }] });
  assert.equal(r.success, false);
});

test("invalid HTTP method is rejected at the schema level", () => {
  const r = bootstrapProposalSchema.safeParse({
    ...CORE,
    apiSpecs: [{ ...VALID_SPEC, endpoints: [{ method: "FETCH", path: "/x", summary: "y", requiresAuth: true, confidence: 0.9 }] }],
  });
  assert.equal(r.success, false);
});

test("an overlong endpoint summary is rejected at the schema level", () => {
  const r = bootstrapProposalSchema.safeParse({
    ...CORE,
    apiSpecs: [{ ...VALID_SPEC, endpoints: [{ method: "GET", path: "/x", summary: "z".repeat(121), requiresAuth: true, confidence: 0.9 }] }],
  });
  assert.equal(r.success, false);
});

test("an invalid databaseType is caught to PostgreSQL (lenient enum)", () => {
  const r = bootstrapProposalSchema.safeParse({
    ...CORE,
    databaseModels: [
      {
        title: "DB",
        databaseType: "OracleXE",
        entities: [{ name: "E", confidence: 0.9, fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }] }],
        confidence: 0.9,
      },
    ],
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.databaseModels[0].databaseType, "PostgreSQL");
});

test("lenient field flags/type coerce rather than throw", () => {
  const r = bootstrapProposalSchema.safeParse({
    ...CORE,
    databaseModels: [
      {
        title: "DB",
        databaseType: "PostgreSQL",
        entities: [
          {
            name: "E",
            confidence: 0.9,
            // required is a non-boolean, type missing → both should be caught to defaults.
            fields: [{ name: "id", required: "yes", isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }],
          },
        ],
        confidence: 0.9,
      },
    ],
  });
  assert.equal(r.success, true);
  if (r.success) {
    const f = r.data.databaseModels[0].entities[0].fields[0];
    assert.equal(f.required, false); // coerced
    assert.equal(f.type, "text"); // default
  }
});

test("caps are enforced: more than 4 models is rejected", () => {
  const model = {
    title: "DB",
    databaseType: "PostgreSQL",
    entities: [{ name: "E", confidence: 0.9, fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }] }],
    confidence: 0.9,
  };
  const r = bootstrapProposalSchema.safeParse({ ...CORE, databaseModels: [model, model, model, model, model] });
  assert.equal(r.success, false);
});

test("a field name is required (structural strictness)", () => {
  const r = bootstrapProposalSchema.safeParse({
    ...CORE,
    databaseModels: [
      {
        title: "DB",
        databaseType: "PostgreSQL",
        entities: [{ name: "E", confidence: 0.9, fields: [{ name: "", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }] }],
        confidence: 0.9,
      },
    ],
  });
  assert.equal(r.success, false);
});
