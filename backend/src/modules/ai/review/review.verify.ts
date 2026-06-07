// review.verify.ts — the deterministic gate that keeps an AI review honest
// (AI Safety Rule 5, applied to *explanations*): every evidence
// reference the model emits must resolve to a key the digest actually exposed.
// PURE: no I/O, no Prisma, no AI. AI explains; this deterministic check disposes.
//
// Policy (per spec): unresolved evidence is REMOVED, never silently kept. A
// finding left with zero evidence is marked `unverified:true` so the UI presents
// it as advisory-but-unsupported rather than as fact. The verifier never edits
// the model's prose — it only strips bad citations and flags the result.

import type { ArchitectureReview, EvidenceRef, ReviewDigest } from "./review.types.js";

export interface VerifyReport {
  review: ArchitectureReview;
  /** Total evidence refs the model emitted. */
  totalRefs: number;
  /** How many were dropped because they were not in the digest allow-list. */
  removedRefs: number;
  /** How many findings ended up with no surviving evidence. */
  unverifiedFindings: number;
}

interface VerifiableFinding {
  evidence: EvidenceRef[];
  unverified?: boolean;
}

export function verifyReviewEvidence(review: ArchitectureReview, digest: ReviewDigest): VerifyReport {
  const allowed = new Set(digest.evidenceKeys);
  let totalRefs = 0;
  let removedRefs = 0;
  let unverifiedFindings = 0;

  const scrub = <T extends VerifiableFinding>(findings: T[]): T[] =>
    findings.map((f) => {
      const kept: EvidenceRef[] = [];
      for (const e of f.evidence ?? []) {
        totalRefs += 1;
        if (allowed.has(e.ref)) kept.push(e);
        else removedRefs += 1;
      }
      const unverified = kept.length === 0;
      if (unverified) unverifiedFindings += 1;
      return { ...f, evidence: kept, unverified };
    });

  const verified: ArchitectureReview = {
    executiveSummary: review.executiveSummary,
    strengths: scrub(review.strengths),
    risks: scrub(review.risks),
    blindSpots: scrub(review.blindSpots),
    governanceReview: scrub(review.governanceReview),
    validationCommentary: scrub(review.validationCommentary),
    recommendations: scrub(review.recommendations),
  };

  return { review: verified, totalRefs, removedRefs, unverifiedFindings };
}
