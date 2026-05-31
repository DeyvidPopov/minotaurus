// review.types.ts — DTOs for the AI Architecture Review (read-only).
// The chain is strictly one-directional:
//   SSOT snapshot → AnalysisResult (deterministic) → ReviewDigest → AI review.
// AI never feeds back into AnalysisResult. These are pure types: no Express,
// no Prisma runtime (only the AnalysisResult shape it consumes).
// Mirrored on the frontend in lib/api/ai.ts.

import type { AnalysisResult, HealthSubScores } from "../../exports/analysis/analysis.types.js";

// ── ReviewDigest (the bounded, deterministic input handed to the model) ──
// Built ONLY from AnalysisResult (+ a structural histogram of the snapshot).
// Long lists are capped; each carries its true total so the model can speak to
// magnitude without seeing every row. `evidenceKeys` is the deterministic
// allow-list of citations the model may use (verified server-side after parse).

export interface DigestArtifactRef {
  id: string;
  title: string;
  type?: string;
  status?: string;
  degree?: number;
  kind?: string;
}

export interface DigestRisk {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
}

export interface DigestList<T> {
  total: number;
  shown: T[];
}

export interface DigestSignal {
  label: string;
  passed: boolean;
  evidence: string;
}

export interface ReviewDigest {
  project: { id: string; name: string; description: string };
  health: {
    score: number | null;
    grade: string;
    label: string;
    subScores: HealthSubScores;
    weights: HealthSubScores;
  };
  counts: {
    artifacts: number;
    relations: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
  documentation: {
    coveragePct: number | null;
    documentedCount: number;
    total: number;
  };
  validation: {
    openCount: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    weightedIssues: number;
  };
  governance: {
    memberCount: number;
    roleDistribution: Record<string, number>;
    lastValidatedAt: string | null;
    signals: DigestSignal[];
  };
  traceability: {
    requirementCoverage: number | null;
    resourceLinkage: number | null;
    unimplementedRequirements: DigestList<DigestArtifactRef>;
    unlinkedResources: DigestList<DigestArtifactRef>;
  };
  connectivity: {
    avgDegree: number | null;
    orphanCount: number;
    orphans: DigestList<DigestArtifactRef>;
    overCoupled: DigestList<DigestArtifactRef>;
    hubs: DigestList<DigestArtifactRef>;
    relationMix: Record<string, number>;
  };
  undocumented: DigestList<DigestArtifactRef>;
  risks: DigestList<DigestRisk>;
  /** Deterministic allow-list of strings the model may cite as evidence. */
  evidenceKeys: string[];
  /** The per-list cap applied (so the UI/audit can record what was elided). */
  cap: number;
}

// ── ArchitectureReview (the model's structured output) ──

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RecommendationPriority = "LOW" | "MEDIUM" | "HIGH";

export interface EvidenceRef {
  kind: "metric" | "artifact" | "risk" | "resource" | "count";
  /** MUST be one of ReviewDigest.evidenceKeys — verified after parse. */
  ref: string;
  value?: string | number;
}

interface FindingBase {
  title: string;
  /**
   * Set by the deterministic verifier (NOT the model) when every piece of the
   * finding's evidence failed to resolve against the digest. The UI flags these
   * as advisory-but-unverifiable rather than presenting them as fact.
   */
  unverified?: boolean;
}

export interface StrengthFinding extends FindingBase {
  observation: string;
  evidence: EvidenceRef[];
}

export interface RiskFinding extends FindingBase {
  severity: RiskSeverity;
  observation: string;
  recommendation: string;
  evidence: EvidenceRef[];
}

export interface BlindSpotFinding extends FindingBase {
  observation: string;
  recommendation: string;
  evidence: EvidenceRef[];
}

export interface GovernanceFinding extends FindingBase {
  observation: string;
  recommendation?: string;
  evidence: EvidenceRef[];
}

export interface ValidationCommentaryFinding extends FindingBase {
  observation: string;
  recommendation?: string;
  evidence: EvidenceRef[];
}

export interface RecommendationFinding extends FindingBase {
  priority: RecommendationPriority;
  recommendation: string;
  evidence: EvidenceRef[];
}

export interface ArchitectureReview {
  executiveSummary: string;
  strengths: StrengthFinding[];
  risks: RiskFinding[];
  blindSpots: BlindSpotFinding[];
  governanceReview: GovernanceFinding[];
  validationCommentary: ValidationCommentaryFinding[];
  recommendations: RecommendationFinding[];
}

// ── Endpoint payload ──

export interface ReviewResult {
  review: ArchitectureReview;
  /** The deterministic analysis the review interprets — authoritative numbers. */
  analysis: AnalysisResult;
  /** Stable hash of `analysis` (for future staleness detection). */
  analysisHash: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  generatedAt: string;
}
