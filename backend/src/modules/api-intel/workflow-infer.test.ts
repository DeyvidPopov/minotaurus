import test from "node:test";
import assert from "node:assert/strict";
import { inferWorkflow, type WorkflowContext } from "./workflow-infer.js";
import { parsePath } from "./text.js";

function ctx(overrides: Omit<Partial<WorkflowContext>, "path"> & { path: string }): WorkflowContext {
  const { path, ...rest } = overrides;
  return {
    method: "POST",
    path: parsePath(path),
    requiresAuth: false,
    primaryObject: null,
    primaryMatched: false,
    references: [],
    requestFields: new Set(),
    responseFields: new Set(),
    ...rest,
  };
}

test("POST collection + matched entity → Creates X (high)", () => {
  const wf = inferWorkflow(ctx({ path: "/patients", method: "POST", primaryObject: "Patient", primaryMatched: true, primaryEntityId: "e1" }));
  const create = wf.find((w) => w.label === "Creates Patient");
  assert.ok(create);
  assert.equal(create!.confidence, "high");
  assert.equal(create!.kind, "CREATE");
  assert.ok(create!.basis.includes("POST collection"));
});

test("PUT → Updates X; DELETE → Deletes X", () => {
  const put = inferWorkflow(ctx({ path: "/patients/{id}", method: "PUT", primaryObject: "Patient", primaryMatched: true }));
  assert.ok(put.some((w) => w.label === "Updates Patient" && w.kind === "UPDATE"));
  const del = inferWorkflow(ctx({ path: "/patients/{id}", method: "DELETE", primaryObject: "Patient", primaryMatched: true }));
  assert.ok(del.some((w) => w.label === "Deletes Patient" && w.kind === "DELETE"));
});

test("unmatched path resource → medium confidence create", () => {
  const wf = inferWorkflow(ctx({ path: "/widgets", method: "POST", primaryObject: "Widget", primaryMatched: false }));
  const create = wf.find((w) => w.kind === "CREATE");
  assert.ok(create);
  assert.equal(create!.confidence, "medium");
});

test("login: auth verbs, suppresses create, emits token+session", () => {
  const wf = inferWorkflow(
    ctx({
      path: "/auth/login",
      method: "POST",
      primaryObject: "Auth",
      responseFields: new Set(["token", "expiresat", "user"]),
      requestFields: new Set(["email", "password"]),
    }),
  );
  const labels = wf.map((w) => w.label);
  assert.ok(labels.includes("Authenticates User"));
  assert.ok(labels.includes("Generates Access Token"));
  assert.ok(labels.includes("Starts User Session"));
  assert.ok(!labels.some((l) => l.startsWith("Creates")), "login must not Create");
  assert.ok(!labels.includes("Requires Authentication"), "auth action is the mechanism, not protected by it");
});

test("references emit per id-like entity (high)", () => {
  const wf = inferWorkflow(
    ctx({
      path: "/appointments",
      method: "POST",
      primaryObject: "Appointment",
      primaryMatched: true,
      references: [
        { object: "Patient", entityId: "p" },
        { object: "Doctor", entityId: "d" },
      ],
      availabilityRef: { object: "TimeSlot" },
    }),
  );
  assert.ok(wf.some((w) => w.label === "References Patient" && w.confidence === "high"));
  assert.ok(wf.some((w) => w.label === "References Doctor" && w.confidence === "high"));
  assert.ok(wf.some((w) => w.label === "Updates Availability" && w.confidence === "low"));
});

test("requiresAuth=true emits Requires Authentication (medium)", () => {
  const wf = inferWorkflow(ctx({ path: "/appointments/{id}", method: "GET", requiresAuth: true, primaryObject: "Appointment", primaryMatched: true }));
  const req = wf.find((w) => w.label === "Requires Authentication");
  assert.ok(req);
  assert.equal(req!.confidence, "medium");
});

test("every signal carries a non-empty basis; deterministic", () => {
  const c = ctx({ path: "/patients/register", method: "POST", primaryObject: "Patient", primaryMatched: true, requestFields: new Set(["email", "password"]) });
  const wf = inferWorkflow(c);
  assert.ok(wf.length > 0);
  assert.ok(wf.every((w) => typeof w.basis === "string" && w.basis.length > 0));
  assert.deepStrictEqual(inferWorkflow(c), inferWorkflow(c));
});
