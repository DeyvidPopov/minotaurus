// review.salvage.ts — pure, deterministic salvage of a max_tokens-truncated
// review tool response. Field order emits recommendations last, so the completed
// prefix (summary + early sections) is usually intact; this recovers it and
// reports which trailing sections were lost. No I/O, no Prisma, no AI.

import { partialArchitectureReviewSchema } from "./review.schema.js";
import type { ArchitectureReview } from "./review.types.js";

// Section emit order after executiveSummary. Truncation cuts a SUFFIX of this
// list, so the trailing empty sections are the ones lost.
export const SALVAGE_SECTIONS = [
  "strengths", "risks", "blindSpots", "governanceReview", "validationCommentary", "recommendations",
] as const;
type SalvageSection = (typeof SALVAGE_SECTIONS)[number];

/**
 * Returns the usable prefix of a truncated review + which trailing sections were
 * lost, or null when nothing usable arrived (caller then surfaces an honest 422).
 * Requires a non-empty executiveSummary AND at least one populated section so we
 * never present an empty shell as a review.
 */
export function salvageTruncatedReview(
  data: unknown,
): { review: ArchitectureReview; missingSections: string[] } | null {
  const parsed = partialArchitectureReviewSchema.safeParse(data);
  if (!parsed.success) return null;
  const p = parsed.data;
  if (!p.executiveSummary) return null;

  const review: ArchitectureReview = {
    executiveSummary: p.executiveSummary,
    strengths: p.strengths ?? [],
    risks: p.risks ?? [],
    blindSpots: p.blindSpots ?? [],
    governanceReview: p.governanceReview ?? [],
    validationCommentary: p.validationCommentary ?? [],
    recommendations: p.recommendations ?? [],
  };

  let lastNonEmpty = -1;
  SALVAGE_SECTIONS.forEach((s, i) => {
    if ((review[s as SalvageSection] as unknown[]).length > 0) lastNonEmpty = i;
  });
  if (lastNonEmpty === -1) return null;

  return { review, missingSections: [...SALVAGE_SECTIONS.slice(lastNonEmpty + 1)] };
}
