// advisor.schema.test.ts — pure-logic tests for the advisory output contract.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { advisorReportSchema, partialAdvisorReportSchema } from "./advisor.schema.js";
import type { AdvisorReport } from "./advisor.types.js";

function report(over: Partial<AdvisorReport> = {}): AdvisorReport {
  return {
    executiveSummary: "A snapshot.",
    focusAreas: [],
    opportunities: [],
    recommendations: [],
    ...over,
  };
}

test("advisorReportSchema accepts a well-formed minimal advisory", () => {
  const parsed = advisorReportSchema.safeParse(report());
  assert.equal(parsed.success, true);
});

test("advisorReportSchema accepts a fully-populated advisory", () => {
  const parsed = advisorReportSchema.safeParse(report({
    focusAreas: [{ title: "Coupling", detail: "high fan-out concentrates risk", evidence: [{ kind: "risk", ref: "finding:HIGH_FAN_OUT" }] }],
    opportunities: [{ title: "Ownership", detail: "single owner", evidence: [{ kind: "risk", ref: "finding:SINGLE_OWNER" }] }],
    recommendations: [{ title: "Split service", priority: "HIGH", rationale: "reduce blast radius", evidence: [{ kind: "metric", ref: "connectivity.avgDegree" }] }],
  }));
  assert.equal(parsed.success, true);
});

test("advisorReportSchema rejects more than 3 focus areas (curate, don't enumerate)", () => {
  const focusAreas = Array.from({ length: 4 }, (_, i) => ({
    title: `f${i}`, detail: "d", evidence: [{ kind: "metric" as const, ref: "health.score" }],
  }));
  const parsed = advisorReportSchema.safeParse(report({ focusAreas }));
  assert.equal(parsed.success, false);
});

test("advisorReportSchema rejects a missing executiveSummary", () => {
  const { executiveSummary, ...rest } = report();
  void executiveSummary;
  const parsed = advisorReportSchema.safeParse(rest);
  assert.equal(parsed.success, false);
});

test("advisorReportSchema rejects a recommendation missing its required rationale", () => {
  const bad = report({
    recommendations: [{ title: "R", priority: "HIGH", evidence: [] } as never],
  });
  const parsed = advisorReportSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("advisorReportSchema rejects a recommendation missing its evidence key", () => {
  const bad = report({
    recommendations: [{ title: "R", priority: "HIGH", rationale: "r" } as never],
  });
  const parsed = advisorReportSchema.safeParse(bad);
  assert.equal(parsed.success, false);
});

test("advisorReportSchema rejects more than 5 recommendations (count cap)", () => {
  const recs = Array.from({ length: 6 }, (_, i) => ({
    title: `r${i}`, priority: "MEDIUM" as const, rationale: "r", evidence: [],
  }));
  const parsed = advisorReportSchema.safeParse(report({ recommendations: recs }));
  assert.equal(parsed.success, false);
});

test("advisorReportSchema caps evidence at 3 refs per item", () => {
  const parsed = advisorReportSchema.safeParse(report({
    recommendations: [{
      title: "R", priority: "LOW", rationale: "r",
      evidence: [
        { kind: "metric", ref: "a" }, { kind: "metric", ref: "b" },
        { kind: "metric", ref: "c" }, { kind: "metric", ref: "d" },
      ],
    }],
  }));
  assert.equal(parsed.success, false);
});

test("an out-of-range priority is coerced (catch) rather than rejected", () => {
  const parsed = advisorReportSchema.safeParse(report({
    recommendations: [{ title: "R", priority: "URGENT" as never, rationale: "r", evidence: [{ kind: "metric", ref: "a" }] }],
  }));
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.recommendations[0].priority, "MEDIUM");
});

test("partialAdvisorReportSchema tolerates a truncated object (for salvage)", () => {
  const parsed = partialAdvisorReportSchema.safeParse({
    executiveSummary: "Only the snapshot arrived.",
    focusAreas: [{ title: "F", detail: "d", evidence: [] }],
    // opportunities/recommendations cut off by truncation
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.executiveSummary, "Only the snapshot arrived.");
    assert.equal(parsed.data.focusAreas?.length, 1);
  }
});

test("partialAdvisorReportSchema never throws on garbage (catch to {})", () => {
  const parsed = partialAdvisorReportSchema.safeParse(42);
  assert.equal(parsed.success, true);
});
