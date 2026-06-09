import { resolvePreciseFkFieldId } from "./dist/src/modules/database-models/fk-resolve.js";

// Test case: empty referencesField 
const targetFields = [
  { id: "f_id", name: "id", isPrimaryKey: true },
  { id: "f_email", name: "email", isPrimaryKey: false },
];

const result1 = resolvePreciseFkFieldId("", targetFields);
console.log("Empty string:", result1);

const result2 = resolvePreciseFkFieldId("   ", targetFields);
console.log("Whitespace:", result2);

const result3 = resolvePreciseFkFieldId(undefined, targetFields);
console.log("Undefined:", result3);
