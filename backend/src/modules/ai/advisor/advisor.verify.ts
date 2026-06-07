// advisor.verify.ts — the deterministic gate that keeps the Advisor honest
// (AI Safety Rule 5, applied to *explanations*): every evidence
// reference the model emits must resolve to a key the digest actually exposed.
// PURE: no I/O, no Prisma, no AI. AI explains; this deterministic check disposes.
//
// Policy (per the Advisor spec — STRICTER than AI Review): an item with NO
// surviving evidence is DISCARDED, not flagged. "Recommendations lacking evidence:
// discard. Hallucinated recommendations: discard. Unsupported recommendations:
// discard." This applies to every section so the rendered advisory is fully
// grounded. The verifier never edits the model's prose — it strips bad citations,
// drops unsupported items, and deterministically orders recommendations.

import type {
  AdvisorNote,
  AdvisorRecommendation,
  AdvisorReport,
  EvidenceRef,
  RecommendationPriority,
  ReviewDigest,
} from "./advisor.types.js";

export interface AdvisorVerifyReport {
  report: AdvisorReport;
  /** Total evidence refs the model emitted across all sections. */
  totalRefs: number;
  /** How many were dropped because they were not in the digest allow-list. */
  removedRefs: number;
  /** How many findings were discarded for having no surviving evidence. */
  discardedFindings: number;
}

/** HIGH first, then MEDIUM, then LOW. Unknown priorities sort last. */
const PRIORITY_RANK: Record<RecommendationPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
function priorityRank(p: string): number {
  return PRIORITY_RANK[p as RecommendationPriority] ?? 99;
}

/** Max prioritized next steps (mirrors the schema cap; enforced post-sort too). */
export const MAX_RECOMMENDATIONS = 5;

export function verifyAdvisorEvidence(report: AdvisorReport, digest: ReviewDigest): AdvisorVerifyReport {
  const allowed = new Set(digest.evidenceKeys);
  let totalRefs = 0;
  let removedRefs = 0;
  let discardedFindings = 0;

  const scrub = (evidence: EvidenceRef[] | undefined): EvidenceRef[] => {
    const kept: EvidenceRef[] = [];
    for (const e of evidence ?? []) {
      totalRefs += 1;
      if (allowed.has(e.ref)) kept.push(e);
      else removedRefs += 1;
    }
    return kept;
  };

  // Scrub each item's evidence, then DISCARD any item left with zero evidence.
  const filterFindings = <T extends { evidence: EvidenceRef[] }>(items: T[] | undefined): T[] => {
    const out: T[] = [];
    for (const f of items ?? []) {
      const evidence = scrub(f.evidence);
      if (evidence.length === 0) {
        discardedFindings += 1;
        continue;
      }
      out.push({ ...f, evidence });
    }
    return out;
  };

  const focusAreas: AdvisorNote[] = filterFindings(report.focusAreas);
  const opportunities: AdvisorNote[] = filterFindings(report.opportunities);

  // Recommendations: verify → stable sort by priority → hard cap. The index
  // tie-break keeps it deterministic AND preserves the model's order within a
  // single priority band (Array.prototype.sort is stable in modern Node, but the
  // explicit tie-break makes the contract independent of that guarantee).
  const recommendations: AdvisorRecommendation[] = filterFindings(report.recommendations)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => priorityRank(a.r.priority) - priorityRank(b.r.priority) || a.i - b.i)
    .map((x) => x.r)
    .slice(0, MAX_RECOMMENDATIONS);

  return {
    report: {
      executiveSummary: report.executiveSummary,
      focusAreas,
      opportunities,
      recommendations,
    },
    totalRefs,
    removedRefs,
    discardedFindings,
  };
}
