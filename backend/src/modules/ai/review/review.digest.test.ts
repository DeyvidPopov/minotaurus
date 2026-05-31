// review.digest.test.ts — pure-logic tests for the ReviewDigest builder.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviewDigest, collectEvidenceKeys, REVIEW_DIGEST_CAP } from "./review.digest.js";
import type { AnalysisResult, ExportSnapshot } from "../../exports/analysis/analysis.types.js";

function analysis(over: Partial<AnalysisResult> = {}): AnalysisResult {
  const sub = { documentation: 80, connectivity: 70, traceability: 60, validation: 90, governance: 50 };
  const weights = { documentation: 0.2, connectivity: 0.2, traceability: 0.2, validation: 0.25, governance: 0.15 };
  return {
    meta: { generatedAt: "2026-01-01T00:00:00.000Z", projectId: "p1", emptyProject: false },
    health: { score: 72, grade: "C", label: "Fair", subScores: sub, weights },
    documentation: {
      coveragePct: 65, documentedCount: 13, total: 20,
      byType: { SERVICE: 70 }, byStatus: { ACTIVE: 80 },
      undocumented: [], descriptive: { apiSpec: null, endpoint: null, databaseModel: null, diagram: null },
    },
    connectivity: {
      avgDegree: 2.1, orphanCount: 0, orphans: [], overCoupled: [], hubs: [],
      relationMix: { USES: 8, DEPENDS_ON: 3 },
    },
    traceability: {
      requirementCoverage: 0.5, unimplementedRequirements: [], resourceLinkage: 0.9, unlinkedResources: [],
    },
    governance: {
      memberCount: 3, roleDistribution: { OWNER: 1, DEVELOPER: 2 }, lastValidatedAt: "2026-01-01T00:00:00.000Z",
      signals: [{ label: "Has owner", passed: true, evidence: "ownerId set" }],
    },
    validation: { openCount: 4, bySeverity: { ERROR: 1, WARNING: 3 }, byCategory: { DOCS: 4 }, weightedIssues: 11 },
    risks: [],
    ...over,
  };
}

function snapshot(over: Partial<ExportSnapshot> = {}): ExportSnapshot {
  return {
    project: { id: "p1", name: "Acme", description: "An app", ownerId: "u1" },
    generatedAt: "2026-01-01T00:00:00.000Z",
    artifacts: [
      { id: "a1", title: "Player Management", type: "SERVICE", status: "ACTIVE" },
      { id: "a2", title: "Auth", type: "SERVICE", status: "DRAFT" },
      { id: "a3", title: "Login required", type: "REQUIREMENT", status: "ACTIVE" },
    ],
    ...over,
  };
}

test("digest carries the deterministic health metrics verbatim", () => {
  const d = buildReviewDigest(analysis(), snapshot());
  assert.equal(d.health.score, 72);
  assert.equal(d.health.grade, "C");
  assert.equal(d.health.subScores.validation, 90);
  assert.equal(d.documentation.coveragePct, 65);
  assert.equal(d.validation.openCount, 4);
  assert.equal(d.project.name, "Acme");
});

test("counts.byType / byStatus are histograms derived from the snapshot (key-sorted)", () => {
  const d = buildReviewDigest(analysis(), snapshot());
  assert.deepEqual(d.counts.byType, { REQUIREMENT: 1, SERVICE: 2 });
  assert.deepEqual(d.counts.byStatus, { ACTIVE: 2, DRAFT: 1 });
  assert.equal(d.counts.artifacts, 20); // from AnalysisResult.documentation.total
  assert.equal(d.counts.relations, 11); // sum of relationMix
});

test("long lists are capped to REVIEW_DIGEST_CAP but keep the true total", () => {
  const orphans = Array.from({ length: 15 }, (_, i) => ({ id: `o${i}`, title: `Orphan ${i}`, type: "SERVICE" }));
  const d = buildReviewDigest(analysis({
    connectivity: { ...analysis().connectivity, orphanCount: 15, orphans },
  }), snapshot());
  assert.equal(d.connectivity.orphans.total, 15);
  assert.equal(d.connectivity.orphans.shown.length, REVIEW_DIGEST_CAP);
  assert.equal(d.connectivity.orphans.shown[0].id, "o0");
});

test("evidenceKeys include fixed metric paths, keyed maps, and SHOWN ids only", () => {
  const orphans = Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, title: `Orphan ${i}`, type: "SERVICE" }));
  const d = buildReviewDigest(analysis({
    connectivity: { ...analysis().connectivity, orphanCount: 12, orphans },
    risks: [{ id: "r1", ruleId: "ORPHAN_ARTIFACT", severity: "WARNING", message: "x", evidence: [] }],
  }), snapshot());
  const keys = new Set(d.evidenceKeys);
  assert.ok(keys.has("health.score"));
  assert.ok(keys.has("counts.byType.SERVICE"));
  assert.ok(keys.has("validation.bySeverity.ERROR"));
  assert.ok(keys.has("governance.roleDistribution.OWNER"));
  assert.ok(keys.has("o0"), "a shown orphan id is citable");
  assert.ok(!keys.has("o11"), "a capped (unseen) orphan id is NOT citable");
  assert.ok(keys.has("r1") && keys.has("ORPHAN_ARTIFACT"), "risk id + ruleId citable");
});

test("deterministic: same inputs produce a deep-equal digest", () => {
  const a = analysis();
  const s = snapshot();
  assert.deepEqual(buildReviewDigest(a, s), buildReviewDigest(a, s));
});

test("collectEvidenceKeys output is sorted", () => {
  const d = buildReviewDigest(analysis(), snapshot());
  const sorted = [...d.evidenceKeys].sort();
  assert.deepEqual(d.evidenceKeys, sorted);
});
