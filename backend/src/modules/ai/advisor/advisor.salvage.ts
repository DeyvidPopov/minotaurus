// advisor.salvage.ts — pure, deterministic salvage of a max_tokens-truncated
// advisory tool response. Field order emits recommendations last, so the
// completed prefix (summary + early sections) is usually intact; this recovers it
// and reports which trailing sections were lost. No I/O, no Prisma, no AI.

import { partialAdvisorReportSchema } from "./advisor.schema.js";
import type { AdvisorReport } from "./advisor.types.js";

// Section emit order after executiveSummary. Truncation cuts a SUFFIX of this
// list, so the trailing empty sections are the ones lost.
export const SALVAGE_SECTIONS = ["focusAreas", "opportunities", "recommendations"] as const;
type SalvageSection = (typeof SALVAGE_SECTIONS)[number];

/**
 * Returns the usable prefix of a truncated advisory + which trailing sections
 * were lost, or null when nothing usable arrived (caller then surfaces an honest
 * 422). Requires a non-empty executiveSummary AND at least one populated section
 * so we never present an empty shell as an advisory.
 */
export function salvageTruncatedAdvisory(
  data: unknown,
): { report: AdvisorReport; missingSections: string[] } | null {
  const parsed = partialAdvisorReportSchema.safeParse(data);
  if (!parsed.success) return null;
  const p = parsed.data;
  if (!p.executiveSummary) return null;

  const report: AdvisorReport = {
    executiveSummary: p.executiveSummary,
    focusAreas: p.focusAreas ?? [],
    opportunities: p.opportunities ?? [],
    recommendations: p.recommendations ?? [],
  };

  let lastNonEmpty = -1;
  SALVAGE_SECTIONS.forEach((s, i) => {
    if ((report[s as SalvageSection] as unknown[]).length > 0) lastNonEmpty = i;
  });
  if (lastNonEmpty === -1) return null;

  return { report, missingSections: [...SALVAGE_SECTIONS.slice(lastNonEmpty + 1)] };
}
