import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENTABLE_TYPES,
  analyzeMissingDocumentation,
  type DocArtifactInput,
  type DocRelationInput,
} from "./documentation-rule.js";
import { classifyFindingFromIssue } from "./finding-classifier.js";
import { getQuickFixIdForCode } from "./quick-fix.js";

const art = (over: Partial<DocArtifactInput>): DocArtifactInput => ({
  id: "a1",
  title: "Thing",
  type: "SERVICE",
  status: "ACTIVE",
  documentationContent: null,
  ...over,
});

const flaggedIds = (arts: DocArtifactInput[], rels: DocRelationInput[] = []) =>
  analyzeMissingDocumentation(arts, rels).map((f) => f.artifactId);

// ── Option B: broadened coverage ──

test("an ACTIVE SERVICE with no docs and no DOCUMENTS relation IS flagged", () => {
  assert.deepEqual(flaggedIds([art({ id: "svc", type: "SERVICE" })]), ["svc"]);
});

test("API_SPEC / DATABASE_MODEL / SECURITY_POLICY without docs are flagged", () => {
  const arts = [
    art({ id: "api", type: "API_SPEC" }),
    art({ id: "db", type: "DATABASE_MODEL" }),
    art({ id: "sec", type: "SECURITY_POLICY" }),
  ];
  assert.deepEqual(flaggedIds(arts).sort(), ["api", "db", "sec"]);
});

test("an empty DOCUMENTATION artifact is still flagged with the LEGACY message (waiver-stable)", () => {
  const out = analyzeMissingDocumentation([art({ id: "doc", type: "DOCUMENTATION", title: "Billing Flow" })], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].message, 'Documentation artifact "Billing Flow" has no documentation content.');
});

test("non-DOCUMENTATION types get a generic message that still contains the classifier phrase", () => {
  const out = analyzeMissingDocumentation([art({ id: "svc", type: "SERVICE", title: "Patient Service" })], []);
  assert.equal(out[0].message, 'Artifact "Patient Service" has no documentation content.');
  assert.match(out[0].message, /no documentation content/);
});

// ── exclusions (anti-noise guards) ──

test("an artifact with its own documentationContent is NOT flagged", () => {
  assert.deepEqual(flaggedIds([art({ id: "svc", documentationContent: "# Real docs" })]), []);
});

test("whitespace-only content counts as empty (still flagged)", () => {
  assert.deepEqual(flaggedIds([art({ id: "svc", documentationContent: "   \n\t" })]), ["svc"]);
});

test("an artifact documented via an incoming DOCUMENTS relation is NOT flagged", () => {
  const arts = [art({ id: "svc", type: "SERVICE" }), art({ id: "doc", type: "DOCUMENTATION", documentationContent: "# Service docs" })];
  const rels: DocRelationInput[] = [{ targetArtifactId: "svc", relationType: "DOCUMENTS" }];
  // svc is documented by the linked doc; the doc has content → neither flagged.
  assert.deepEqual(flaggedIds(arts, rels), []);
});

test("a non-DOCUMENTS incoming relation does NOT count as documentation", () => {
  const rels: DocRelationInput[] = [{ targetArtifactId: "svc", relationType: "SECURES" }, { targetArtifactId: "svc", relationType: "USES" }];
  assert.deepEqual(flaggedIds([art({ id: "svc", type: "SERVICE" })], rels), ["svc"]);
});

test("DEPRECATED artifacts are NOT flagged (being retired)", () => {
  assert.deepEqual(flaggedIds([art({ id: "svc", status: "DEPRECATED" })]), []);
});

test("DRAFT artifacts ARE flagged (UI/bootstrap default; in scope on purpose)", () => {
  assert.deepEqual(flaggedIds([art({ id: "svc", status: "DRAFT" })]), ["svc"]);
});

test("EXTERNAL_SYSTEM is NOT flagged (intentionally undocumented / third-party)", () => {
  assert.deepEqual(flaggedIds([art({ id: "ext", type: "EXTERNAL_SYSTEM" })]), []);
});

test("non-documentable types are NOT flagged", () => {
  const arts = [
    art({ id: "ep", type: "API_ENDPOINT" }),
    art({ id: "ent", type: "DATABASE_ENTITY" }),
    art({ id: "dia", type: "DIAGRAM" }),
    art({ id: "req", type: "REQUIREMENT" }),
    art({ id: "env", type: "ENVIRONMENT" }),
  ];
  assert.deepEqual(flaggedIds(arts), []);
});

test("DOCUMENTABLE_TYPES is the intended narrow set (excludes EXTERNAL_SYSTEM)", () => {
  assert.deepEqual([...DOCUMENTABLE_TYPES].sort(), ["API_SPEC", "DATABASE_MODEL", "DOCUMENTATION", "SECURITY_POLICY", "SERVICE"]);
  assert.ok(!DOCUMENTABLE_TYPES.has("EXTERNAL_SYSTEM"));
});

// ── Quick Fix wiring + determinism ──

test("every flagged finding classifies to MISSING_DOCUMENTATION and has a quick fix", () => {
  const arts = [art({ id: "svc", type: "SERVICE" }), art({ id: "doc", type: "DOCUMENTATION" })];
  for (const f of analyzeMissingDocumentation(arts, [])) {
    const code = classifyFindingFromIssue({ category: "DOCUMENTATION", message: f.message });
    assert.equal(code, "MISSING_DOCUMENTATION", `message must classify: ${f.message}`);
    assert.equal(getQuickFixIdForCode(code), "GENERATE_DOCUMENTATION_TEMPLATE");
  }
});

test("output is deterministic — sorted by id, deep-equal across calls", () => {
  const arts = [art({ id: "z", type: "SERVICE" }), art({ id: "a", type: "API_SPEC" }), art({ id: "m", type: "DATABASE_MODEL" })];
  const first = analyzeMissingDocumentation(arts, []);
  assert.deepEqual(first.map((f) => f.artifactId), ["a", "m", "z"]);
  assert.deepEqual(analyzeMissingDocumentation(arts, []), first);
});
