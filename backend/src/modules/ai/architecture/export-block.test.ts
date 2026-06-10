import test from "node:test";
import assert from "node:assert/strict";
import { toExportReviewBlock, toExportAdvisoryBlock } from "./export-block.js";
import type { ReviewResult } from "../review/review.types.js";
import type { AdvisorResult } from "../advisor/advisor.types.js";

// The mappers only read prose + a few scalars; a full AnalysisResult isn't needed.
function reviewResult(): ReviewResult {
  return {
    id: "rev1",
    model: "claude-sonnet-4-6",
    generatedAt: "2026-06-01T00:00:00.000Z",
    stale: true,
    truncated: false,
    missingSections: [],
    analysisHash: "h1",
    usage: { inputTokens: 1, outputTokens: 2 },
    analysis: {} as never,
    review: {
      executiveSummary: "Overall solid.",
      strengths: [{ title: "Docs", observation: "Well documented", evidence: [] }],
      risks: [
        { title: "Coupling", severity: "HIGH", observation: "Hub overloaded", recommendation: "Split it", evidence: [], unverified: true },
      ],
      blindSpots: [],
      governanceReview: [],
      validationCommentary: [],
      recommendations: [{ title: "Add tests", priority: "MEDIUM", recommendation: "Cover the service", evidence: [] }],
    },
  } as unknown as ReviewResult;
}

function advisorResult(): AdvisorResult {
  return {
    id: "adv1",
    model: "claude-sonnet-4-6",
    generatedAt: "2026-06-02T00:00:00.000Z",
    stale: false,
    truncated: true,
    missingSections: ["recommendations"],
    analysisHash: "h2",
    usage: { inputTokens: 1, outputTokens: 2 },
    analysis: {} as never,
    verification: { totalRefs: 3, removedRefs: 0, discardedFindings: 1 },
    report: {
      executiveSummary: "Focus on coverage.",
      focusAreas: [{ title: "Coverage", detail: "Raise it", evidence: [] }],
      opportunities: [{ title: "Diagrams", detail: "Add ERDs", evidence: [] }],
      recommendations: [{ title: "Document API", priority: "HIGH", rationale: "Specs are bare", evidence: [] }],
    },
  } as unknown as AdvisorResult;
}

test("toExportReviewBlock carries prose + provenance and badges severity/priority", () => {
  const b = toExportReviewBlock(reviewResult());
  assert.equal(b.model, "claude-sonnet-4-6");
  assert.equal(b.stale, true);
  assert.equal(b.executiveSummary, "Overall solid.");
  assert.equal(b.risks[0].badge, "HIGH");
  assert.equal(b.risks[0].recommendation, "Split it");
  assert.equal(b.risks[0].unverified, true);
  // recommendation prose maps to observation; priority becomes the badge.
  assert.equal(b.recommendations[0].badge, "MEDIUM");
  assert.equal(b.recommendations[0].observation, "Cover the service");
  // one unverified finding total
  assert.equal(b.unverifiedCount, 1);
});

test("toExportReviewBlock omits absent recommendation/badge/unverified keys", () => {
  const b = toExportReviewBlock(reviewResult());
  assert.equal("recommendation" in b.strengths[0], false);
  assert.equal("badge" in b.strengths[0], false);
  assert.equal("unverified" in b.strengths[0], false);
});

test("toExportAdvisoryBlock maps notes + rationale and keeps provenance", () => {
  const b = toExportAdvisoryBlock(advisorResult());
  assert.equal(b.truncated, true);
  assert.equal(b.focusAreas[0].observation, "Raise it");
  assert.equal(b.opportunities[0].title, "Diagrams");
  assert.equal(b.recommendations[0].badge, "HIGH");
  assert.equal(b.recommendations[0].observation, "Specs are bare");
});
