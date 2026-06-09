import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeForeignKeyFindings,
  type FkRuleField,
  type FkRuleEntity,
  type FkRuleModel,
} from "./database-fk-rule.js";

// Two models, each with two entities, so cross-model cases are expressible.
const models: FkRuleModel[] = [
  { id: "m1", artifactId: "art1" },
  { id: "m2", artifactId: null },
];
const entities: FkRuleEntity[] = [
  { id: "e_user", name: "users", databaseModelId: "m1" },
  { id: "e_order", name: "orders", databaseModelId: "m1" },
  { id: "e_other", name: "other", databaseModelId: "m2" }, // different model
];

// Base fields: users.id (PK), users.email (UNIQUE via description), users.nickname (plain),
// other.id (PK in m2).
function baseFields(extra: FkRuleField[] = []): FkRuleField[] {
  return [
    { id: "u_id", entityId: "e_user", name: "id", isPrimaryKey: true, isForeignKey: false, referencesEntityId: null, referencesFieldId: null, description: "" },
    { id: "u_email", entityId: "e_user", name: "email", isPrimaryKey: false, isForeignKey: false, referencesEntityId: null, referencesFieldId: null, description: "UNIQUE" },
    { id: "u_nick", entityId: "e_user", name: "nickname", isPrimaryKey: false, isForeignKey: false, referencesEntityId: null, referencesFieldId: null, description: "" },
    { id: "o_id", entityId: "e_order", name: "id", isPrimaryKey: true, isForeignKey: false, referencesEntityId: null, referencesFieldId: null, description: "" },
    { id: "x_id", entityId: "e_other", name: "id", isPrimaryKey: true, isForeignKey: false, referencesEntityId: null, referencesFieldId: null, description: "" },
    ...extra,
  ];
}

function fk(over: Partial<FkRuleField>): FkRuleField {
  return {
    id: "fk1", entityId: "e_order", name: "user_id",
    isPrimaryKey: false, isForeignKey: true,
    referencesEntityId: null, referencesFieldId: null, description: "",
    ...over,
  };
}

function codes(fields: FkRuleField[]): string[] {
  return analyzeForeignKeyFindings({ models, entities, fields }).map((f) => f.code);
}

test("a clean, precise FK to a PK column produces no finding", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "u_id" });
  assert.deepEqual(codes(baseFields([f])), []);
});

test("a precise FK to a UNIQUE (non-PK) column produces no finding", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "u_email" });
  assert.deepEqual(codes(baseFields([f])), []);
});

test("DB_FK_NO_TARGET: isForeignKey but no referenced entity", () => {
  const f = fk({ referencesEntityId: null, referencesFieldId: null });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_NO_TARGET"]);
});

test("DB_FK_COLUMN_WITHOUT_ENTITY: a column but no entity", () => {
  const f = fk({ referencesEntityId: null, referencesFieldId: "u_id" });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_COLUMN_WITHOUT_ENTITY"]);
});

test("DB_FK_MISSING_TARGET: referenced entity does not exist", () => {
  const f = fk({ referencesEntityId: "ghost", referencesFieldId: null });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_MISSING_TARGET"]);
});

test("DB_FK_CROSS_MODEL_ENTITY: referenced entity is in another model", () => {
  const f = fk({ referencesEntityId: "e_other", referencesFieldId: null });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_CROSS_MODEL_ENTITY"]);
});

test("DB_FK_NO_PRECISE_COLUMN: entity-level FK with no pinned column → WARNING code", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: null });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_NO_PRECISE_COLUMN"]);
});

test("DB_FK_MISSING_TARGET_COLUMN: referencesFieldId resolves to nothing", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "ghost_col" });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_MISSING_TARGET_COLUMN"]);
});

test("DB_FK_COLUMN_ENTITY_MISMATCH: pinned column belongs to a different entity (same model)", () => {
  // referencesEntityId = users, but referencesFieldId = orders.id (a different entity in m1)
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "o_id" });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_COLUMN_ENTITY_MISMATCH"]);
});

test("DB_FK_CROSS_MODEL_COLUMN: pinned column belongs to an entity in another model", () => {
  // referencesEntityId = users (m1), referencesFieldId = other.id (m2)
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "x_id" });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_CROSS_MODEL_COLUMN"]);
});

test("DB_FK_TARGET_NOT_KEY: pinned column is neither PK nor UNIQUE → WARNING", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "u_nick" });
  assert.deepEqual(codes(baseFields([f])), ["DB_FK_TARGET_NOT_KEY"]);
});

test("non-FK fields are ignored", () => {
  assert.deepEqual(codes(baseFields()), []);
});

test("the finding carries the field's own model id (not the referenced model's)", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "u_nick" });
  const out = analyzeForeignKeyFindings({ models, entities, fields: baseFields([f]) });
  assert.equal(out[0].modelId, "m1"); // orders is in m1
  assert.match(out[0].message, /orders\.user_id/);
});

test("deterministic — same input, deep-equal output", () => {
  const f = fk({ referencesEntityId: "e_user", referencesFieldId: "u_nick" });
  const input = { models, entities, fields: baseFields([f]) };
  assert.deepEqual(analyzeForeignKeyFindings(input), analyzeForeignKeyFindings(input));
});
