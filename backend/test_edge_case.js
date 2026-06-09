import { parseSqlSchema } from "./dist/src/modules/ingestion/sql.engine.js";

// Test case: REFERENCES table with whitespace-only column list
const sql = `
  CREATE TABLE users ( id uuid PRIMARY KEY );
  CREATE TABLE orders ( id uuid PRIMARY KEY, user_id uuid REFERENCES users( ) );
`;

try {
  const p = parseSqlSchema(sql);
  const fk = p.entities[1].fields.find(f => f.name === "user_id");
  console.log("Field:", fk);
  console.log("isForeignKey:", fk.isForeignKey);
  console.log("referencesEntity:", fk.referencesEntity);
  console.log("referencesField:", JSON.stringify(fk.referencesField));
  console.log("referencesField length:", fk.referencesField?.length);
} catch (e) {
  console.error("Error:", e.message);
}
