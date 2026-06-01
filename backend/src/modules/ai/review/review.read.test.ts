// review.read.test.ts — pure mapping + staleness. Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { hashAnalysis, toStoredReviewResult, type StoredReviewRow } from "./review.read.js";
import type { AnalysisResult } from "../../exports/analysis/analysis.types.js";

const ANALYSIS = {} as unknown as AnalysisResult; // passed through untouched

const REVIEW = {
  executiveSummary: "Assessment.",
  strengths: [], risks: [], blindSpots: [],
  governanceReview: [], validationCommentary: [], recommendations: [],
};

function row(over: Partial<StoredReviewRow> = {}): StoredReviewRow {
  return {
    id: "s1",
    model: "claude-sonnet-4-6",
    promptTokens: 23,
    completionTokens: 4000,
    analysisHash: "HASH_A",
    createdAt: new Date("2026-05-31T21:40:00.000Z"),
    proposal: { review: REVIEW, generatedAt: "2026-05-31T21:40:00.000Z", truncated: false, missingSections: [] },
    ...over,
  };
}

test("stale: stored hash differs from current ⇒ stale true", () => {
  const r = toStoredReviewResult(row(), ANALYSIS, "HASH_B");
  assert.equal(r.stale, true);
});

test("current: stored hash equals current ⇒ stale false", () => {
  const r = toStoredReviewResult(row(), ANALYSIS, "HASH_A");
  assert.equal(r.stale, false);
});

test("maps id, model, usage, generatedAt, review, analysisHash", () => {
  const r = toStoredReviewResult(row(), ANALYSIS, "HASH_A");
  assert.equal(r.id, "s1");
  assert.equal(r.model, "claude-sonnet-4-6");
  assert.deepEqual(r.usage, { inputTokens: 23, outputTokens: 4000 });
  assert.equal(r.generatedAt, "2026-05-31T21:40:00.000Z");
  assert.equal(r.analysisHash, "HASH_A");
  assert.equal(r.review.executiveSummary, "Assessment.");
});

test("empty stored hash ⇒ not stale (cannot compare, no false alarm)", () => {
  const r = toStoredReviewResult(row({ analysisHash: "" }), ANALYSIS, "HASH_B");
  assert.equal(r.stale, false);
  const r2 = toStoredReviewResult(row({ analysisHash: null }), ANALYSIS, "HASH_B");
  assert.equal(r2.stale, false);
});

test("carries truncation metadata from the stored payload", () => {
  const r = toStoredReviewResult(
    row({ proposal: { review: REVIEW, truncated: true, missingSections: ["recommendations"] } }),
    ANALYSIS, "HASH_A",
  );
  assert.equal(r.truncated, true);
  assert.deepEqual(r.missingSections, ["recommendations"]);
});

test("missing payload review ⇒ empty review shell; generatedAt falls back to createdAt", () => {
  const r = toStoredReviewResult(row({ proposal: {} }), ANALYSIS, "HASH_A");
  assert.equal(r.review.executiveSummary, "");
  assert.deepEqual(r.review.risks, []);
  assert.equal(r.generatedAt, "2026-05-31T21:40:00.000Z"); // createdAt ISO
});

// ── hashAnalysis: stable fingerprint of project STATE, not assembly time ──

const baseAnalysis = (over: Record<string, unknown> = {}) => ({
  meta: { generatedAt: "2026-01-01T00:00:00.000Z", projectId: "p1", emptyProject: false },
  health: { score: 72 },
  ...over,
}) as unknown;

test("hashAnalysis ignores meta.generatedAt (same state ⇒ same hash)", () => {
  const h1 = hashAnalysis(baseAnalysis());
  const h2 = hashAnalysis(baseAnalysis({ meta: { generatedAt: "2026-12-31T23:59:59.000Z", projectId: "p1", emptyProject: false } }));
  assert.equal(h1, h2, "timestamp must not affect the hash");
});

test("hashAnalysis changes when substantive analysis changes", () => {
  const h1 = hashAnalysis(baseAnalysis({ health: { score: 72 } }));
  const h2 = hashAnalysis(baseAnalysis({ health: { score: 51 } }));
  assert.notEqual(h1, h2, "a different score must change the hash");
});

test("hashAnalysis is deterministic", () => {
  assert.equal(hashAnalysis(baseAnalysis()), hashAnalysis(baseAnalysis()));
});
