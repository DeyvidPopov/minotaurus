import test from "node:test";
import assert from "node:assert/strict";
import { analyzeApiIntelCounts } from "./api-metrics.js";
import type { ApiValidationInput } from "./api-intel.types.js";

const MODELS: ApiValidationInput["models"] = [
  { id: "m", artifactId: null, title: "DB", entities: [{ id: "e", name: "Patient", fields: [{ name: "id" }] }] },
];

function inp(eps: ApiValidationInput["specs"][number]["endpoints"]): ApiValidationInput {
  return { specs: [{ id: "s", artifactId: null, title: "API", endpoints: eps }], models: MODELS };
}
const ep = (o: Partial<ApiValidationInput["specs"][number]["endpoints"][number]>) => ({
  id: "e",
  method: "POST",
  path: "/x",
  summary: "",
  requestSchema: "",
  responseSchema: "",
  requiresAuth: true,
  ...o,
});

test("payload coverage counts endpoints with non-empty schemas", () => {
  const c = analyzeApiIntelCounts(
    inp([ep({ id: "a", requestSchema: JSON.stringify({ patientId: "uuid" }) }), ep({ id: "b" })]),
  );
  assert.equal(c.totalEndpoints, 2);
  assert.equal(c.endpointsWithPayload, 1);
});

test("field→entity mapping: id-like mapped vs unmapped", () => {
  const c = analyzeApiIntelCounts(inp([ep({ requestSchema: JSON.stringify({ patientId: "uuid", orderId: "uuid" }) })]));
  assert.equal(c.idLikeFieldTotal, 2);
  assert.equal(c.mappedFieldTotal, 1); // patientId → Patient; orderId → none
});

test("sensitive exposures counted + listed", () => {
  const c = analyzeApiIntelCounts(inp([ep({ requestSchema: JSON.stringify({ password: "x", ssn: "y" }) })]));
  assert.equal(c.sensitiveExposureCount, 2);
  assert.ok(c.sensitiveExposures.some((e) => e.field === "password" && e.kind === "credential"));
  assert.ok(c.sensitiveExposures.some((e) => e.field === "ssn" && e.kind === "pii"));
});

test("public endpoint risk count reflects SECURITY validation findings", () => {
  const c = analyzeApiIntelCounts(
    inp([ep({ method: "GET", path: "/orders", requiresAuth: false, responseSchema: JSON.stringify({ token: "x" }) })]),
  );
  assert.ok(c.publicEndpointRiskCount >= 1, "RESPONSE_EXPOSES_TOKEN_OR_SECRET counted");
  assert.ok(c.risks.some((r) => r.code === "RESPONSE_EXPOSES_TOKEN_OR_SECRET"));
});

test("empty project → zero counts, null coverage-supporting totals", () => {
  const c = analyzeApiIntelCounts({ specs: [], models: [] });
  assert.equal(c.totalEndpoints, 0);
  assert.equal(c.idLikeFieldTotal, 0);
  assert.equal(c.sensitiveExposureCount, 0);
});

test("determinism: same input → deep-equal output twice", () => {
  const i = inp([ep({ requestSchema: JSON.stringify({ patientId: "uuid", password: "x" }) })]);
  assert.deepStrictEqual(analyzeApiIntelCounts(i), analyzeApiIntelCounts(i));
});
