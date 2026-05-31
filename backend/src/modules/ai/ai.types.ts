// ai.types.ts — DTOs for the AI Bootstrap Wizard (propose → review → apply).
// Pure types: no Express/Prisma runtime, only Prisma enum *types* for safety.
// Mirrored on the frontend in lib/api/ai.ts.

import type { ArtifactType, RelationType } from "@prisma/client";

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

export interface BootstrapProposal {
  summary: string;
  artifacts: ProposedArtifact[];
  relations: ProposedRelation[];
  diagrams: ProposedDiagram[];
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

export interface ValidationReport {
  /** false ⇒ apply is refused (422); nothing is created. */
  ok: boolean;
  /** Batch-level hard errors (e.g. nothing selectable). */
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
