import test from "node:test";
import assert from "node:assert/strict";
import {
  FIX_ACTIONS,
  getFindingActions,
  type FindingAction,
  type FindingActionTarget,
} from "./finding-actions.js";
import { FINDING_CODES, getFinding } from "./finding-catalog.js";
import { getQuickFixDescriptor, getQuickFixIdForCode } from "./quick-fix.js";
import { getRelationRemediationIdForCode } from "./relation-remediation.js";

const KINDS = new Set(["NAVIGATE", "GENERATE", "CREATE_RELATION", "CREATE_CONTENT"]);
const STATUSES = new Set(["AVAILABLE", "PLANNED"]);
const ARTIFACT_TARGET: FindingActionTarget = { kind: "ARTIFACT", id: "art_1" };

function assertWellFormed(actions: FindingAction[], label: string) {
  for (const a of actions) {
    assert.ok(a.id.trim().length > 0, `${label}: id`);
    assert.ok(a.label.trim().length > 0, `${label}: label`);
    assert.ok(KINDS.has(a.kind), `${label}: kind ${a.kind}`);
    assert.ok(STATUSES.has(a.status), `${label}: status ${a.status}`);
    // fixId is only ever present on an AVAILABLE action; PLANNED never carries one.
    if (a.fixId != null) assert.equal(a.status, "AVAILABLE", `${label}: fixId implies AVAILABLE`);
    if (a.status === "PLANNED") assert.equal(a.fixId, undefined, `${label}: PLANNED has no fixId`);
  }
}

// ── shape / invariants ──

test("every action is well-formed across all catalog codes (with and without a target)", () => {
  for (const code of FINDING_CODES) {
    assertWellFormed(getFindingActions(code, ARTIFACT_TARGET), `${code} (with target)`);
    assertWellFormed(getFindingActions(code, null), `${code} (no target)`);
  }
});

test("a present target always yields a leading NAVIGATE action labelled for the kind", () => {
  const cases: Array<[FindingActionTarget["kind"], string]> = [
    ["TEAM", "Open Team"],
    ["ARTIFACT", "Open artifact"],
    ["API_SPEC", "Open API spec"],
    ["DATABASE_MODEL", "Open database model"],
    ["DIAGRAM", "Open diagram"],
  ];
  for (const [kind, label] of cases) {
    const [first] = getFindingActions("ORPHAN_ARTIFACT", { kind, id: "x" });
    assert.equal(first.kind, "NAVIGATE");
    assert.equal(first.id, "navigate");
    assert.equal(first.label, label);
    assert.equal(first.status, "AVAILABLE"); // navigation always works
    assert.equal(first.fixId, undefined); // NAVIGATE is not backed by a quick fix
  }
});

test("NAVIGATE is still offered for an unresolved (id=null) target", () => {
  const [first] = getFindingActions("API_SPEC_NO_ENDPOINTS", { kind: "API_SPEC", id: null });
  assert.equal(first.kind, "NAVIGATE");
});

test("no target → no NAVIGATE action", () => {
  assert.ok(getFindingActions("ORPHAN_ARTIFACT", null).every((a) => a.kind !== "NAVIGATE"));
});

test("a code with no target and no fix slots returns []", () => {
  // DEPENDS_ON_DEPRECATED has no FIX_ACTIONS entry → without a target, nothing.
  assert.deepEqual(getFindingActions("DEPENDS_ON_DEPRECATED", null), []);
});

test("an unknown code with a target gets navigation only (no fix slots)", () => {
  const actions = getFindingActions("NOT_A_REAL_CODE", ARTIFACT_TARGET);
  assert.deepEqual(actions, [{ id: "navigate", label: "Open artifact", kind: "NAVIGATE", status: "AVAILABLE" }]);
});

// ── specific fix-action mappings ──

const FIX_CASES: Array<[string, string, FindingAction["kind"]]> = [
  ["ORPHAN_ARTIFACT", "link-orphan", "CREATE_RELATION"],
  ["SECURITY_POLICY_NOT_LINKED", "link-secures", "CREATE_RELATION"],
  ["DIAGRAM_UNLINKED", "link-diagram", "CREATE_RELATION"],
  ["UNIMPLEMENTED_REQUIREMENT", "add-implements-relation", "CREATE_RELATION"],
  ["MISSING_DOCUMENTATION", "generate-documentation", "GENERATE"],
  ["UNDOCUMENTED_SECURITY_POLICY", "generate-documentation", "GENERATE"],
  ["API_SPEC_NO_ENDPOINTS", "add-endpoint", "CREATE_CONTENT"],
  ["ENDPOINT_NO_SUMMARY", "add-summary", "CREATE_CONTENT"],
  ["DB_MODEL_NO_ENTITIES", "add-entity", "CREATE_CONTENT"],
  ["DB_ENTITY_NO_FIELDS", "add-field", "CREATE_CONTENT"],
  ["DIAGRAM_EMPTY", "add-mermaid", "CREATE_CONTENT"],
];

for (const [code, id, kind] of FIX_CASES) {
  test(`${code} exposes its ${kind} fix action after NAVIGATE`, () => {
    const actions = getFindingActions(code, ARTIFACT_TARGET);
    assert.equal(actions[0].kind, "NAVIGATE");
    const fix = actions.find((a) => a.id === id);
    assert.ok(fix, `${code} should expose action ${id}`);
    assert.equal(fix!.kind, kind);
  });
}

// ── V2: status + fixId (quick-fix wiring) ──

test("MISSING_DOCUMENTATION exposes an AVAILABLE quick fix", () => {
  const actions = getFindingActions("MISSING_DOCUMENTATION", ARTIFACT_TARGET);
  const fix = actions.find((a) => a.id === "generate-documentation");
  assert.ok(fix);
  assert.equal(fix!.status, "AVAILABLE");
  assert.equal(fix!.fixId, "GENERATE_DOCUMENTATION_TEMPLATE");
});

test("DIAGRAM_EMPTY exposes an AVAILABLE quick fix", () => {
  const actions = getFindingActions("DIAGRAM_EMPTY", { kind: "DIAGRAM", id: "d1" });
  const fix = actions.find((a) => a.id === "add-mermaid");
  assert.ok(fix);
  assert.equal(fix!.status, "AVAILABLE");
  assert.equal(fix!.fixId, "GENERATE_STARTER_DIAGRAM");
});

test("AVAILABLE fix slots split into SAFE (one-click) vs REVIEW-required as expected", () => {
  const safe = new Set<string>();
  const review = new Set<string>();
  for (const code of FINDING_CODES) {
    for (const a of getFindingActions(code, ARTIFACT_TARGET)) {
      if (a.kind === "NAVIGATE" || a.status !== "AVAILABLE") continue;
      (a.requiresReview ? review : safe).add(code);
    }
  }
  // SAFE = deterministic one-click fixes; REVIEW = the relation remediations.
  assert.deepEqual([...safe].sort(), ["DIAGRAM_EMPTY", "MISSING_DOCUMENTATION"]);
  assert.deepEqual([...review].sort(), ["DIAGRAM_UNLINKED", "ORPHAN_ARTIFACT", "SECURITY_POLICY_NOT_LINKED"]);
});

test("an AVAILABLE fix slot agrees with the right registry (no drift)", () => {
  for (const code of FINDING_CODES) {
    for (const a of getFindingActions(code, ARTIFACT_TARGET)) {
      if (a.kind === "NAVIGATE" || a.status !== "AVAILABLE") continue;
      if (a.requiresReview) {
        // REVIEW-required → backed by the relation-remediation registry.
        assert.equal(a.fixId, getRelationRemediationIdForCode(code), `${code}: review fixId drift`);
      } else {
        // SAFE → backed by the quick-fix registry; descriptor round-trips to the code.
        assert.equal(a.fixId, getQuickFixIdForCode(code), `${code}: quick-fix fixId drift`);
        assert.equal(getQuickFixDescriptor(a.fixId as Parameters<typeof getQuickFixDescriptor>[0]).code, code, `${code}: descriptor code drift`);
      }
    }
  }
});

test("the three relation remediations are AVAILABLE + requiresReview with the right fixId", () => {
  const cases: Array<[string, string]> = [
    ["DIAGRAM_UNLINKED", "LINK_DIAGRAM_ARTIFACT"],
    ["SECURITY_POLICY_NOT_LINKED", "LINK_SECURITY_POLICY"],
    ["ORPHAN_ARTIFACT", "LINK_ORPHAN_ARTIFACT"],
  ];
  for (const [code, fixId] of cases) {
    const fix = getFindingActions(code, ARTIFACT_TARGET).find((a) => a.kind !== "NAVIGATE");
    assert.ok(fix, `${code}: expected a fix slot`);
    assert.equal(fix!.status, "AVAILABLE");
    assert.equal(fix!.requiresReview, true);
    assert.equal(fix!.fixId, fixId);
  }
});

// ── registry invariants ──

test("every FIX_ACTIONS key is a real catalog code", () => {
  for (const code of Object.keys(FIX_ACTIONS)) {
    assert.ok(getFinding(code), `${code} is not a catalog code`);
  }
});

test("every FIX_ACTIONS slot is well-formed and never NAVIGATE", () => {
  for (const [code, slots] of Object.entries(FIX_ACTIONS)) {
    for (const a of slots) {
      assert.ok(KINDS.has(a.kind), `${code}: kind`);
      // NAVIGATE is reserved for the target-derived action; fix slots are real fixes.
      assert.notEqual(a.kind, "NAVIGATE", `${code}: fix slot must not be NAVIGATE`);
      assert.ok(a.id.trim().length > 0 && a.label.trim().length > 0, `${code}: id/label`);
    }
  }
});

// ── determinism ──

test("getFindingActions is deterministic — same input, deep-equal output", () => {
  assert.deepEqual(
    getFindingActions("MISSING_DOCUMENTATION", ARTIFACT_TARGET),
    getFindingActions("MISSING_DOCUMENTATION", ARTIFACT_TARGET),
  );
});

test("returned actions are fresh copies (mutating output never affects the registry)", () => {
  const actions = getFindingActions("ORPHAN_ARTIFACT", ARTIFACT_TARGET);
  actions.push({ id: "x", label: "x", kind: "GENERATE", status: "PLANNED" });
  assert.equal(getFindingActions("ORPHAN_ARTIFACT", ARTIFACT_TARGET).length, 2);
});
