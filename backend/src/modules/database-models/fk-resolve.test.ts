import test from "node:test";
import assert from "node:assert/strict";
import { resolvePreciseFkFieldId, normalizeFieldName, type FkTargetField } from "./fk-resolve.js";

const fields = (over: Partial<FkTargetField>[] = []): FkTargetField[] => [
  { id: "f_id", name: "id", isPrimaryKey: true },
  { id: "f_email", name: "email", isPrimaryKey: false },
  ...(over as FkTargetField[]),
];

// ── normalizeFieldName ──

test("normalizeFieldName trims + lowercases", () => {
  assert.equal(normalizeFieldName("  User_Id "), "user_id");
  assert.equal(normalizeFieldName(undefined), "");
  assert.equal(normalizeFieldName(null), "");
});

// ── explicit name match ──

test("resolves by explicit column name (case-insensitive)", () => {
  const r = resolvePreciseFkFieldId("ID", fields());
  assert.deepEqual(r, { fieldId: "f_id", reason: "BY_NAME" });
});

test("resolves a non-PK column by name", () => {
  const r = resolvePreciseFkFieldId("email", fields());
  assert.deepEqual(r, { fieldId: "f_email", reason: "BY_NAME" });
});

test("explicit name with no match → null + NAME_NOT_FOUND (never guesses)", () => {
  const r = resolvePreciseFkFieldId("nonexistent", fields());
  assert.deepEqual(r, { fieldId: null, reason: "NAME_NOT_FOUND" });
});

// ── PK fallback (no name) ──

test("no name + exactly one PK → PK_FALLBACK", () => {
  const r = resolvePreciseFkFieldId(undefined, fields());
  assert.deepEqual(r, { fieldId: "f_id", reason: "PK_FALLBACK" });
});

test("empty/whitespace name is treated as 'no name' → PK fallback", () => {
  assert.equal(resolvePreciseFkFieldId("", fields()).reason, "PK_FALLBACK");
  assert.equal(resolvePreciseFkFieldId("   ", fields()).reason, "PK_FALLBACK");
});

test("no name + multiple PKs → AMBIGUOUS_PK, null (composite key, can't pin one)", () => {
  const r = resolvePreciseFkFieldId(undefined, [
    { id: "a", name: "tenant_id", isPrimaryKey: true },
    { id: "b", name: "user_id", isPrimaryKey: true },
  ]);
  assert.deepEqual(r, { fieldId: null, reason: "AMBIGUOUS_PK" });
});

test("no name + no PK → NO_PK, null", () => {
  const r = resolvePreciseFkFieldId(undefined, [{ id: "a", name: "x", isPrimaryKey: false }]);
  assert.deepEqual(r, { fieldId: null, reason: "NO_PK" });
});

// ── no target ──

test("no target fields → NO_TARGET, null", () => {
  assert.deepEqual(resolvePreciseFkFieldId("id", []), { fieldId: null, reason: "NO_TARGET" });
  assert.deepEqual(resolvePreciseFkFieldId("id", null), { fieldId: null, reason: "NO_TARGET" });
  assert.deepEqual(resolvePreciseFkFieldId(undefined, undefined), { fieldId: null, reason: "NO_TARGET" });
});

// ── determinism ──

test("deterministic — same inputs, deep-equal result", () => {
  const t = fields();
  assert.deepEqual(resolvePreciseFkFieldId("email", t), resolvePreciseFkFieldId("email", t));
});
