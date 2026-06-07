// generate.ts — the single, mode-parameterized entry point for generating an AI
// architecture analysis, per the consolidation spec:
//
//   generateAiArchitectureAnalysis({ mode: "REVIEW" | "ADVISOR", projectId, userId })
//
// The mode selects the prompt / schema / verification policy / output sections /
// persistence kind; everything shared (SSOT assembly, deterministic analysis +
// digest, the provider generation loop, error handling, truncation salvage) lives
// in analysis-runner.ts and the per-mode services. Overloads give each caller the
// precise result type. No circular import: this imports the services; the services
// import the runner; the runner imports neither.

import type { ReviewResult } from "../review/review.types.js";
import type { AdvisorResult } from "../advisor/advisor.types.js";
import { generateArchitectureReview } from "../review/review.service.js";
import { generateArchitectureAdvisory } from "../advisor/advisor.service.js";

export type AnalysisMode = "REVIEW" | "ADVISOR";

export function generateAiArchitectureAnalysis(p: { mode: "REVIEW"; projectId: string; userId: string }): Promise<ReviewResult>;
export function generateAiArchitectureAnalysis(p: { mode: "ADVISOR"; projectId: string; userId: string }): Promise<AdvisorResult>;
export function generateAiArchitectureAnalysis(p: {
  mode: AnalysisMode;
  projectId: string;
  userId: string;
}): Promise<ReviewResult | AdvisorResult> {
  const { projectId, userId } = p;
  return p.mode === "REVIEW"
    ? generateArchitectureReview({ projectId, userId })
    : generateArchitectureAdvisory({ projectId, userId });
}
