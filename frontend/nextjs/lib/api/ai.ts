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

export const aiApi = {
  proposeBootstrap: (projectId: string, idea: string) =>
    apiClient.post<ProposeResult>(`/projects/${projectId}/ai/bootstrap/propose`, { idea }),
  applyBootstrap: (projectId: string, proposal: BootstrapProposal, sessionId?: string | null) =>
    apiClient.post<ApplyResult>(`/projects/${projectId}/ai/bootstrap/apply`, {
      proposal,
      sessionId: sessionId ?? undefined,
    }),
};
