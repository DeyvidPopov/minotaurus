// Export Engine V2 — Architecture Analysis Engine types.
//
// Two type families live here:
//  1. `ExportSnapshot` — a *structural, all-optional* view of the object that
//     `buildExportContent()` produces for non-Markdown exports. The analysis
//     engine only reads; it never depends on Prisma types so it stays pure and
//     unit-testable against hand-written fixtures.
//  2. `AnalysisResult` — the JSON-serializable contract consumed by the PDF
//     renderer and (later) the AI layer. Neither input nor output references
//     Express, Prisma, the renderer or any I/O.

// ───────────────────────────── Input snapshot ─────────────────────────────
// All fields optional: the snapshot is section-gated, so any collection may be
// absent. The engine treats absent collections as empty.

export interface SnapshotProject {
  id?: string;
  name?: string;
  description?: string;
  ownerId?: string | null;
}

export interface SnapshotArtifact {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  description?: string;
  /** Raw column — usually absent in the snapshot (see `documentation`). */
  documentationContent?: string | null;
  /** Serialized doc payload; present only when documentation content is non-empty. */
  documentation?: { markdownContent?: string | null } | null;
}

export interface SnapshotRelation {
  id?: string;
  sourceArtifactId?: string;
  targetArtifactId?: string;
  relationType?: string;
}

export interface SnapshotEndpoint {
  id?: string;
  method?: string;
  path?: string;
  summary?: string;
  requestSchema?: string;
  responseSchema?: string;
  requiresAuth?: boolean;
}

export interface SnapshotApiSpec {
  id: string;
  title?: string;
  description?: string;
  artifactId?: string | null;
  endpoints?: SnapshotEndpoint[];
}

export interface SnapshotDatabaseField {
  id?: string;
  name?: string;
  type?: string;
  required?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  /** Coarse (entity-level) FK target. */
  referencesEntityId?: string | null;
  referencesEntityName?: string | null;
  /** Precise (column-level) FK target — the exact referenced column. */
  referencesFieldId?: string | null;
  referencesFieldName?: string | null;
  description?: string;
}

export interface SnapshotDatabaseEntity {
  id?: string;
  name?: string;
  fields?: SnapshotDatabaseField[];
}

export interface SnapshotDatabaseModel {
  id: string;
  title?: string;
  description?: string;
  artifactId?: string | null;
  entities?: SnapshotDatabaseEntity[];
}

export interface SnapshotDiagram {
  id: string;
  title?: string;
  type?: string;
  mermaidSource?: string;
  description?: string;
  artifactId?: string | null;
  /**
   * Optional pre-rendered SVG markup, captured client-side at export-create
   * time (Mermaid renders only in a browser DOM). Frozen into the snapshot so
   * the PDF stays a pure function of stored bytes. When present and valid, the
   * renderer embeds it as vector; otherwise it falls back to the source block.
   * Must be `<text>`-based (htmlLabels:false) — pdfmake drops <foreignObject>.
   */
  renderedSvg?: string | null;
}

export interface SnapshotIssue {
  id?: string;
  /** Polymorphic subject id (artifact / api-spec / db-model / diagram / project). */
  subjectId?: string;
  subjectType?: string;
  /** Strict Artifact FK — present only for ARTIFACT-subject findings (else null). */
  artifactId?: string | null;
  severity?: string;
  category?: string;
  message?: string;
  status?: string;
}

export interface SnapshotVersionEvent {
  id?: string;
  entityId?: string;
  entityType?: string;
  action?: string;
  title?: string;
  createdAt?: string;
}

export interface SnapshotMember {
  id?: string;
  role?: string;
  email?: string;
  name?: string | null;
}

// ── AI Review / Advisor narrative frozen into the snapshot ──
// AI prose embedded in an export must be FROZEN as stored bytes (Safety Rule 3):
// the renderer never calls AI and never recomputes a score — it presents what was
// captured at export-create time. Built by modules/ai/architecture/export-block.ts
// from the latest persisted AiSession(REVIEW)/(ADVISOR). Advisory only — never part
// of the deterministic scored analysis.

export interface AiReviewExportFinding {
  title: string;
  /** Severity (risks) or priority (recommendations); absent for plain notes. */
  badge?: string;
  observation: string;
  recommendation?: string;
  /** True when the deterministic verifier could not ground this in evidence. */
  unverified?: boolean;
}

export interface AiReviewExportReview {
  generatedAt: string;
  model: string;
  /** Project state changed since this review was generated (hash mismatch). */
  stale: boolean;
  truncated: boolean;
  unverifiedCount: number;
  executiveSummary: string;
  strengths: AiReviewExportFinding[];
  risks: AiReviewExportFinding[];
  blindSpots: AiReviewExportFinding[];
  governanceReview: AiReviewExportFinding[];
  validationCommentary: AiReviewExportFinding[];
  recommendations: AiReviewExportFinding[];
}

export interface AiReviewExportAdvisory {
  generatedAt: string;
  model: string;
  stale: boolean;
  truncated: boolean;
  executiveSummary: string;
  focusAreas: AiReviewExportFinding[];
  opportunities: AiReviewExportFinding[];
  recommendations: AiReviewExportFinding[];
}

export interface AiReviewExportBlock {
  review?: AiReviewExportReview;
  advisory?: AiReviewExportAdvisory;
}

export interface ExportSnapshot {
  project?: SnapshotProject | null;
  generatedAt?: string;
  artifacts?: SnapshotArtifact[];
  relations?: SnapshotRelation[];
  apiSpecs?: SnapshotApiSpec[];
  databaseModels?: SnapshotDatabaseModel[];
  diagrams?: SnapshotDiagram[];
  validationIssues?: SnapshotIssue[];
  versionHistory?: SnapshotVersionEvent[];
  team?: SnapshotMember[];
  /** Frozen AI Review/Advisor narrative (present only when AI_REVIEW is in scope
   *  and a review/advisory exists). Advisory, never scored. */
  aiReview?: AiReviewExportBlock | null;
}

// ───────────────────────────── Output contract ─────────────────────────────

export interface HealthSubScores {
  documentation: number;
  connectivity: number;
  traceability: number;
  validation: number;
  governance: number;
}

export interface AnalysisResult {
  meta: {
    generatedAt: string;
    projectId: string;
    emptyProject: boolean;
  };

  health: {
    score: number | null;
    grade: string;
    label: string;
    subScores: HealthSubScores;
    weights: HealthSubScores;
  };

  documentation: {
    coveragePct: number | null;
    documentedCount: number;
    total: number;
    byType: Record<string, number | null>;
    byStatus: Record<string, number | null>;
    undocumented: Array<{ id: string; title: string; type: string; status: string }>;
    descriptive: {
      apiSpec: number | null;
      endpoint: number | null;
      databaseModel: number | null;
      diagram: number | null;
    };
  };

  connectivity: {
    avgDegree: number | null;
    orphanCount: number;
    orphans: Array<{ id: string; title: string; type: string }>;
    overCoupled: Array<{ id: string; title: string; degree: number }>;
    hubs: Array<{ id: string; title: string; degree: number }>;
    relationMix: Record<string, number>;
  };

  traceability: {
    requirementCoverage: number | null;
    unimplementedRequirements: Array<{ id: string; title: string; status: string }>;
    resourceLinkage: number | null;
    unlinkedResources: Array<{ id: string; title: string; kind: string }>;
  };

  governance: {
    memberCount: number;
    roleDistribution: Record<string, number>;
    lastValidatedAt: string | null;
    signals: Array<{ label: string; passed: boolean; evidence: string }>;
  };

  validation: {
    openCount: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    weightedIssues: number;
  };

  /** API Payload Intelligence — deterministic metrics over endpoint payloads. */
  apiIntel: {
    totalEndpoints: number;
    endpointsWithPayload: number;
    endpointPayloadCoveragePct: number | null;
    idLikeFields: number;
    mappedFields: number;
    fieldMappingCoveragePct: number | null;
    sensitiveExposureCount: number;
    publicEndpointRiskCount: number;
    sensitiveExposures: Array<{ method: string; path: string; field: string; location: string; kind: string }>;
    risks: Array<{ code: string; severity: string; method: string; path: string; message: string }>;
  };

  risks: RiskFinding[];
}

export interface RiskEvidence {
  type: string;
  id?: string;
  title?: string;
  value?: string | number;
}

export interface RiskFinding {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  evidence: RiskEvidence[];
}
