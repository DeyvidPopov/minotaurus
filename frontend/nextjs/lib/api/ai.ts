// lib/api/ai.ts — typed AI Bootstrap Wizard endpoints.
// Mirrors backend modules/ai/ai.types.ts. AI proposes; the user reviews and
// confirms a subset; nothing persists until applyBootstrap. Both endpoints
// require DEVELOPER+.

import { apiClient } from "./client";
import type { ArtifactType, RelationType } from "@/lib/types";

// ── Proposal (what the model emits, what the user edits/selects) ──
export interface ProposedArtifact {
  title: string;
  type: ArtifactType;
  rationale: string;
  /** Model self-rated confidence in [0,1]. Advisory only. */
  confidence: number;
}
export interface ProposedRelation {
  sourceTitle: string;
  targetTitle: string;
  relationType: RelationType;
  rationale: string;
  confidence: number;
}
export interface ProposedDiagram {
  title: string;
  mermaidSource: string;
  confidence: number;
}
export interface BootstrapProposal {
  summary: string;
  artifacts: ProposedArtifact[];
  relations: ProposedRelation[];
  diagrams: ProposedDiagram[];
}

// ── Deterministic validation report (per-item accept/skip + reason) ──
export interface ItemDecision {
  accepted: boolean;
  reason?: string;
}
export interface ArtifactDecision extends ItemDecision {
  title: string;
}
export interface RelationDecision extends ItemDecision {
  sourceTitle: string;
  targetTitle: string;
  relationType: RelationType;
}
export interface DiagramDecision extends ItemDecision {
  title: string;
  /** Architecture node labels the diagram references (for live deselection warnings). */
  nodes?: string[];
  /** Subset of `nodes` that didn't resolve to a selected/existing artifact at validation time. */
  unresolvedNodes?: string[];
}
export interface ValidationReport {
  ok: boolean;
  errors: string[];
  artifacts: ArtifactDecision[];
  relations: RelationDecision[];
  diagrams: DiagramDecision[];
}

// ── Endpoint payloads ──
export interface ProposeResult {
  sessionId: string;
  proposal: BootstrapProposal;
  validation: ValidationReport;
}
export interface AppliedSummary {
  artifacts: { id: string; title: string; type: ArtifactType }[];
  relations: { id: string; sourceTitle: string; targetTitle: string; relationType: RelationType }[];
  diagrams: { id: string; title: string }[];
}
export interface SkippedItem {
  kind: "ARTIFACT" | "RELATION" | "DIAGRAM";
  label: string;
  reason: string;
}
export interface ApplyResult {
  sessionId: string;
  applied: AppliedSummary;
  skipped: SkippedItem[];
  validation: ValidationReport;
}

// ── AI Architecture Review (read-only) ──
// AI interprets the deterministic AnalysisResult; it never computes or alters it.
// Mirrors backend modules/ai/review/review.types.ts.

export interface EvidenceRef {
  kind: "metric" | "artifact" | "risk" | "resource" | "count";
  ref: string;
  value?: string | number;
}

interface ReviewFindingBase {
  title: string;
  /** Set by the server's deterministic verifier when no evidence resolved. */
  unverified?: boolean;
}
export interface StrengthFinding extends ReviewFindingBase {
  observation: string;
  evidence: EvidenceRef[];
}
export interface ReviewRiskFinding extends ReviewFindingBase {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  observation: string;
  recommendation: string;
  evidence: EvidenceRef[];
}
export interface BlindSpotFinding extends ReviewFindingBase {
  observation: string;
  recommendation: string;
  evidence: EvidenceRef[];
}
export interface GovernanceFinding extends ReviewFindingBase {
  observation: string;
  recommendation?: string;
  evidence: EvidenceRef[];
}
export interface ValidationCommentaryFinding extends ReviewFindingBase {
  observation: string;
  recommendation?: string;
  evidence: EvidenceRef[];
}
export interface RecommendationFinding extends ReviewFindingBase {
  priority: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
  evidence: EvidenceRef[];
}

export interface ArchitectureReview {
  executiveSummary: string;
  strengths: StrengthFinding[];
  risks: ReviewRiskFinding[];
  blindSpots: BlindSpotFinding[];
  governanceReview: GovernanceFinding[];
  validationCommentary: ValidationCommentaryFinding[];
  recommendations: RecommendationFinding[];
}

/** The deterministic numbers the review interprets — these remain authoritative. */
export interface ReviewAnalysis {
  meta: { generatedAt: string; projectId: string; emptyProject: boolean };
  health: {
    score: number | null;
    grade: string;
    label: string;
    subScores: { documentation: number; connectivity: number; traceability: number; validation: number; governance: number };
  };
}

export interface ReviewResult {
  /** AiSession audit row id (null only if the audit write failed at generation). */
  id: string | null;
  review: ArchitectureReview;
  analysis: ReviewAnalysis;
  analysisHash: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  generatedAt: string;
  /** True when output truncated and only the completed prefix was salvaged. */
  truncated: boolean;
  /** Sections dropped by truncation (only when `truncated`). */
  missingSections: string[];
  /** True when the project changed since this review was generated. */
  stale: boolean;
}

/** Lightweight review-history metadata (newest first). */
export interface ReviewListItem {
  id: string;
  generatedAt: string;
  analysisHash: string;
  model: string;
}

export const aiApi = {
  proposeBootstrap: (projectId: string, idea: string) =>
    apiClient.post<ProposeResult>(`/projects/${projectId}/ai/bootstrap/propose`, { idea }),
  applyBootstrap: (projectId: string, proposal: BootstrapProposal, sessionId?: string | null) =>
    apiClient.post<ApplyResult>(`/projects/${projectId}/ai/bootstrap/apply`, {
      proposal,
      sessionId: sessionId ?? undefined,
    }),
  reviewArchitecture: (projectId: string) =>
    apiClient.post<ReviewResult>(`/projects/${projectId}/ai/review`, {}),
  // Read-only retrieval of persisted reviews (no AI call).
  getLatestReview: (projectId: string) =>
    apiClient.get<ReviewResult>(`/projects/${projectId}/ai/review/latest`),
  listReviews: (projectId: string) =>
    apiClient.get<ReviewListItem[]>(`/projects/${projectId}/ai/reviews`),
  getReviewById: (projectId: string, reviewId: string) =>
    apiClient.get<ReviewResult>(`/projects/${projectId}/ai/reviews/${reviewId}`),
};
