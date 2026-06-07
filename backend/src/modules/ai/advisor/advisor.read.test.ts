// advisor.read.test.ts — pure mapping + staleness for a stored AiSession(ADVISOR)
// row → AdvisorResult. Mirrors review.read.test.ts. Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { toStoredAdvisorResult, type StoredAdvisorRow } from "./advisor.read.js";
import type { AdvisorReport } from "./advisor.types.js";
import type { AnalysisResult } from "../../exports/analysis/analysis.types.js";

const ANALYSIS = {} as unknown as AnalysisResult; // passed through untouched

const REPORT: AdvisorReport = {
  executiveSummary: "Investigate next.",
  focusAreas: [
    { title: "Unlinked security policy", detail: "policy not connected", evidence: [{ kind: "risk", ref: "finding:SECURITY_POLICY_NOT_LINKED" }] },
  ],
  opportunities: [],
  recommendations: [
    { title: "Link the policy", priority: "HIGH", rationale: "security", evidence: [{ kind: "risk", ref: "finding:SECURITY_POLICY_NOT_LINKED" }] },
  ],
};

const VERIFICATION = { totalRefs: 1, removedRefs: 0, discardedFindings: 0 };

function row(over: Partial<StoredAdvisorRow> = {}): StoredAdvisorRow {
  return {
    id: "a1",
    model: "claude-sonnet-4-6",
    promptTokens: 42,
    completionTokens: 1200,
    analysisHash: "HASH_A",
    createdAt: new Date("2026-06-07T12:00:00.000Z"),
    proposal: { report: REPORT, generatedAt: "2026-06-07T12:00:00.000Z", truncated: false, missingSections: [], verification: VERIFICATION },
    ...over,
  };
}

test("stale: stored hash differs from current ⇒ stale true", () => {
  const r = toStoredAdvisorResult(row(), ANALYSIS, "HASH_B");
  assert.equal(r.stale, true);
});

test("current: stored hash equals current ⇒ stale false", () => {
  const r = toStoredAdvisorResult(row(), ANALYSIS, "HASH_A");
  assert.equal(r.stale, false);
});

test("maps id, model, usage, generatedAt, report, analysisHash, verification", () => {
  const r = toStoredAdvisorResult(row(), ANALYSIS, "HASH_A");
  assert.equal(r.id, "a1");
  assert.equal(r.model, "claude-sonnet-4-6");
  assert.deepEqual(r.usage, { inputTokens: 42, outputTokens: 1200 });
  assert.equal(r.generatedAt, "2026-06-07T12:00:00.000Z");
  assert.equal(r.analysisHash, "HASH_A");
  assert.equal(r.report.executiveSummary, "Investigate next.");
  assert.equal(r.report.focusAreas.length, 1);
  assert.equal(r.report.recommendations.length, 1);
  assert.deepEqual(r.verification, VERIFICATION);
});

test("empty/null stored hash ⇒ not stale (cannot compare, no false alarm)", () => {
  assert.equal(toStoredAdvisorResult(row({ analysisHash: "" }), ANALYSIS, "HASH_B").stale, false);
  assert.equal(toStoredAdvisorResult(row({ analysisHash: null }), ANALYSIS, "HASH_B").stale, false);
});

test("carries truncation metadata from the stored payload", () => {
  const r = toStoredAdvisorResult(
    row({ proposal: { report: REPORT, truncated: true, missingSections: ["recommendations"] } }),
    ANALYSIS, "HASH_A",
  );
  assert.equal(r.truncated, true);
  assert.deepEqual(r.missingSections, ["recommendations"]);
});

test("missing payload report ⇒ empty report shell; generatedAt falls back to createdAt", () => {
  const r = toStoredAdvisorResult(row({ proposal: {} }), ANALYSIS, "HASH_A");
  assert.equal(r.report.executiveSummary, "");
  assert.deepEqual(r.report.focusAreas, []);
  assert.deepEqual(r.report.recommendations, []);
  assert.deepEqual(r.report.opportunities, []);
  assert.equal(r.generatedAt, "2026-06-07T12:00:00.000Z"); // createdAt ISO
  assert.deepEqual(r.verification, { totalRefs: 0, removedRefs: 0, discardedFindings: 0 });
});

test("an older-shape stored report (strengths/risks, no focusAreas) reads back without undefined", () => {
  // A row persisted under the pre-coach advisory contract: it has strengths/risks
  // and no focusAreas. The mapper must normalize to the current shape so the UI
  // never reads `.length` of undefined.
  const legacy = {
    report: {
      executiveSummary: "Legacy advisory.",
      strengths: [{ title: "S", detail: "d", evidence: [] }],
      risks: [{ title: "R", severity: "HIGH", detail: "d", evidence: [] }],
      opportunities: [{ title: "O", detail: "d", evidence: [] }],
      recommendations: [{ title: "Rec", priority: "HIGH", rationale: "r", evidence: [{ kind: "metric", ref: "health.score" }] }],
    },
    generatedAt: "2026-06-01T00:00:00.000Z",
  };
  const r = toStoredAdvisorResult(row({ proposal: legacy }), ANALYSIS, "HASH_A");
  assert.deepEqual(r.report.focusAreas, []); // absent field defaults to [], not undefined
  assert.equal(r.report.opportunities.length, 1); // same-shape field carries over
  assert.equal(r.report.recommendations.length, 1);
  assert.equal(r.report.executiveSummary, "Legacy advisory.");
  // Dropped sections are simply not present on the current shape.
  assert.equal((r.report as unknown as Record<string, unknown>).strengths, undefined);
});
