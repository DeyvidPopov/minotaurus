// export-block.ts — assembles the AI Review/Advisor narrative to FREEZE into an
// export snapshot. This is the sanctioned path for AI prose in an export
// (Safety Rule 3): the prose is captured here at export-create time and embedded
// as stored bytes, so the PDF/JSON/Markdown renderers stay a pure function of the
// snapshot and never call AI.
//
// READ-ONLY: nothing here writes. It lives in modules/ai (the layer allowed to
// read AnalysisResult) and reuses the existing read services, which already do the
// cheap deterministic staleness recompute. The pure mappers shape a persisted
// ReviewResult/AdvisorResult into the presentation-ready AiReviewExportBlock; the
// export engine receives the finished block and stays free of any AI dependency.

import type {
  AiReviewExportAdvisory,
  AiReviewExportBlock,
  AiReviewExportFinding,
  AiReviewExportReview,
} from "../../exports/analysis/analysis.types.js";
import type { ReviewResult } from "../review/review.types.js";
import type { AdvisorResult } from "../advisor/advisor.types.js";
import { getLatestReview } from "../review/review.service.js";
import { getLatestAdvisor } from "../advisor/advisor.service.js";

function finding(
  title: string,
  observation: string,
  recommendation?: string,
  badge?: string,
  unverified?: boolean,
): AiReviewExportFinding {
  return {
    title,
    observation,
    ...(badge ? { badge } : {}),
    ...(recommendation ? { recommendation } : {}),
    ...(unverified ? { unverified: true } : {}),
  };
}

function countUnverified(...groups: Array<Array<{ unverified?: boolean }>>): number {
  return groups.reduce((n, g) => n + g.filter((f) => f.unverified).length, 0);
}

/** Pure: a persisted Full Review → the presentation-ready export block. */
export function toExportReviewBlock(r: ReviewResult): AiReviewExportReview {
  const rv = r.review;
  return {
    generatedAt: r.generatedAt,
    model: r.model,
    stale: r.stale,
    truncated: r.truncated,
    unverifiedCount: countUnverified(
      rv.strengths, rv.risks, rv.blindSpots,
      rv.governanceReview, rv.validationCommentary, rv.recommendations,
    ),
    executiveSummary: rv.executiveSummary,
    strengths: rv.strengths.map((f) => finding(f.title, f.observation, undefined, undefined, f.unverified)),
    risks: rv.risks.map((f) => finding(f.title, f.observation, f.recommendation, f.severity, f.unverified)),
    blindSpots: rv.blindSpots.map((f) => finding(f.title, f.observation, f.recommendation, undefined, f.unverified)),
    governanceReview: rv.governanceReview.map((f) => finding(f.title, f.observation, f.recommendation, undefined, f.unverified)),
    validationCommentary: rv.validationCommentary.map((f) => finding(f.title, f.observation, f.recommendation, undefined, f.unverified)),
    recommendations: rv.recommendations.map((f) => finding(f.title, f.recommendation, undefined, f.priority, f.unverified)),
  };
}

/** Pure: a persisted Advisor report → the presentation-ready export block.
 *  Advisor items are evidence-verified-or-discarded upstream, so none are
 *  unverified by the time they reach here. */
export function toExportAdvisoryBlock(a: AdvisorResult): AiReviewExportAdvisory {
  const rp = a.report;
  return {
    generatedAt: a.generatedAt,
    model: a.model,
    stale: a.stale,
    truncated: a.truncated,
    executiveSummary: rp.executiveSummary,
    focusAreas: rp.focusAreas.map((n) => finding(n.title, n.detail)),
    opportunities: rp.opportunities.map((n) => finding(n.title, n.detail)),
    recommendations: rp.recommendations.map((r) => finding(r.title, r.rationale, undefined, r.priority)),
  };
}

/**
 * Load the latest persisted Full Review + Advisor for a project and shape them
 * into a frozen export block. Returns null when neither exists (the caller then
 * omits the section entirely). IO only — the pure shaping is above.
 */
export async function loadAiReviewExportBlock(projectId: string): Promise<AiReviewExportBlock | null> {
  const [review, advisory] = await Promise.all([
    getLatestReview(projectId),
    getLatestAdvisor(projectId),
  ]);
  if (!review && !advisory) return null;
  const block: AiReviewExportBlock = {};
  if (review) block.review = toExportReviewBlock(review);
  if (advisory) block.advisory = toExportAdvisoryBlock(advisory);
  return block;
}
