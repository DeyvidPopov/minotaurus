// sql.engine.test.ts — pure-logic tests for the SQL DDL parser, focused on the
// foreign-key capture the ingestion-confirm path relies on to populate
// referencesEntityId + referencesFieldId. Run with: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { parseSqlSchema } from "./sql.engine.js";

function fieldOf(preview: ReturnType<typeof parseSqlSchema>, entity: string, field: string) {
  const e = preview.entities.find((x) => x.name === entity);
  return e?.fields.find((f) => f.name === field);
}

test("inline FK captures referenced entity AND column", () => {
  const sql = `
    CREATE TABLE users ( id uuid PRIMARY KEY, email text );
    CREATE TABLE orders ( id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) );
  `;
  const p = parseSqlSchema(sql);
  const fk = fieldOf(p, "orders", "user_id");
  assert.equal(fk?.isForeignKey, true);
  assert.equal(fk?.referencesEntity, "users");
  assert.equal(fk?.referencesField, "id");
});

test("table-level FK captures referenced entity AND column", () => {
  const sql = `
    CREATE TABLE users ( id uuid PRIMARY KEY );
    CREATE TABLE orders (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `;
  const p = parseSqlSchema(sql);
  const fk = fieldOf(p, "orders", "user_id");
  assert.equal(fk?.isForeignKey, true);
  assert.equal(fk?.referencesEntity, "users");
  assert.equal(fk?.referencesField, "id");
});

test("forward reference: a FK to a table declared LATER still captures both", () => {
  // orders references users, but users is declared AFTER orders.
  const sql = `
    CREATE TABLE orders ( id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) );
    CREATE TABLE users ( id uuid PRIMARY KEY, email text );
  `;
  const p = parseSqlSchema(sql);
  const fk = fieldOf(p, "orders", "user_id");
  assert.equal(fk?.referencesEntity, "users");
  assert.equal(fk?.referencesField, "id");
  // The relationship list also records it (the confirm path resolves order-independently).
  assert.ok(p.relationships.some((r) => r.fromEntity === "orders" && r.toEntity === "users" && r.toField === "id"));
});

test("a bare 'REFERENCES table' (no column list) is NOT recognized as a FK (documented limitation)", () => {
  // The inline + table-level FK patterns require an explicit (column) list, so every
  // FK the parser DOES recognize carries a referenced column — ingestion then resolves
  // referencesFieldId by name. (The single-PK fallback in fk-resolve is the safety net
  // for AI bootstrap, where the referenced column name may be omitted.)
  const sql = `
    CREATE TABLE users ( id uuid PRIMARY KEY );
    CREATE TABLE orders ( id uuid PRIMARY KEY, user_id uuid REFERENCES users );
  `;
  const p = parseSqlSchema(sql);
  const fk = fieldOf(p, "orders", "user_id");
  assert.equal(fk?.isForeignKey, false);
  assert.equal(fk?.referencesEntity, undefined);
});

test("a FK to a NON-EXISTENT column captures the name verbatim (resolver → NAME_NOT_FOUND → NULL at confirm)", () => {
  // The parser does not validate the referenced column against the target table; it
  // captures whatever REFERENCES table(col) names. The ingestion-confirm pass then
  // calls resolvePreciseFkFieldId, which returns NAME_NOT_FOUND for a column that
  // isn't there → referencesFieldId stays NULL, the import still succeeds, and the
  // validation engine surfaces DB_FK_NO_PRECISE_COLUMN.
  const sql = `
    CREATE TABLE users ( id uuid PRIMARY KEY, email text );
    CREATE TABLE orders ( id uuid PRIMARY KEY, user_id uuid REFERENCES users(ghost_col) );
  `;
  const p = parseSqlSchema(sql);
  const fk = fieldOf(p, "orders", "user_id");
  assert.equal(fk?.isForeignKey, true);
  assert.equal(fk?.referencesEntity, "users");
  assert.equal(fk?.referencesField, "ghost_col"); // captured verbatim; users has no such column
});

test("primary key + quoted identifiers parse (FK to a quoted entity/column)", () => {
  const sql = `
    CREATE TABLE "Account" ( "id" uuid PRIMARY KEY, "ownerId" uuid REFERENCES "User"("id") );
    CREATE TABLE "User" ( "id" uuid PRIMARY KEY );
  `;
  const p = parseSqlSchema(sql);
  const pk = fieldOf(p, "Account", "id");
  assert.equal(pk?.isPrimaryKey, true);
  const fk = fieldOf(p, "Account", "ownerId");
  assert.equal(fk?.referencesEntity, "User");
  assert.equal(fk?.referencesField, "id");
});
