// review.salvage.test.ts — graceful truncation salvage. Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { salvageTruncatedReview } from "./review.salvage.js";

const strength = () => ({ title: "S", observation: "o", evidence: [] });
const risk = () => ({ title: "R", severity: "HIGH", observation: "o", recommendation: "r", evidence: [] });
const blind = () => ({ title: "B", observation: "o", recommendation: "r", evidence: [] });
const gov = () => ({ title: "G", observation: "o", evidence: [] });
const val = () => ({ title: "V", observation: "o", evidence: [] });
const rec = () => ({ title: "Rec", priority: "HIGH", recommendation: "r", evidence: [] });

test("salvages the completed prefix; reports only recommendations missing", () => {
  // Summary + every section EXCEPT recommendations (the truncated tail).
  const data = {
    executiveSummary: "Assessment.",
    strengths: [strength()],
    risks: [risk()],
    blindSpots: [blind()],
    governanceReview: [gov()],
    validationCommentary: [val()],
    // recommendations omitted (cut off)
  };
  const out = salvageTruncatedReview(data);
  assert.ok(out);
  assert.equal(out!.review.executiveSummary, "Assessment.");
  assert.equal(out!.review.risks.length, 1);
  assert.equal(out!.review.recommendations.length, 0);
  assert.deepEqual(out!.missingSections, ["recommendations"]);
});

test("reports all trailing empty sections as missing (cut earlier)", () => {
  const data = { executiveSummary: "x", strengths: [strength()], risks: [risk()] };
  const out = salvageTruncatedReview(data);
  assert.ok(out);
  assert.deepEqual(out!.missingSections, ["blindSpots", "governanceReview", "validationCommentary", "recommendations"]);
});

test("a complete object reports nothing missing", () => {
  const data = {
    executiveSummary: "x",
    strengths: [strength()], risks: [risk()], blindSpots: [blind()],
    governanceReview: [gov()], validationCommentary: [val()], recommendations: [rec()],
  };
  const out = salvageTruncatedReview(data);
  assert.ok(out);
  assert.deepEqual(out!.missingSections, []);
});

test("a malformed trailing array is dropped to empty, prefix still salvaged", () => {
  const data = {
    executiveSummary: "x",
    strengths: [strength()],
    recommendations: [{ title: "bad" }], // missing required fields → array drops to []
  };
  const out = salvageTruncatedReview(data);
  assert.ok(out);
  assert.equal(out!.review.strengths.length, 1);
  assert.equal(out!.review.recommendations.length, 0);
});

test("not salvageable: no executiveSummary ⇒ null (caller surfaces honest 422)", () => {
  assert.equal(salvageTruncatedReview({ strengths: [strength()] }), null);
});

test("not salvageable: summary only, no populated sections ⇒ null", () => {
  assert.equal(salvageTruncatedReview({ executiveSummary: "x" }), null);
});

test("not salvageable: empty / non-object ⇒ null", () => {
  assert.equal(salvageTruncatedReview({}), null);
  assert.equal(salvageTruncatedReview(null), null);
  assert.equal(salvageTruncatedReview("nope"), null);
});
