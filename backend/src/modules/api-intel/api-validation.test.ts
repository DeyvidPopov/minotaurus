import test from "node:test";
import assert from "node:assert/strict";
import { analyzeApiValidation } from "./api-validation.js";
import type { ApiValidationInput } from "./api-intel.types.js";

const MODELS: ApiValidationInput["models"] = [
  {
    id: "m_patient",
    artifactId: "art_patient_db",
    title: "Patient Database",
    entities: [
      { id: "e_patient", name: "Patient", fields: [{ name: "id" }, { name: "email" }] },
      { id: "e_appt", name: "Appointment", fields: [{ name: "id" }, { name: "patient_id" }] },
    ],
  },
];

function input(endpoints: ApiValidationInput["specs"][number]["endpoints"]): ApiValidationInput {
  return { specs: [{ id: "spec1", artifactId: null, title: "API", endpoints }], models: MODELS };
}

const ep = (over: Partial<ApiValidationInput["specs"][number]["endpoints"][number]>) => ({
  id: "ep1",
  method: "POST",
  path: "/things",
  summary: "",
  requestSchema: "",
  responseSchema: "",
  requiresAuth: false,
  ...over,
});

test("API_FIELD_UNMAPPED: id-like field with no matching entity → INFO", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e1", method: "POST", path: "/orders", requestSchema: JSON.stringify({ orderId: "uuid", patientId: "uuid" }) })]),
  );
  const unmapped = f.filter((x) => x.code === "API_FIELD_UNMAPPED");
  // patientId → Patient (mapped); orderId → no Order entity (unmapped).
  assert.ok(unmapped.some((x) => x.message.includes("orderId")));
  assert.ok(!unmapped.some((x) => x.message.includes("patientId")));
  assert.ok(unmapped.every((x) => x.severity === "INFO" && x.category === "API"));
});

test("PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD: public + sensitive request field → WARNING", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e2", method: "POST", path: "/profiles", requiresAuth: false, requestSchema: JSON.stringify({ ssn: "string" }) })]),
  );
  const hit = f.find((x) => x.code === "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD");
  assert.ok(hit);
  assert.equal(hit!.severity, "WARNING");
  assert.equal(hit!.category, "SECURITY");
});

test("auth-action endpoints are allow-listed (register accepting a password is fine)", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e3", method: "POST", path: "/patients/register", requiresAuth: false, requestSchema: JSON.stringify({ email: "string", password: "string" }) })]),
  );
  assert.ok(!f.some((x) => x.code === "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD"));
  assert.ok(!f.some((x) => x.code === "USER_SCOPED_ENDPOINT_WITHOUT_AUTH"));
});

test("USER_SCOPED_ENDPOINT_WITHOUT_AUTH: public + user-scoped id field → ERROR", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e4", method: "GET", path: "/orders", requiresAuth: false, responseSchema: JSON.stringify({ userId: "uuid" }) })]),
  );
  const hit = f.find((x) => x.code === "USER_SCOPED_ENDPOINT_WITHOUT_AUTH");
  assert.ok(hit);
  assert.equal(hit!.severity, "ERROR");
});

test("USER_SCOPED_ENDPOINT_WITHOUT_AUTH: not flagged when auth required", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e5", method: "GET", path: "/patients/{id}", requiresAuth: true, responseSchema: JSON.stringify({ id: "uuid" }) })]),
  );
  assert.ok(!f.some((x) => x.code === "USER_SCOPED_ENDPOINT_WITHOUT_AUTH"));
});

test("RESPONSE_EXPOSES_TOKEN_OR_SECRET: credential in response → WARNING", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e6", method: "GET", path: "/sessions", requiresAuth: true, responseSchema: JSON.stringify({ token: "string", id: "uuid" }) })]),
  );
  const hit = f.find((x) => x.code === "RESPONSE_EXPOSES_TOKEN_OR_SECRET");
  assert.ok(hit);
  assert.ok(hit!.message.includes("token"));
});

test("login returning a token is NOT flagged (auth allowlist)", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e7", method: "POST", path: "/auth/login", requiresAuth: false, requestSchema: JSON.stringify({ email: "string", password: "string" }), responseSchema: JSON.stringify({ token: "string" }) })]),
  );
  assert.ok(!f.some((x) => x.code === "RESPONSE_EXPOSES_TOKEN_OR_SECRET"));
  assert.ok(!f.some((x) => x.code === "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD"));
});

test("auth allow-list covers forgot-password / reset-password", () => {
  for (const path of ["/auth/forgot-password", "/auth/reset-password"]) {
    const f = analyzeApiValidation(
      input([ep({ id: "ax", method: "POST", path, requiresAuth: false, requestSchema: JSON.stringify({ email: "string", token: "string" }), responseSchema: JSON.stringify({ resetToken: "string" }) })]),
    );
    assert.ok(!f.some((x) => x.category === "SECURITY"), `${path} is allow-listed (no security findings)`);
  }
});

test("well-formed authenticated endpoint with mapped fields → no findings", () => {
  const f = analyzeApiValidation(
    input([ep({ id: "e8", method: "POST", path: "/appointments", requiresAuth: true, requestSchema: JSON.stringify({ patientId: "uuid" }) })]),
  );
  assert.equal(f.length, 0);
});

test("determinism: same input → deep-equal output twice", () => {
  const inp = input([
    ep({ id: "e9", method: "POST", path: "/orders", requiresAuth: false, requestSchema: JSON.stringify({ orderId: "uuid", ssn: "string" }) }),
  ]);
  assert.deepStrictEqual(analyzeApiValidation(inp), analyzeApiValidation(inp));
});
