// finding-rules.ts — the single pure implementation of the overlapping
// architecture/relationship rules.
//
// These five rules used to be implemented TWICE (validation.engine + the analysis
// engine's derived-risk block) with drifting names and severities. They now live
// here once. The validation engine builds a model from Prisma and persists the
// output (status-aware); the analysis engine consumes the persisted findings via
// its status-aware carry-through, so it never re-derives them and can never
// resurface an IGNORED finding. (This module is the producer; severities/messages
// match the prior validation behaviour exactly so persisted issues — and their
// IGNORED waivers — are unchanged.)
//
// Pure + deterministic: no IO, no clock, no randomness. Time-window logic (churn)
// is pre-computed by the caller into `churnByArtifact` so this stays clock-free.

import { getFinding } from "./finding-catalog.js";
import type { FindingSeverity } from "./finding-types.js";

export interface ModelArtifact {
  id: string;
  title: string;
  status: string;
}
export interface ModelRelation {
  sourceArtifactId: string;
  targetArtifactId: string;
}
export interface ProjectFindingModel {
  artifacts: ModelArtifact[];
  /** In-project relations only (both endpoints are project artifacts). */
  relations: ModelRelation[];
  /** Per-artifact CREATED/UPDATED count inside the churn window (caller-computed). */
  churnByArtifact: Map<string, number>;
}

export interface RuleFinding {
  code: string;
  /** The artifact the finding is attributed to. */
  artifactId: string;
  severity: FindingSeverity;
  message: string;
}

// Thresholds (kept identical to the prior validation + analysis behaviour).
export const DEGREE_LIMIT = 6; // HIGH_FAN_OUT fires for degree > 6
export const CHURN_LIMIT = 5; // HIGH_CHURN fires for churn > 5
export const DEPRECATED_REF_THRESHOLD = 2; // DEPRECATED_STILL_REFERENCED fires for incoming > 2

const sevOf = (code: string): FindingSeverity => getFinding(code)!.severity;

/**
 * Produce the canonical architecture findings for a project model. Output order
 * is deterministic (code, then artifactId, then message).
 */
export function analyzeArchitectureFindings(model: ProjectFindingModel): RuleFinding[] {
  const { artifacts, relations, churnByArtifact } = model;
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const findings: RuleFinding[] = [];

  // ORPHAN_ARTIFACT — no incoming or outgoing relations.
  for (const a of artifacts) {
    const hasIncoming = relations.some((r) => r.targetArtifactId === a.id);
    const hasOutgoing = relations.some((r) => r.sourceArtifactId === a.id);
    if (!hasIncoming && !hasOutgoing) {
      findings.push({
        code: "ORPHAN_ARTIFACT",
        artifactId: a.id,
        severity: sevOf("ORPHAN_ARTIFACT"),
        message: `Artifact "${a.title}" is orphaned — no incoming or outgoing relations.`,
      });
    }
  }

  // DEPENDS_ON_DEPRECATED — an ACTIVE artifact pointing at a DEPRECATED one (per edge).
  for (const r of relations) {
    const src = byId.get(r.sourceArtifactId);
    const tgt = byId.get(r.targetArtifactId);
    if (!src || !tgt) continue;
    if (tgt.status === "DEPRECATED" && src.status === "ACTIVE") {
      findings.push({
        code: "DEPENDS_ON_DEPRECATED",
        artifactId: src.id,
        severity: sevOf("DEPENDS_ON_DEPRECATED"),
        message: `Active artifact "${src.title}" depends on deprecated artifact "${tgt.title}".`,
      });
    }
  }

  // Per-artifact degree/churn/deprecation rules.
  for (const a of artifacts) {
    const degree = relations.filter((r) => r.sourceArtifactId === a.id || r.targetArtifactId === a.id).length;
    if (degree > DEGREE_LIMIT) {
      findings.push({
        code: "HIGH_FAN_OUT",
        artifactId: a.id,
        severity: sevOf("HIGH_FAN_OUT"),
        message: `Artifact "${a.title}" has ${degree} relations — consider splitting responsibilities.`,
      });
    }

    const churn = churnByArtifact.get(a.id) ?? 0;
    if (churn > CHURN_LIMIT) {
      findings.push({
        code: "HIGH_CHURN",
        artifactId: a.id,
        severity: sevOf("HIGH_CHURN"),
        message: `Artifact "${a.title}" was changed ${churn} times in the last 7 days.`,
      });
    }

    if (a.status === "DEPRECATED") {
      const incoming = relations.filter((r) => r.targetArtifactId === a.id).length;
      if (incoming > DEPRECATED_REF_THRESHOLD) {
        findings.push({
          code: "DEPRECATED_STILL_REFERENCED",
          artifactId: a.id,
          severity: sevOf("DEPRECATED_STILL_REFERENCED"),
          message: `Deprecated artifact "${a.title}" still has ${incoming} incoming references.`,
        });
      }
    }
  }

  return findings.sort(
    (x, y) =>
      (x.code < y.code ? -1 : x.code > y.code ? 1 : 0) ||
      (x.artifactId < y.artifactId ? -1 : x.artifactId > y.artifactId ? 1 : 0) ||
      (x.message < y.message ? -1 : x.message > y.message ? 1 : 0),
  );
}
