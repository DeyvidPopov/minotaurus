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
  summary?: string;
  requiresAuth?: boolean;
}

export interface SnapshotApiSpec {
  id: string;
  title?: string;
  description?: string;
  artifactId?: string | null;
  endpoints?: SnapshotEndpoint[];
}

export interface SnapshotDatabaseModel {
  id: string;
  title?: string;
  description?: string;
  artifactId?: string | null;
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
  artifactId?: string;
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
