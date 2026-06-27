// lib/leverage.ts — the deterministic "highest-leverage action" rule for the
// Decision page. Pure: a selection over already-computed engine output
// (AnalysisResult + the OPEN validation issues + the artifacts list). NO AI, NO
// Date.now, NO new score — it RANKS existing artifacts by the degree the engine
// already computed and the flags it already produced; same inputs → same output.
//
// Leverage = highest impact (relation degree) × most broken (undocumented OR the
// subject of an open finding), with the weakest health dimension as context.

import type { Artifact, HealthSubScores, ProjectAnalysis, Severity, ValidationIssue } from "@/lib/types";
import { SUB_SCORE_LABELS } from "@/lib/health-score";

export interface WeakestDimension {
  key: keyof HealthSubScores;
  label: string;
  value: number;
}

export type LeverageResult =
  | { kind: "EMPTY" }
  | { kind: "NONE_FLAGGED"; weakest: WeakestDimension }
  | {
      kind: "ACTION";
      lever: { id: string; title: string; degree: number };
      verb: "Document" | "Resolve" | "Address";
      /** Predicate phrase that reads after the artifact name, e.g. "is undocumented". */
      problem: string;
      severity: Severity | null;
      isUndocumented: boolean;
      /** degree > 0 → frame as "widest reach"; degree 0 (orphan) → "most urgent". */
      widestReach: boolean;
      weakest: WeakestDimension;
      ctaKind: "DOCS" | "ARTIFACT";
    };

// Deterministic tie-break order for equal sub-scores.
const DIMENSION_ORDER: (keyof HealthSubScores)[] = [
  "documentation",
  "connectivity",
  "traceability",
  "validation",
  "governance",
];

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, ERROR: 3, WARNING: 2, INFO: 1 };
const sevRank = (s: Severity | null): number => (s ? SEVERITY_RANK[s] : 0);

function weakestDimension(subScores: HealthSubScores): WeakestDimension {
  let best: WeakestDimension | null = null;
  for (const key of DIMENSION_ORDER) {
    const value = subScores[key];
    if (best === null || value < best.value) best = { key, label: SUB_SCORE_LABELS[key], value };
  }
  // DIMENSION_ORDER is non-empty, so best is always set.
  return best as WeakestDimension;
}

export function selectLeverageAction(
  analysis: ProjectAnalysis,
  issues: ValidationIssue[],
  artifacts: Artifact[],
): LeverageResult {
  if (analysis.meta.emptyProject) return { kind: "EMPTY" };

  const weakest = weakestDimension(analysis.health.subScores);

  // Flagged set A — undocumented artifacts (engine's deterministic judgment).
  const undocumented = new Map<string, string>(); // id → title
  for (const u of analysis.documentation.undocumented) undocumented.set(u.id, u.title);

  // Flagged set B — artifacts that are the subject of an OPEN finding. artifactId
  // is the real FK, set ONLY for ARTIFACT-subject findings, so this is precise
  // per-artifact attribution. Track the worst severity per artifact.
  const worstSevByArtifact = new Map<string, Severity>();
  for (const i of issues) {
    if (i.status !== "OPEN" || !i.artifactId) continue;
    const cur = worstSevByArtifact.get(i.artifactId);
    if (!cur || SEVERITY_RANK[i.severity] > SEVERITY_RANK[cur]) worstSevByArtifact.set(i.artifactId, i.severity);
  }

  const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
  const degreeById = new Map(artifacts.map((a) => [a.id, a.relationCount ?? 0]));

  const candidateIds = new Set<string>([...undocumented.keys(), ...worstSevByArtifact.keys()]);
  if (candidateIds.size === 0) return { kind: "NONE_FLAGGED", weakest };

  interface Candidate {
    id: string;
    title: string;
    degree: number;
    severity: Severity | null;
    isUndocumented: boolean;
  }
  const candidates: Candidate[] = [];
  for (const id of candidateIds) {
    candidates.push({
      id,
      title: titleById.get(id) ?? undocumented.get(id) ?? id,
      degree: degreeById.get(id) ?? 0,
      severity: worstSevByArtifact.get(id) ?? null,
      isUndocumented: undocumented.has(id),
    });
  }

  // Highest leverage: degree desc → worst severity desc → title asc → id asc.
  candidates.sort(
    (a, b) =>
      b.degree - a.degree ||
      sevRank(b.severity) - sevRank(a.severity) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );

  const lever = candidates[0];
  const widestReach = lever.degree > 0;

  // Verb/problem priority: a blocking finding (ERROR/CRITICAL) > undocumented >
  // a soft finding (WARNING/INFO).
  const sev = lever.severity;
  const isBlocking = sev === "ERROR" || sev === "CRITICAL";
  let verb: "Document" | "Resolve" | "Address";
  let problem: string;
  if (isBlocking && sev) {
    verb = "Resolve";
    problem = `has an open ${sev.toLowerCase()} finding`;
  } else if (lever.isUndocumented) {
    verb = "Document";
    problem = "is undocumented";
  } else {
    verb = "Address";
    problem = `has an open ${(sev ?? "WARNING").toLowerCase()} finding`;
  }

  // Undocumented (and not blocking) → deep-link to the artifact's Documentation
  // tab; otherwise open the artifact.
  const ctaKind: "DOCS" | "ARTIFACT" = lever.isUndocumented && !isBlocking ? "DOCS" : "ARTIFACT";

  return {
    kind: "ACTION",
    lever: { id: lever.id, title: lever.title, degree: lever.degree },
    verb,
    problem,
    severity: sev,
    isUndocumented: lever.isUndocumented,
    widestReach,
    weakest,
    ctaKind,
  };
}
