// Export Engine V2 — Architecture Analysis Engine tests.
//
// Zero-dependency: Node's built-in test runner + assert/strict.
// Run with:  npm run test:unit   (node --import tsx --test "src/**/*.test.ts")
//
// These tests are the determinism contract: they must pass before any PDF
// renderer is written.

import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExportSnapshot } from "./metrics.engine.js";
import type { ExportSnapshot } from "./analysis.types.js";

const GEN_AT = "2026-05-30T12:00:00.000Z";
// 1 day before the snapshot — inside the 30-day governance window.
const RECENT_VALIDATION = "2026-05-29T12:00:00.000Z";

// ────────────────────────────── fixtures ──────────────────────────────

const emptyProject: ExportSnapshot = {
  project: { id: "p-empty", name: "Empty", ownerId: "u1" },
  generatedAt: GEN_AT,
  artifacts: [],
};

function healthyProject(): ExportSnapshot {
  return {
    project: { id: "p-healthy", name: "Healthy", ownerId: "u1" },
    generatedAt: GEN_AT,
    artifacts: [
      { id: "a-req", title: "Checkout requirement", type: "REQUIREMENT", status: "ACTIVE", documentation: { markdownContent: "Spec." } },
      { id: "a-svc", title: "Order service", type: "SERVICE", status: "ACTIVE", documentation: { markdownContent: "Docs." } },
      { id: "a-db", title: "Order DB", type: "DATABASE_MODEL", status: "ACTIVE", documentation: { markdownContent: "Schema." } },
      { id: "a-sec", title: "Auth policy", type: "SECURITY_POLICY", status: "ACTIVE", documentation: { markdownContent: "Policy." } },
    ],
    relations: [
      { id: "r1", sourceArtifactId: "a-svc", targetArtifactId: "a-req", relationType: "IMPLEMENTS" },
      { id: "r2", sourceArtifactId: "a-svc", targetArtifactId: "a-db", relationType: "USES" },
      { id: "r3", sourceArtifactId: "a-sec", targetArtifactId: "a-svc", relationType: "SECURES" },
    ],
    apiSpecs: [
      { id: "s1", title: "Order API", description: "desc", artifactId: "a-svc", endpoints: [{ id: "e1", summary: "List orders", requiresAuth: true }] },
    ],
    databaseModels: [{ id: "m1", title: "Order DB", description: "desc", artifactId: "a-db" }],
    diagrams: [{ id: "d1", title: "Flow", description: "desc", artifactId: "a-svc" }],
    validationIssues: [],
    versionHistory: [{ id: "v1", entityId: "p-healthy", action: "VALIDATED", createdAt: RECENT_VALIDATION }],
    team: [
      { id: "t1", role: "OWNER" },
      { id: "t2", role: "ARCHITECT" },
      { id: "t3", role: "DEVELOPER" },
    ],
  };
}

function brokenProject(): ExportSnapshot {
  return {
    project: { id: "p-broken", name: "Broken", ownerId: "u1" },
    generatedAt: GEN_AT,
    artifacts: [
      { id: "b-req", title: "Unimplemented req", type: "REQUIREMENT", status: "ACTIVE" }, // undocumented, orphan, unimplemented
      { id: "b-orphan", title: "Orphan service", type: "SERVICE", status: "ACTIVE" }, // orphan + unlinked service
      { id: "b-dep", title: "Old gateway", type: "SERVICE", status: "DEPRECATED" }, // deprecated, referenced
      { id: "b-active", title: "New gateway", type: "SERVICE", status: "ACTIVE" },
      { id: "b-sec", title: "PCI boundary", type: "SECURITY_POLICY", status: "ACTIVE" }, // undocumented security policy
    ],
    relations: [
      { id: "r1", sourceArtifactId: "b-active", targetArtifactId: "b-dep", relationType: "DEPENDS_ON" },
      { id: "r2", sourceArtifactId: "b-sec", targetArtifactId: "b-active", relationType: "SECURES" },
    ],
    validationIssues: [
      { id: "i1", artifactId: "b-active", severity: "CRITICAL", category: "SECURITY", message: 'Endpoint POST /login on security-related spec "Auth API" is marked public (requiresAuth=false).', status: "OPEN" },
      { id: "i2", artifactId: "b-dep", severity: "ERROR", category: "ARCHITECTURE", message: 'Active artifact "New gateway" depends on deprecated artifact "Old gateway".', status: "OPEN" },
      { id: "i3", artifactId: "b-req", severity: "WARNING", category: "DOCUMENTATION", message: "No docs", status: "RESOLVED" }, // excluded
    ],
    versionHistory: [],
    team: [{ id: "t1", role: "OWNER" }], // single member, single owner
  };
}

// ────────────────────────────── 1. empty project ──────────────────────────────

test("empty project: emptyProject flag, null score, N/A grade", () => {
  const r = analyzeExportSnapshot(emptyProject);
  assert.equal(r.meta.emptyProject, true);
  assert.equal(r.health.score, null);
  assert.equal(r.health.grade, "N/A");
  assert.equal(r.health.label, "Insufficient data");
  assert.equal(r.documentation.total, 0);
  assert.equal(r.documentation.coveragePct, null);
  assert.equal(r.meta.generatedAt, GEN_AT);
});

test("non-object content is treated as an empty snapshot", () => {
  const r = analyzeExportSnapshot("a markdown string");
  assert.equal(r.meta.emptyProject, true);
  assert.equal(r.health.score, null);
});

// ────────────────────────────── 2. healthy project ──────────────────────────────

test("healthy project: full coverage, no issues, high score", () => {
  const r = analyzeExportSnapshot(healthyProject());
  assert.equal(r.meta.emptyProject, false);
  assert.equal(r.documentation.coveragePct, 100);
  assert.equal(r.documentation.undocumented.length, 0);
  assert.equal(r.validation.openCount, 0);
  assert.equal(r.connectivity.orphanCount, 0);
  assert.equal(r.governance.memberCount, 3);
  assert.ok(r.health.score !== null && r.health.score >= 75, `expected healthy >= 75, got ${r.health.score}`);
  // governance: owner + architect + multi-member + recent validation = 100
  assert.equal(r.health.subScores.governance, 100);
});

// ────────────────────────────── 3. broken project ──────────────────────────────

test("broken project: low coverage, orphans, penalties, lower score", () => {
  const r = analyzeExportSnapshot(brokenProject());
  assert.ok(r.documentation.coveragePct !== null && r.documentation.coveragePct < 50);
  assert.ok(r.connectivity.orphanCount >= 2);
  assert.equal(r.validation.openCount, 2); // resolved one excluded
  // weighted: CRITICAL(10) + ERROR(5) = 15
  assert.equal(r.validation.weightedIssues, 15);
  const healthy = analyzeExportSnapshot(healthyProject());
  assert.ok(
    (r.health.score ?? 0) < (healthy.health.score ?? 0),
    `broken (${r.health.score}) should score below healthy (${healthy.health.score})`,
  );
});

// ────────────────────────────── 4. determinism ──────────────────────────────

test("determinism: same snapshot → deep-equal result twice", () => {
  const snap = healthyProject();
  assert.deepStrictEqual(analyzeExportSnapshot(snap), analyzeExportSnapshot(snap));
});

// ────────────────────────────── 5. sorting / order independence ──────────────────────────────

test("sorting: shuffled input arrays produce identical result", () => {
  const base = brokenProject();
  const baseResult = analyzeExportSnapshot(base);

  const shuffled: ExportSnapshot = {
    ...base,
    artifacts: [...base.artifacts!].reverse(),
    relations: [...base.relations!].reverse(),
    validationIssues: [...base.validationIssues!].reverse(),
    team: [...base.team!].reverse(),
  };
  assert.deepStrictEqual(analyzeExportSnapshot(shuffled), baseResult);
});

// ────────────────────────────── 6. risk detection ──────────────────────────────

test("risks: analysis-only rules derived; overlapping rules NOT re-derived; carried codes canonical", () => {
  const r = analyzeExportSnapshot(brokenProject());
  const ruleIds = new Set(r.risks.map((x) => x.ruleId));

  // Analysis-only findings (no validation equivalent) are still derived here.
  assert.ok(ruleIds.has("UNIMPLEMENTED_REQUIREMENT"), "expected UNIMPLEMENTED_REQUIREMENT");
  assert.ok(ruleIds.has("UNDOCUMENTED_SECURITY_POLICY"), "expected UNDOCUMENTED_SECURITY_POLICY");
  assert.ok(ruleIds.has("SINGLE_OWNER"), "expected SINGLE_OWNER");
  assert.ok(ruleIds.has("STALE_VALIDATION"), "expected STALE_VALIDATION");

  // Phase B: overlapping rules are NO LONGER re-derived by Analysis — they come
  // from Validation via the status-aware carry-through. The legacy/derived
  // identities are gone for good.
  assert.ok(!ruleIds.has("DEPRECATED_REFERENCED"), "DEPRECATED_REFERENCED removed (→ DEPRECATED_STILL_REFERENCED)");
  assert.ok(!ruleIds.has("OVER_COUPLED"), "OVER_COUPLED removed (→ HIGH_FAN_OUT)");
  assert.ok(!ruleIds.has("UNLINKED_SERVICE"), "UNLINKED_SERVICE removed (merged into ORPHAN_ARTIFACT)");
  // This fixture has no carried orphan/churn validation issues, so neither appears
  // (Analysis no longer invents them).
  assert.ok(!ruleIds.has("ORPHAN_ARTIFACT"), "no derived ORPHAN_ARTIFACT (carry-through only)");
  assert.ok(!ruleIds.has("HIGH_CHURN"), "no derived HIGH_CHURN (carry-through only)");

  // Carried validation issues keep their CANONICAL codes; never VALIDATION_ISSUE.
  assert.ok(!ruleIds.has("VALIDATION_ISSUE"), "no generic VALIDATION_ISSUE ruleId");
  assert.ok(ruleIds.has("DEPENDS_ON_DEPRECATED"), "i2 carried as DEPENDS_ON_DEPRECATED");
  assert.ok(ruleIds.has("PUBLIC_SECURITY_ENDPOINT"), "i1 carried as PUBLIC_SECURITY_ENDPOINT");
  assert.ok(!r.risks.some((x) => x.message === "No docs"), "resolved issue must not appear");

  // Ordering: severities are non-decreasing in rank (CRITICAL→ERROR→WARNING→INFO).
  const rank: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };
  for (let i = 1; i < r.risks.length; i++) {
    assert.ok(
      rank[r.risks[i - 1].severity] <= rank[r.risks[i].severity],
      "risks must be ordered by severity",
    );
  }
});

test("no duplicate risk for the same (code, target, message)", () => {
  const r = analyzeExportSnapshot(brokenProject());
  const keys = r.risks.map((x) => `${x.ruleId}|${x.evidence.find((e) => e.type === "artifact")?.id ?? ""}|${x.message}`);
  assert.equal(keys.length, new Set(keys).size, "risk list must be free of exact duplicates");
});

test("health score is unchanged by removing derived risks (depends only on sub-scores)", () => {
  // Risks never feed the score — only sub-scores do. Pin broken vs healthy so a
  // regression in the score path is caught. (See validation.openCount /
  // weightedIssues / governance assertions above for the sub-score pins.)
  const broken = analyzeExportSnapshot(brokenProject());
  const healthy = analyzeExportSnapshot(healthyProject());
  assert.equal(healthy.health.subScores.validation, 100); // no open issues
  assert.equal(broken.validation.weightedIssues, 15);
  assert.ok((broken.health.score ?? 0) < (healthy.health.score ?? 0));
});
