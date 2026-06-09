// ai.types.ts — DTOs for the AI Bootstrap Wizard (propose → review → apply).
// Pure types: no Express/Prisma runtime, only Prisma enum *types* for safety.
// Mirrored on the frontend in lib/api/ai.ts.

import type { ArtifactType, DatabaseType, HttpMethod, RelationType } from "@prisma/client";

// ── Proposal (what the model emits, what the user edits/selects) ──

export interface ProposedArtifact {
  title: string;
  type: ArtifactType;
  rationale: string;
  /** Model self-rated confidence in [0,1]. Advisory only — never gates apply. */
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

// ── Database (Bootstrap V2, Phase 1) ──

export interface ProposedDatabaseField {
  name: string;
  type: string;
  required: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  /** FK target: an entity name within the SAME model. Resolved to an id at apply. */
  referencesEntityName?: string | null;
  /**
   * Optional PRECISE FK target: the referenced column name within the referenced
   * entity. Optional/back-compat — older proposals omit it; apply then falls back
   * to the referenced entity's single primary key. Resolved to a field id at apply.
   */
  referencesFieldName?: string | null;
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
  /** Optional owning-artifact link by exact title; dropped if it doesn't resolve. */
  artifactTitle?: string | null;
  entities: ProposedDatabaseEntity[];
  confidence: number;
}

// ── API catalog (Bootstrap V2, Phase 2) ──

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
  /** Optional owning-artifact link by exact title; dropped if it doesn't resolve. */
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

// ── Deterministic validation report (preview at propose, authoritative at apply) ──

export interface ItemDecision {
  accepted: boolean;
  /** Why an item was not accepted (shown in the review UI / skipped list). */
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
  /**
   * All architecture node labels the diagram references (extracted from the
   * Mermaid source, original-case, deduped). Lets the review UI warn live when
   * the user deselects an artifact a selected diagram depends on. Absent when the
   * Mermaid failed to parse.
   */
  nodes?: string[];
  /**
   * The subset of `nodes` that did NOT resolve to a selected / existing artifact
   * at validation time. Non-empty ⇒ `accepted:false` (the diagram would drift
   * from the SSOT and is rejected at apply).
   */
  unresolvedNodes?: string[];
}

// Database decisions are nested model → entity → field so the review UI can show
// exactly which child was skipped (and why) under each accepted model.
export interface DatabaseFieldDecision extends ItemDecision {
  name: string;
  /** Set when this field's `referencesEntityName` resolved to a sibling entity. */
  resolvedReference?: boolean;
  /**
   * Set when this field's `referencesFieldName` resolved to a column of the
   * referenced entity (advisory — apply re-resolves authoritatively and also
   * applies the single-PK fallback). Absent when no precise column was given/matched.
   */
  resolvedFieldReference?: boolean;
}
export interface DatabaseEntityDecision extends ItemDecision {
  name: string;
  fields: DatabaseFieldDecision[];
}
export interface DatabaseModelDecision extends ItemDecision {
  title: string;
  entities: DatabaseEntityDecision[];
  /** True when `artifactTitle` resolved and the model will be linked to that artifact. */
  artifactLinked?: boolean;
}

// API decisions are nested spec → endpoint, mirroring the database model → entity
// shape, so the review UI can show which endpoint was skipped under each spec.
export interface ApiEndpointDecision extends ItemDecision {
  method: HttpMethod;
  path: string;
}
export interface ApiSpecDecision extends ItemDecision {
  title: string;
  endpoints: ApiEndpointDecision[];
  /** True when `artifactTitle` resolved and the spec will be linked to that artifact. */
  artifactLinked?: boolean;
}

export interface ValidationReport {
  /** false ⇒ apply is refused (422); nothing is created. */
  ok: boolean;
  /** Batch-level hard errors (e.g. nothing selectable). */
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
