// bootstrap.validator.test.ts — pure-logic tests for the AI bootstrap validator.
// Run with: npm run test:unit  (node:test + node:assert, no Jest/Vitest).

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBootstrapProposal, type ValidationContext } from "./bootstrap.validator.js";
import type { BootstrapProposal } from "../ai.types.js";

const FLOW = "flowchart TD\n  A[Auth Service] --> B[Player Management]";

function emptyCtx(): ValidationContext {
  return { existingArtifacts: [], existingRelations: [] };
}

function proposal(over: Partial<BootstrapProposal> = {}): BootstrapProposal {
  return {
    summary: "x",
    artifacts: [
      { title: "Auth Service", type: "SERVICE", rationale: "", confidence: 0.9 },
      { title: "Player Management", type: "SERVICE", rationale: "", confidence: 0.8 },
    ],
    relations: [
      { sourceTitle: "Player Management", targetTitle: "Auth Service", relationType: "USES", rationale: "", confidence: 0.7 },
    ],
    diagrams: [{ title: "Overview", mermaidSource: FLOW, confidence: 0.6 }],
    ...over,
  };
}

test("valid proposal: everything accepted, ok true", () => {
  const r = validateBootstrapProposal(proposal(), emptyCtx());
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.artifacts.map((a) => a.accepted), [true, true]);
  assert.equal(r.relations[0].accepted, true);
  assert.equal(r.diagrams[0].accepted, true);
});

test("duplicate title within proposal: second artifact rejected", () => {
  const r = validateBootstrapProposal(
    proposal({
      artifacts: [
        { title: "Auth Service", type: "SERVICE", rationale: "", confidence: 1 },
        { title: " auth   service ", type: "SERVICE", rationale: "", confidence: 1 }, // normalizes equal
      ],
      relations: [],
    }),
    emptyCtx(),
  );
  assert.equal(r.artifacts[0].accepted, true);
  assert.equal(r.artifacts[1].accepted, false);
  assert.match(r.artifacts[1].reason ?? "", /duplicate/i);
  assert.equal(r.ok, true); // first one is still creatable
});

test("artifact whose title already exists is skipped (not a hard failure)", () => {
  const ctx: ValidationContext = {
    existingArtifacts: [{ id: "a1", normalizedTitle: "auth service" }],
    existingRelations: [],
  };
  const r = validateBootstrapProposal(proposal(), ctx);
  assert.equal(r.artifacts[0].accepted, false); // Auth Service exists
  assert.match(r.artifacts[0].reason ?? "", /already exists/i);
  assert.equal(r.artifacts[1].accepted, true);
  // relation Player Management USES Auth Service still resolves (Auth exists)
  assert.equal(r.relations[0].accepted, true);
});

test("unknown artifact type is rejected", () => {
  const r = validateBootstrapProposal(
    proposal({
      artifacts: [{ title: "Weird", type: "NOT_A_TYPE" as never, rationale: "", confidence: 1 }],
      relations: [],
      diagrams: [],
    }),
    emptyCtx(),
  );
  assert.equal(r.artifacts[0].accepted, false);
  assert.match(r.artifacts[0].reason ?? "", /unknown artifact type/i);
  assert.equal(r.ok, false); // nothing left to apply
});

test("self-relation and unresolved endpoint are skipped", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [
        { sourceTitle: "Auth Service", targetTitle: "Auth Service", relationType: "USES", rationale: "", confidence: 1 },
        { sourceTitle: "Auth Service", targetTitle: "Ghost", relationType: "USES", rationale: "", confidence: 1 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.relations[0].accepted, false);
  assert.match(r.relations[0].reason ?? "", /self-relation/i);
  assert.equal(r.relations[1].accepted, false);
  assert.match(r.relations[1].reason ?? "", /not in selection/i);
});

test("duplicate relation within proposal is skipped once", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [
        { sourceTitle: "Player Management", targetTitle: "Auth Service", relationType: "USES", rationale: "", confidence: 1 },
        { sourceTitle: "player management", targetTitle: "auth service", relationType: "USES", rationale: "", confidence: 1 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.relations[0].accepted, true);
  assert.equal(r.relations[1].accepted, false);
  assert.match(r.relations[1].reason ?? "", /duplicate relation/i);
});

test("relation already present in the project is skipped", () => {
  const ctx: ValidationContext = {
    existingArtifacts: [
      { id: "a1", normalizedTitle: "auth service" },
      { id: "a2", normalizedTitle: "player management" },
    ],
    existingRelations: [{ sourceArtifactId: "a2", targetArtifactId: "a1", relationType: "USES" }],
  };
  // Both artifacts already exist → both skipped; relation duplicates an existing one.
  const r = validateBootstrapProposal(proposal(), ctx);
  assert.equal(r.relations[0].accepted, false);
  assert.match(r.relations[0].reason ?? "", /already exists/i);
});

test("invalid Mermaid diagram is skipped with a reason", () => {
  const r = validateBootstrapProposal(
    proposal({ diagrams: [{ title: "Bad", mermaidSource: "this is not mermaid", confidence: 1 }] }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, false);
  assert.ok((r.diagrams[0].reason ?? "").length > 0);
  assert.equal(r.ok, true); // artifacts + relation still apply
});

test("nothing acceptable ⇒ ok false with a batch error", () => {
  const r = validateBootstrapProposal(
    { summary: "", artifacts: [], relations: [], diagrams: [] },
    emptyCtx(),
  );
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
});
