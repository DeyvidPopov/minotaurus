// api-intel.types.ts — shapes for the deterministic API Payload Intelligence
// analyzer. Decoupled from Prisma so the pure functions are unit-testable with
// plain object fixtures (no DB). Phase 1: Architecture Links + Workflow Impact.
// Read-only, never persisted, no AI.

export type Confidence = "high" | "medium" | "low";

/** high → low; used for deterministic sorting. */
export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

export type FieldLocation = "request" | "response" | "path";

export interface FieldRef {
  name: string;
  location: FieldLocation;
}

/** A database entity the endpoint payload appears to touch (Tier 1). */
export interface EntityMatch {
  entityId: string;
  entityName: string;
  modelId: string;
  modelTitle: string;
  /** The owning DatabaseModel's artifact, if linked — used as a graph anchor. */
  artifactId: string | null;
  /** How we matched, e.g. "path:patients", "field:patientId", "field:email". */
  via: string;
  basis: string;
  confidence: Confidence;
}

export type LinkReason = "spec-artifact" | "entity-model" | "relation" | "name-match";

/** An architecture artifact reachable from the endpoint (service / doc / policy). */
export interface ArtifactLink {
  artifactId: string;
  title: string;
  type: string;
  status: string;
  reason: LinkReason;
  /** Set when reason === "relation". */
  relationType?: string;
  basis: string;
  confidence: Confidence;
}

export type WorkflowKind =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "REFERENCE"
  | "READ"
  | "AUTHENTICATE"
  | "GENERATE"
  | "START"
  | "TRIGGER"
  | "REQUIRE"
  | "END";

/** A deterministic, inferred business-workflow signal — never a stored definition. */
export interface WorkflowSignal {
  kind: WorkflowKind;
  label: string; // "Creates Patient"
  object: string; // "Patient"
  entityId?: string;
  confidence: Confidence;
  basis: string; // mandatory explainability
}

export interface Warning {
  field: string;
  kind: "credential" | "pii";
  location: FieldLocation;
  message: string;
}

/** The full per-endpoint intelligence object. */
export interface EndpointIntel {
  endpointId: string;
  apiSpecId: string;
  method: string;
  path: string;
  requiresAuth: boolean;
  databaseEntities: EntityMatch[];
  /** EVERY extracted request/response field name (deduped, sorted). */
  payloadFields: string[];
  /** The subset of fields that drove inference (id-like or entity-matched). */
  referencedFields: string[];
  relatedArtifacts: ArtifactLink[];
  documentation: ArtifactLink[];
  security: ArtifactLink[];
  workflow: WorkflowSignal[];
  warnings: Warning[];
  /** Artifact ids the endpoint anchors to — reused by later phases (graph/impact). */
  anchors: string[];
}

// ─────────────── Analyzer input (plain, DB-free) ───────────────

export interface EndpointInput {
  id: string;
  method: string;
  path: string;
  summary: string;
  requestSchema: string;
  responseSchema: string;
  requiresAuth: boolean;
}

export interface SpecInput {
  id: string;
  artifactId: string | null;
  title: string;
  endpoints: EndpointInput[];
}

export interface EntityInput {
  id: string;
  name: string;
  fields: { name: string }[];
}

export interface ModelInput {
  id: string;
  artifactId: string | null;
  title: string;
  entities: EntityInput[];
}

export interface ArtifactInput {
  id: string;
  title: string;
  type: string;
  status: string;
  documentationContent?: string | null;
}

export interface RelationInput {
  sourceArtifactId: string;
  targetArtifactId: string;
  relationType: string;
}

export interface AnalyzerInput {
  specs: SpecInput[];
  models: ModelInput[];
  artifacts: ArtifactInput[];
  relations: RelationInput[];
}

// ─────────────── Phase 2: artifact-level inferred graph edges ───────────────

export type InferredEdgeKind = "TOUCHES" | "SECURED_BY" | "DOCUMENTED_BY" | "RELATED";

/**
 * An inferred, NON-persisted artifact→artifact edge for the knowledge graph.
 * `source` is an API spec's linked artifact; `target` is a data model / policy /
 * doc / service it appears to relate to. Already-real relations are excluded, so
 * these only ever ADD the connections the graph cannot otherwise show.
 */
export interface InferredEdge {
  source: string; // artifact id (the API spec's artifact)
  target: string; // artifact id
  kind: InferredEdgeKind;
  confidence: Confidence;
  basis: string;
  endpointCount: number;
}

export interface ProjectApiIntel {
  endpoints: EndpointIntel[];
  inferredEdges: InferredEdge[];
}

// ─────────────── Phase 4: deterministic API validation findings ───────────────

export type ApiValidationCode =
  | "API_FIELD_UNMAPPED"
  | "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD"
  | "USER_SCOPED_ENDPOINT_WITHOUT_AUTH"
  | "RESPONSE_EXPOSES_TOKEN_OR_SECRET";

export type IssueSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type IssueCategory = "API" | "SECURITY";

/**
 * A deterministic finding the validation engine promotes to a ValidationIssue.
 * Pure analysis only — the engine owns persistence (AI never writes these).
 */
export interface ApiValidationFinding {
  code: ApiValidationCode;
  severity: IssueSeverity;
  category: IssueCategory;
  apiSpecId: string;
  endpointId: string;
  method: string;
  path: string;
  /** Human message WITHOUT the code prefix; the engine prepends `${code} · `. */
  message: string;
}

export interface ApiValidationInput {
  specs: SpecInput[];
  models: ModelInput[];
}

// ─────────────── Phase 5: analysis-engine metrics (raw counts) ───────────────

export interface ApiIntelExposure {
  method: string;
  path: string;
  field: string;
  location: string;
  kind: "credential" | "pii";
}

export interface ApiIntelRisk {
  code: string;
  severity: string;
  method: string;
  path: string;
  message: string;
}

/**
 * Raw, deterministic API payload metrics. The export analysis engine derives the
 * coverage percentages from these counts (using its own PCT) and assembles the
 * `AnalysisResult.apiIntel` block. Lists are capped; counts are full totals.
 */
export interface ApiIntelCounts {
  totalEndpoints: number;
  endpointsWithPayload: number;
  idLikeFieldTotal: number;
  mappedFieldTotal: number;
  sensitiveExposureCount: number;
  publicEndpointRiskCount: number;
  sensitiveExposures: ApiIntelExposure[];
  risks: ApiIntelRisk[];
}
