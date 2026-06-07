// advisor.verify.test.ts — pure-logic tests for advisor evidence verification.
// Policy is STRICTER than AI Review: an item with no verifiable evidence is
// DISCARDED (not flagged). Recommendations are also ordered by priority + capped.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyAdvisorEvidence, MAX_RECOMMENDATIONS } from "./advisor.verify.js";
import type { AdvisorReport, ReviewDigest } from "./advisor.types.js";

function digest(keys: string[]): ReviewDigest {
  // Only `evidenceKeys` matters to the verifier; the rest is structural filler.
  return {
    project: { id: "p1", name: "x", description: "" },
    health: { score: 50, grade: "D", label: "At Risk", subScores: {} as never, weights: {} as never },
    counts: { artifacts: 1, relations: 0, byType: {}, byStatus: {} },
    documentation: { coveragePct: 0, documentedCount: 0, total: 1 },
    validation: { openCount: 0, bySeverity: {}, byCategory: {}, weightedIssues: 0 },
    governance: { memberCount: 1, roleDistribution: {}, lastValidatedAt: null, signals: [] },
    traceability: {
      requirementCoverage: null, resourceLinkage: null,
      unimplementedRequirements: { total: 0, shown: [] }, unlinkedResources: { total: 0, shown: [] },
    },
    connectivity: {
      avgDegree: null, orphanCount: 0,
      orphans: { total: 0, shown: [] }, overCoupled: { total: 0, shown: [] }, hubs: { total: 0, shown: [] },
      relationMix: {},
    },
    undocumented: { total: 0, shown: [] },
    apiIntel: {
      totalEndpoints: 0, endpointPayloadCoveragePct: null, fieldMappingCoveragePct: null,
      sensitiveExposureCount: 0, publicEndpointRiskCount: 0,
    },
    risks: { total: 0, shown: [] },
    evidenceKeys: keys,
    cap: 10,
  };
}

function report(over: Partial<AdvisorReport> = {}): AdvisorReport {
  return {
    executiveSummary: "A snapshot.",
    focusAreas: [],
    opportunities: [],
    recommendations: [],
    ...over,
  };
}

test("a recommendation with valid evidence is kept (evidence is required and verifiable)", () => {
  const r = report({
    recommendations: [{
      title: "Reduce coupling", priority: "HIGH", rationale: "fan-out is high",
      evidence: [{ kind: "risk", ref: "finding:HIGH_FAN_OUT" }],
    }],
  });
  const out = verifyAdvisorEvidence(r, digest(["finding:HIGH_FAN_OUT"]));
  assert.equal(out.report.recommendations.length, 1);
  assert.equal(out.report.recommendations[0].evidence.length, 1);
  assert.equal(out.discardedFindings, 0);
  assert.equal(out.removedRefs, 0);
});

test("an unsupported recommendation (no resolvable evidence) is DISCARDED, not flagged", () => {
  const r = report({
    recommendations: [{
      title: "Invented step", priority: "HIGH", rationale: "...",
      evidence: [{ kind: "metric", ref: "totally.invented.metric" }],
    }],
  });
  const out = verifyAdvisorEvidence(r, digest(["health.score"]));
  assert.equal(out.report.recommendations.length, 0, "discarded entirely");
  assert.equal(out.discardedFindings, 1);
  assert.equal(out.removedRefs, 1);
  assert.equal(out.totalRefs, 1);
});

test("a recommendation with NO evidence at all is discarded", () => {
  const r = report({
    recommendations: [{ title: "No evidence", priority: "MEDIUM", rationale: "...", evidence: [] }],
  });
  const out = verifyAdvisorEvidence(r, digest(["health.score"]));
  assert.equal(out.report.recommendations.length, 0);
  assert.equal(out.discardedFindings, 1);
});

test("discard applies to every section: focusAreas, opportunities, recommendations", () => {
  const r = report({
    focusAreas: [{ title: "Bad", detail: "x", evidence: [{ kind: "metric", ref: "nope" }] }],
    opportunities: [{ title: "Bad", detail: "x", evidence: [] }],
    recommendations: [{ title: "Bad", priority: "HIGH", rationale: "x", evidence: [{ kind: "metric", ref: "also.nope" }] }],
  });
  const out = verifyAdvisorEvidence(r, digest(["health.score"]));
  assert.equal(out.report.focusAreas.length, 0);
  assert.equal(out.report.opportunities.length, 0);
  assert.equal(out.report.recommendations.length, 0);
  assert.equal(out.discardedFindings, 3);
});

test("mixed evidence: invalid refs dropped, item kept if at least one resolves", () => {
  const r = report({
    focusAreas: [{
      title: "Security gap", detail: "policy not linked",
      evidence: [
        { kind: "risk", ref: "finding:SECURITY_POLICY_NOT_LINKED" },
        { kind: "metric", ref: "nope.not.real" },
      ],
    }],
  });
  const out = verifyAdvisorEvidence(r, digest(["finding:SECURITY_POLICY_NOT_LINKED"]));
  assert.equal(out.report.focusAreas.length, 1);
  assert.equal(out.report.focusAreas[0].evidence.length, 1);
  assert.equal(out.report.focusAreas[0].evidence[0].ref, "finding:SECURITY_POLICY_NOT_LINKED");
  assert.equal(out.removedRefs, 1);
  assert.equal(out.discardedFindings, 0);
});

test("recommendations are ordered HIGH → MEDIUM → LOW regardless of model order", () => {
  const r = report({
    recommendations: [
      { title: "low", priority: "LOW", rationale: "r", evidence: [{ kind: "metric", ref: "k" }] },
      { title: "high", priority: "HIGH", rationale: "r", evidence: [{ kind: "metric", ref: "k" }] },
      { title: "medium", priority: "MEDIUM", rationale: "r", evidence: [{ kind: "metric", ref: "k" }] },
    ],
  });
  const out = verifyAdvisorEvidence(r, digest(["k"]));
  assert.deepEqual(out.report.recommendations.map((x) => x.title), ["high", "medium", "low"]);
});

test("equal-priority recommendations keep the model's relative order (stable sort)", () => {
  const r = report({
    recommendations: [
      { title: "h1", priority: "HIGH", rationale: "r", evidence: [{ kind: "metric", ref: "k" }] },
      { title: "h2", priority: "HIGH", rationale: "r", evidence: [{ kind: "metric", ref: "k" }] },
      { title: "h3", priority: "HIGH", rationale: "r", evidence: [{ kind: "metric", ref: "k" }] },
    ],
  });
  const out = verifyAdvisorEvidence(r, digest(["k"]));
  assert.deepEqual(out.report.recommendations.map((x) => x.title), ["h1", "h2", "h3"]);
});

test("recommendation count is capped at MAX_RECOMMENDATIONS", () => {
  const recs = Array.from({ length: 9 }, (_, i) => ({
    title: `rec${i}`, priority: "MEDIUM" as const, rationale: "r",
    evidence: [{ kind: "metric" as const, ref: "k" }],
  }));
  const out = verifyAdvisorEvidence(report({ recommendations: recs }), digest(["k"]));
  assert.equal(out.report.recommendations.length, MAX_RECOMMENDATIONS);
  assert.equal(MAX_RECOMMENDATIONS, 5);
});

test("the verifier never mutates the model's prose", () => {
  const r = report({
    executiveSummary: "Original snapshot stays.",
    focusAreas: [{ title: "T", detail: "Original detail.", evidence: [{ kind: "metric", ref: "k" }] }],
  });
  const out = verifyAdvisorEvidence(r, digest(["k"]));
  assert.equal(out.report.executiveSummary, "Original snapshot stays.");
  assert.equal(out.report.focusAreas[0].detail, "Original detail.");
});

test("deterministic: same inputs produce a deep-equal verified report", () => {
  const r = report({
    focusAreas: [{ title: "F", detail: "d", evidence: [{ kind: "risk", ref: "finding:ORPHAN_ARTIFACT" }] }],
    recommendations: [
      { title: "b", priority: "MEDIUM", rationale: "r", evidence: [{ kind: "metric", ref: "validation.openCount" }] },
      { title: "a", priority: "HIGH", rationale: "r", evidence: [{ kind: "metric", ref: "validation.openCount" }] },
    ],
  });
  const d = digest(["finding:ORPHAN_ARTIFACT", "validation.openCount"]);
  assert.deepEqual(verifyAdvisorEvidence(r, d), verifyAdvisorEvidence(r, d));
});

test("empty project / empty report verifies cleanly to an empty advisory", () => {
  const out = verifyAdvisorEvidence(report(), digest([]));
  assert.equal(out.report.focusAreas.length, 0);
  assert.equal(out.report.opportunities.length, 0);
  assert.equal(out.report.recommendations.length, 0);
  assert.equal(out.totalRefs, 0);
  assert.equal(out.removedRefs, 0);
  assert.equal(out.discardedFindings, 0);
  assert.equal(out.report.executiveSummary, "A snapshot.");
});
