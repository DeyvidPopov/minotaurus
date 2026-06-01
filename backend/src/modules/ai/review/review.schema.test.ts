// review.schema.test.ts — the bounded output contract + compact digest prompt.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { architectureReviewSchema } from "./review.schema.js";
import { buildReviewUserPrompt } from "./review.prompt.js";
import type { ReviewDigest } from "./review.types.js";

const strength = () => ({ title: "S", observation: "ok", evidence: [] as unknown[] });
const risk = () => ({ title: "R", severity: "HIGH", observation: "o", recommendation: "r", evidence: [] as unknown[] });
const rec = () => ({ title: "Rec", priority: "HIGH", recommendation: "do it", evidence: [] as unknown[] });

function base(over: Record<string, unknown> = {}) {
  return {
    executiveSummary: "An assessment.",
    strengths: [], risks: [], blindSpots: [], governanceReview: [], validationCommentary: [], recommendations: [],
    ...over,
  };
}

test("schema accepts findings at the new caps (3 strengths, 5 risks, 5 recs)", () => {
  const r = architectureReviewSchema.safeParse(base({
    strengths: [strength(), strength(), strength()],
    risks: [risk(), risk(), risk(), risk(), risk()],
    recommendations: [rec(), rec(), rec(), rec(), rec()],
  }));
  assert.equal(r.success, true);
});

test("schema rejects more than 5 risks", () => {
  const r = architectureReviewSchema.safeParse(base({ risks: [risk(), risk(), risk(), risk(), risk(), risk()] }));
  assert.equal(r.success, false);
});

test("schema rejects more than 3 strengths", () => {
  const r = architectureReviewSchema.safeParse(base({ strengths: [strength(), strength(), strength(), strength()] }));
  assert.equal(r.success, false);
});

test("schema rejects more than 5 recommendations", () => {
  const r = architectureReviewSchema.safeParse(base({ recommendations: [rec(), rec(), rec(), rec(), rec(), rec()] }));
  assert.equal(r.success, false);
});

test("schema tolerates a marginal observation overshoot (281–400) but rejects gross overflow", () => {
  // Buffer above the 280 prompt target so a few extra chars don't fail the review.
  assert.equal(architectureReviewSchema.safeParse(base({ strengths: [{ ...strength(), observation: "x".repeat(350) }] })).success, true);
  assert.equal(architectureReviewSchema.safeParse(base({ strengths: [{ ...strength(), observation: "x".repeat(401) }] })).success, false);
});

test("schema tolerates a marginal recommendation overshoot but rejects gross overflow", () => {
  assert.equal(architectureReviewSchema.safeParse(base({ recommendations: [{ ...rec(), recommendation: "y".repeat(350) }] })).success, true);
  assert.equal(architectureReviewSchema.safeParse(base({ recommendations: [{ ...rec(), recommendation: "y".repeat(401) }] })).success, false);
});

test("schema tolerates a marginal executiveSummary overshoot but rejects gross overflow", () => {
  assert.equal(architectureReviewSchema.safeParse(base({ executiveSummary: "z".repeat(800) })).success, true);
  assert.equal(architectureReviewSchema.safeParse(base({ executiveSummary: "z".repeat(901) })).success, false);
});

test("schema rejects more than 3 evidence refs on a finding", () => {
  const e = { kind: "metric", ref: "health.score" };
  const r = architectureReviewSchema.safeParse(base({ strengths: [{ ...strength(), evidence: [e, e, e, e] }] }));
  assert.equal(r.success, false);
});

test("user prompt serializes the digest as COMPACT JSON (no pretty indentation)", () => {
  const digest = { project: { id: "p", name: "n", description: "" }, evidenceKeys: ["health.score"] } as unknown as ReviewDigest;
  const prompt = buildReviewUserPrompt(digest);
  assert.ok(prompt.includes(JSON.stringify(digest)), "contains compact digest JSON");
  assert.ok(!prompt.includes('\n  "'), "no 2-space-indented object keys (would indicate pretty JSON)");
});
