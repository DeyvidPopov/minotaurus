// lib/api/ai.ts — typed AI Bootstrap Wizard endpoints.
// Mirrors backend modules/ai/ai.types.ts. AI proposes; the user reviews and
// confirms a subset; nothing persists until applyBootstrap. Both endpoints
// require DEVELOPER+.

import { apiClient } from "./client";
import type { ArtifactType, RelationType } from "@/lib/types";
import type { DatabaseType } from "./database-models";
import type { HttpMethod } from "./api-specs";

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
// Database (Bootstrap V2, Phase 1) — mirrors backend ai.types.ts.
export interface ProposedDatabaseField {
  name: string;
  type: string;
  required: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntityName?: string | null;
  confidence: number;
}
export interface ProposedDatabaseEntity {
  name: string;
  fields: ProposedDatabaseField[];
  confidence: number;
}
export interface ProposedDatabaseModel {
  title: string;
  databaseType: DatabaseType;
  artifactTitle?: string | null;
  entities: ProposedDatabaseEntity[];
  confidence: number;
}
// API catalog (Bootstrap V2, Phase 2) — mirrors backend ai.types.ts.
export interface ProposedApiEndpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  requiresAuth: boolean;
  confidence: number;
}
export interface ProposedApiSpec {
  title: string;
  version: string;
  baseUrl?: string | null;
  artifactTitle?: string | null;
  description?: string;
  endpoints: ProposedApiEndpoint[];
  confidence: number;
}
export interface BootstrapProposal {
  summary: string;
  artifacts: ProposedArtifact[];
  relations: ProposedRelation[];
  diagrams: ProposedDiagram[];
  databaseModels: ProposedDatabaseModel[];
  apiSpecs: ProposedApiSpec[];
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
export interface DatabaseFieldDecision extends ItemDecision {
  name: string;
  resolvedReference?: boolean;
}
export interface DatabaseEntityDecision extends ItemDecision {
  name: string;
  fields: DatabaseFieldDecision[];
}
export interface DatabaseModelDecision extends ItemDecision {
  title: string;
  entities: DatabaseEntityDecision[];
  artifactLinked?: boolean;
}
export interface ApiEndpointDecision extends ItemDecision {
  method: HttpMethod;
  path: string;
}
export interface ApiSpecDecision extends ItemDecision {
  title: string;
  endpoints: ApiEndpointDecision[];
  artifactLinked?: boolean;
}
export interface ValidationReport {
  ok: boolean;
  errors: string[];
  artifacts: ArtifactDecision[];
  relations: RelationDecision[];
  diagrams: DiagramDecision[];
  databaseModels: DatabaseModelDecision[];
  apiSpecs: ApiSpecDecision[];
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
  databaseModels: { id: string; title: string; entityCount: number; fieldCount: number }[];
  apiSpecs: { id: string; title: string; version: string; endpointCount: number }[];
}
export interface SkippedItem {
  kind:
    | "ARTIFACT"
    | "RELATION"
    | "DIAGRAM"
    | "DATABASE_MODEL"
    | "DATABASE_ENTITY"
    | "DATABASE_FIELD"
    | "API_SPEC"
    | "API_ENDPOINT";
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

// ── AI Architecture Advisor (the "Advisor / Next Steps" mode of AI Review) ──
// The Advisor is an architectural consultant: it interprets the deterministic
// AnalysisResult to explain why findings matter and what to investigate next. It
// is read-only w.r.t. architecture (no SSOT writes, no apply path) but PERSISTS
// its own result so advisories survive refresh and gain history + staleness,
// exactly like Full Review. Mirrors backend modules/ai/advisor/advisor.types.ts.

export type AdvisorPriority = "HIGH" | "MEDIUM" | "LOW";

/** A focus area or opportunity — every item carries verified evidence. */
export interface AdvisorNote {
  title: string;
  detail: string;
  evidence: EvidenceRef[];
}
export interface AdvisorRecommendation {
  title: string;
  priority: AdvisorPriority;
  rationale: string;
  evidence: EvidenceRef[];
}
export interface AdvisorReport {
  /** Executive Snapshot — very short project state. */
  executiveSummary: string;
  /** Current Focus Areas — the top 2–3 concerns to address now. */
  focusAreas: AdvisorNote[];
  /** Opportunities — a few lightweight quality-improvement areas. */
  opportunities: AdvisorNote[];
  /** Recommended Next Steps — at most 5, ordered HIGH → MEDIUM → LOW by the server's verifier. */
  recommendations: AdvisorRecommendation[];
}
export interface AdvisorVerification {
  totalRefs: number;
  removedRefs: number;
  discardedFindings: number;
}
export interface AdvisorResult {
  /** AiSession(ADVISOR) audit row id (null only if the audit write failed). */
  id: string | null;
  report: AdvisorReport;
  /** The deterministic numbers the advisory interprets — authoritative. */
  analysis: ReviewAnalysis;
  analysisHash: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  generatedAt: string;
  truncated: boolean;
  missingSections: string[];
  /** True when the project changed since this advisory was generated. */
  stale: boolean;
  verification: AdvisorVerification;
}

/** Lightweight advisor-history metadata (newest first). */
export interface AdvisorListItem {
  id: string;
  generatedAt: string;
  analysisHash: string;
  model: string;
}

// ── Artifact Documentation Assistant (per-artifact, on-demand draft) ──
// AI drafts Markdown for ONE artifact from a bounded digest; the user reviews,
// edits, and saves through the existing documentation endpoint. DEVELOPER+.
// Mirrors backend modules/ai/documentation/doc-draft.types.ts.
export interface DocumentationDraftResult {
  /** AiSession audit row id (null only if the best-effort audit write failed). */
  sessionId: string | null;
  /** The AI-drafted Markdown to pre-fill the editor with. */
  markdown: string;
  /** "new" when the artifact had no docs; otherwise an improvement suggestion. */
  mode: "new" | "replacement_suggestion";
  generatedAt: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** True when output was truncated; the markdown is still a usable draft. */
  truncated: boolean;
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
  // Generate a new AI architecture advisory (AI call) and persist it as a new
  // ADVISOR session. Read-only w.r.t. architecture — never overwrites history.
  generateAdvisor: (projectId: string) =>
    apiClient.post<AdvisorResult>(`/projects/${projectId}/ai/advisor`, {}),
  // Read-only retrieval of persisted advisories (no AI call).
  getLatestAdvisor: (projectId: string) =>
    apiClient.get<AdvisorResult>(`/projects/${projectId}/ai/advisor/latest`),
  listAdvisors: (projectId: string) =>
    apiClient.get<AdvisorListItem[]>(`/projects/${projectId}/ai/advisors`),
  getAdvisorById: (projectId: string, advisorId: string) =>
    apiClient.get<AdvisorResult>(`/projects/${projectId}/ai/advisors/${advisorId}`),
  // Generate an on-demand documentation draft for one artifact (no save).
  generateDocumentationDraft: (projectId: string, artifactId: string) =>
    apiClient.post<DocumentationDraftResult>(
      `/projects/${projectId}/ai/documentation/artifacts/${artifactId}/draft`,
      {},
    ),
};
