// Export Engine V2 — report composition tests.

import test from "node:test";
import assert from "node:assert/strict";
import { buildReportPlan } from "./report-plan.js";
import { analyzeExportSnapshot } from "../analysis/metrics.engine.js";
import type { ExportSnapshot } from "../analysis/analysis.types.js";

const GEN = "2026-05-30T12:00:00.000Z";

// A populated snapshot so data-dependent gates (traceability) can pass.
function fullSnapshot(): ExportSnapshot {
  return {
    project: { id: "p1", name: "Shop", ownerId: "u1" },
    generatedAt: GEN,
    artifacts: [
      { id: "a1", title: "Req", type: "REQUIREMENT", status: "ACTIVE", documentation: { markdownContent: "x" } },
      { id: "a2", title: "Svc", type: "SERVICE", status: "ACTIVE" },
    ],
    relations: [{ id: "r1", sourceArtifactId: "a2", targetArtifactId: "a1", relationType: "IMPLEMENTS" }],
    apiSpecs: [{ id: "s1", title: "API", artifactId: "a2", endpoints: [{ id: "e1", summary: "x" } as never] }],
    databaseModels: [{ id: "m1", title: "DB", artifactId: "a2" }],
    diagrams: [{ id: "d1", title: "Flow", type: "FLOWCHART", mermaidSource: "flowchart TD\n A-->B" }],
    validationIssues: [{ id: "i1", artifactId: "a2", severity: "ERROR", category: "API", message: "m", status: "OPEN" }],
    versionHistory: [{ id: "v1", entityId: "p1", action: "VALIDATED", createdAt: GEN }],
    team: [{ id: "t1", role: "OWNER" }, { id: "t2", role: "ARCHITECT" }],
    aiReview: {
      review: {
        generatedAt: GEN, model: "m", stale: false, truncated: false, unverifiedCount: 0,
        executiveSummary: "ok", strengths: [], risks: [], blindSpots: [],
        governanceReview: [], validationCommentary: [], recommendations: [],
      },
    },
  };
}

function planFor(sections: string[], snap = fullSnapshot()) {
  return buildReportPlan(sections, analyzeExportSnapshot(snap), snap);
}

test("full export (all sections) renders the whole report", () => {
  const p = planFor(["ARTIFACTS", "RELATIONS", "API_SPECS", "DATABASE_MODELS", "DIAGRAMS", "VALIDATION", "VERSION_HISTORY", "TEAM", "IMPACT_ANALYSIS", "AI_REVIEW"]);
  assert.equal(p.diagramsOnly, false);
  assert.equal(p.reportTitle, "Architecture Intelligence Report");
  for (const k of Object.keys(p.include) as (keyof typeof p.include)[]) {
    assert.equal(p.include[k], true, `expected ${k} included in full export`);
  }
});

test("empty sections = full report (back-compat)", () => {
  const p = planFor([]);
  assert.equal(p.diagramsOnly, false);
  assert.equal(p.include.healthDashboard, true);
  assert.equal(p.include.governance, true);
});

test("DIAGRAMS-only: diagram section + metadata, NO architecture pages", () => {
  const p = planFor(["DIAGRAMS"]);
  assert.equal(p.diagramsOnly, true);
  assert.equal(p.reportTitle, "Architecture Diagram Report");
  assert.equal(p.include.diagrams, true);
  // none of the architecture sections
  assert.equal(p.include.executiveSummary, false);
  assert.equal(p.include.healthDashboard, false);
  assert.equal(p.include.narrative, false);
  assert.equal(p.include.documentationCoverage, false);
  assert.equal(p.include.graphInsights, false);
  assert.equal(p.include.risks, false);
  assert.equal(p.include.validationFindings, false);
  assert.equal(p.include.traceability, false);
  assert.equal(p.include.governance, false);
  assert.equal(p.include.versionHistory, false);
  assert.equal(p.include.appendix, false);
  // cover shows diagram count, not health
  assert.equal(p.cover.showHealth, false);
  assert.equal(p.cover.showDiagramCount, true);
});

test("VALIDATION-only: validation findings + its appendix, no governance/health", () => {
  const p = planFor(["VALIDATION"]);
  assert.equal(p.include.validationFindings, true);
  assert.equal(p.include.appendixValidation, true);
  assert.equal(p.include.appendix, true);
  assert.equal(p.include.healthDashboard, false);
  assert.equal(p.include.governance, false);
  assert.equal(p.include.diagrams, false);
  // risks need ARTIFACTS+RELATIONS too, so not on validation-only
  assert.equal(p.include.risks, false);
  assert.equal(p.cover.showFindings, true);
  assert.equal(p.cover.showHealth, false);
});

test("TEAM-only: governance only", () => {
  const p = planFor(["TEAM"]);
  assert.equal(p.include.governance, true);
  assert.equal(p.include.healthDashboard, false);
  assert.equal(p.include.validationFindings, false);
  assert.equal(p.include.diagrams, false);
  assert.equal(p.include.appendix, false);
});

test("ARTIFACTS+RELATIONS+VALIDATION enables risks and narrative", () => {
  const p = planFor(["ARTIFACTS", "RELATIONS", "VALIDATION"]);
  assert.equal(p.include.risks, true);
  assert.equal(p.include.narrative, true);
  assert.equal(p.include.graphInsights, true);
  assert.equal(p.include.governance, false); // no TEAM
});

test("traceability skipped when no traceability data exists", () => {
  // ARTIFACTS+RELATIONS selected, but no requirements and no linkable resources.
  const snap: ExportSnapshot = {
    project: { id: "p1", name: "Shop", ownerId: "u1" },
    generatedAt: GEN,
    artifacts: [{ id: "a1", title: "Svc", type: "SERVICE", status: "ACTIVE" }],
    relations: [],
    diagrams: [],
    validationIssues: [],
    versionHistory: [],
    team: [],
  };
  const p = planFor(["ARTIFACTS", "RELATIONS"], snap);
  assert.equal(p.include.traceability, false);
});

test("empty diagrams project: still diagrams-only + compact (no arch pages)", () => {
  const snap: ExportSnapshot = {
    project: { id: "p0", name: "Empty", ownerId: "u1" },
    generatedAt: GEN,
    artifacts: [],
    diagrams: [],
  };
  const p = planFor(["DIAGRAMS"], snap);
  assert.equal(p.diagramsOnly, true);
  assert.equal(p.include.diagrams, true); // section renders, shows a "no diagrams" note
  assert.equal(p.include.healthDashboard, false);
  assert.equal(p.include.executiveSummary, false);
});

test("composition is deterministic", () => {
  const a = planFor(["DIAGRAMS", "VALIDATION"]);
  const b = planFor(["DIAGRAMS", "VALIDATION"]);
  assert.deepEqual(a, b);
});
