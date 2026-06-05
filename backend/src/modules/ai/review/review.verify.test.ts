// review.verify.test.ts — pure-logic tests for evidence verification + schema.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyReviewEvidence } from "./review.verify.js";
import { architectureReviewSchema } from "./review.schema.js";
import type { ArchitectureReview, ReviewDigest } from "./review.types.js";

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

function review(over: Partial<ArchitectureReview> = {}): ArchitectureReview {
  return {
    executiveSummary: "An assessment.",
    strengths: [],
    risks: [],
    blindSpots: [],
    governanceReview: [],
    validationCommentary: [],
    recommendations: [],
    ...over,
  };
}

test("valid evidence refs are kept; the finding is verified", () => {
  const r = review({
    strengths: [{ title: "Good docs", observation: "65% coverage", evidence: [{ kind: "metric", ref: "documentation.coveragePct", value: 65 }] }],
  });
  const out = verifyReviewEvidence(r, digest(["documentation.coveragePct"]));
  assert.equal(out.removedRefs, 0);
  assert.equal(out.review.strengths[0].evidence.length, 1);
  assert.equal(out.review.strengths[0].unverified, false);
  assert.equal(out.unverifiedFindings, 0);
});

test("unknown evidence refs are removed; finding with no surviving evidence is flagged unverified", () => {
  const r = review({
    risks: [{
      title: "Made-up risk", severity: "HIGH", observation: "...", recommendation: "...",
      evidence: [{ kind: "metric", ref: "totally.invented.metric" }],
    }],
  });
  const out = verifyReviewEvidence(r, digest(["health.score"]));
  assert.equal(out.totalRefs, 1);
  assert.equal(out.removedRefs, 1);
  assert.equal(out.review.risks[0].evidence.length, 0);
  assert.equal(out.review.risks[0].unverified, true);
  assert.equal(out.unverifiedFindings, 1);
});

test("mixed evidence: valid kept, invalid dropped, finding stays verified", () => {
  const r = review({
    recommendations: [{
      title: "Add policy", priority: "HIGH", recommendation: "Add a SECURITY_POLICY",
      evidence: [
        { kind: "count", ref: "counts.byType.SERVICE", value: 12 },
        { kind: "metric", ref: "nope.not.real" },
      ],
    }],
  });
  const out = verifyReviewEvidence(r, digest(["counts.byType.SERVICE"]));
  assert.equal(out.removedRefs, 1);
  assert.equal(out.review.recommendations[0].evidence.length, 1);
  assert.equal(out.review.recommendations[0].evidence[0].ref, "counts.byType.SERVICE");
  assert.equal(out.review.recommendations[0].unverified, false);
});

test("verifier never mutates the model's prose", () => {
  const r = review({
    strengths: [{ title: "T", observation: "Original prose stays.", evidence: [{ kind: "metric", ref: "bad" }] }],
  });
  const out = verifyReviewEvidence(r, digest([]));
  assert.equal(out.review.strengths[0].observation, "Original prose stays.");
  assert.equal(out.review.executiveSummary, "An assessment.");
});

// ── schema ──

test("architectureReviewSchema accepts a well-formed minimal review", () => {
  const parsed = architectureReviewSchema.safeParse(review());
  assert.equal(parsed.success, true);
});

test("architectureReviewSchema rejects an unsupported shape (missing executiveSummary)", () => {
  const { executiveSummary, ...rest } = review();
  void executiveSummary;
  const parsed = architectureReviewSchema.safeParse(rest);
  assert.equal(parsed.success, false);
});

test("architectureReviewSchema rejects a risk missing its required recommendation", () => {
  const bad = review({
    risks: [{ title: "R", severity: "HIGH", observation: "o", evidence: [] } as never],
  });
  const parsed = architectureReviewSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});
