// advisor.salvage.test.ts — pure-logic tests for truncation salvage.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { salvageTruncatedAdvisory } from "./advisor.salvage.js";

test("salvages the completed prefix and reports the trailing missing sections", () => {
  const out = salvageTruncatedAdvisory({
    executiveSummary: "Snapshot present.",
    focusAreas: [{ title: "F", detail: "d", evidence: [] }],
    // opportunities + recommendations lost to truncation
  });
  assert.ok(out);
  assert.equal(out!.report.executiveSummary, "Snapshot present.");
  assert.equal(out!.report.focusAreas.length, 1);
  assert.deepEqual(out!.missingSections, ["opportunities", "recommendations"]);
});

test("returns null when no executiveSummary survived (nothing usable)", () => {
  const out = salvageTruncatedAdvisory({ focusAreas: [{ title: "F", detail: "d", evidence: [] }] });
  assert.equal(out, null);
});

test("returns null when only an empty shell arrived (snapshot but no sections)", () => {
  const out = salvageTruncatedAdvisory({ executiveSummary: "Only snapshot.", focusAreas: [], opportunities: [] });
  assert.equal(out, null);
});

test("a fully-complete object salvages with no missing sections", () => {
  const out = salvageTruncatedAdvisory({
    executiveSummary: "S",
    focusAreas: [{ title: "F", detail: "d", evidence: [] }],
    opportunities: [{ title: "O", detail: "d", evidence: [] }],
    recommendations: [{ title: "Rec", priority: "HIGH", rationale: "r", evidence: [] }],
  });
  assert.ok(out);
  assert.deepEqual(out!.missingSections, []);
});

test("returns null on garbage input", () => {
  assert.equal(salvageTruncatedAdvisory(null), null);
  assert.equal(salvageTruncatedAdvisory("nope"), null);
});
