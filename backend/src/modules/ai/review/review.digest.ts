// review.digest.ts — builds the bounded ReviewDigest from the deterministic
// AnalysisResult. PURE & deterministic: no I/O, no Prisma, no Date.now(), no AI.
// Same (analysis, snapshot) ⇒ deep-equal digest.
//
// Determinism boundary (CLAUDE.md AI Safety Rule 3): this reads AnalysisResult
// and a structural histogram of the snapshot; it NEVER recomputes a score. The
// snapshot is used ONLY for per-type / per-status COUNTS (AnalysisResult exposes
// coverage percentages, not raw counts) and the project name/description — raw
// artifact bodies are never forwarded to the model.

import type { AnalysisResult, ExportSnapshot } from "../../exports/analysis/analysis.types.js";
import type { DigestArtifactRef, DigestList, DigestRisk, ReviewDigest } from "./review.types.js";

/** Default per-list cap. Keeps the prompt flat for 10 or 500 artifacts alike. */
export const REVIEW_DIGEST_CAP = 10;

function capList<T>(arr: readonly T[], cap: number): DigestList<T> {
  return { total: arr.length, shown: arr.slice(0, cap) };
}

/** Deterministic count histogram keyed by a string field, output key-sorted. */
function histogram(values: Array<string | undefined>, fallback = "UNKNOWN"): Record<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v ?? fallback;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const k of [...m.keys()].sort()) out[k] = m.get(k)!;
  return out;
}

function sum(rec: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(rec)) n += v;
  return n;
}

export function buildReviewDigest(
  analysis: AnalysisResult,
  snapshot: ExportSnapshot,
  cap: number = REVIEW_DIGEST_CAP,
): ReviewDigest {
  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];

  const byType = histogram(artifacts.map((a) => a.type));
  const byStatus = histogram(artifacts.map((a) => a.status));

  const orphans: DigestArtifactRef[] = analysis.connectivity.orphans.map((o) => ({
    id: o.id,
    title: o.title,
    type: o.type,
  }));
  const overCoupled: DigestArtifactRef[] = analysis.connectivity.overCoupled.map((o) => ({
    id: o.id,
    title: o.title,
    degree: o.degree,
  }));
  const hubs: DigestArtifactRef[] = analysis.connectivity.hubs.map((h) => ({
    id: h.id,
    title: h.title,
    degree: h.degree,
  }));
  const undocumented: DigestArtifactRef[] = analysis.documentation.undocumented.map((u) => ({
    id: u.id,
    title: u.title,
    type: u.type,
    status: u.status,
  }));
  const unimplementedRequirements: DigestArtifactRef[] = analysis.traceability.unimplementedRequirements.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
  }));
  const unlinkedResources: DigestArtifactRef[] = analysis.traceability.unlinkedResources.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
  }));
  const risks: DigestRisk[] = analysis.risks.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    severity: r.severity,
    message: r.message,
  }));

  const counts = {
    artifacts: analysis.documentation.total,
    relations: sum(analysis.connectivity.relationMix),
    byType,
    byStatus,
  };

  const digest: Omit<ReviewDigest, "evidenceKeys"> = {
    project: {
      id: analysis.meta.projectId,
      name: snapshot.project?.name ?? "",
      description: snapshot.project?.description ?? "",
    },
    health: {
      score: analysis.health.score,
      grade: analysis.health.grade,
      label: analysis.health.label,
      subScores: analysis.health.subScores,
      weights: analysis.health.weights,
    },
    counts,
    documentation: {
      coveragePct: analysis.documentation.coveragePct,
      documentedCount: analysis.documentation.documentedCount,
      total: analysis.documentation.total,
    },
    validation: {
      openCount: analysis.validation.openCount,
      bySeverity: analysis.validation.bySeverity,
      byCategory: analysis.validation.byCategory,
      weightedIssues: analysis.validation.weightedIssues,
    },
    governance: {
      memberCount: analysis.governance.memberCount,
      roleDistribution: analysis.governance.roleDistribution,
      lastValidatedAt: analysis.governance.lastValidatedAt,
      signals: analysis.governance.signals.map((s) => ({
        label: s.label,
        passed: s.passed,
        evidence: s.evidence,
      })),
    },
    traceability: {
      requirementCoverage: analysis.traceability.requirementCoverage,
      resourceLinkage: analysis.traceability.resourceLinkage,
      unimplementedRequirements: capList(unimplementedRequirements, cap),
      unlinkedResources: capList(unlinkedResources, cap),
    },
    connectivity: {
      avgDegree: analysis.connectivity.avgDegree,
      orphanCount: analysis.connectivity.orphanCount,
      orphans: capList(orphans, cap),
      overCoupled: capList(overCoupled, cap),
      hubs: capList(hubs, cap),
      relationMix: analysis.connectivity.relationMix,
    },
    undocumented: capList(undocumented, cap),
    apiIntel: {
      totalEndpoints: analysis.apiIntel.totalEndpoints,
      endpointPayloadCoveragePct: analysis.apiIntel.endpointPayloadCoveragePct,
      fieldMappingCoveragePct: analysis.apiIntel.fieldMappingCoveragePct,
      sensitiveExposureCount: analysis.apiIntel.sensitiveExposureCount,
      publicEndpointRiskCount: analysis.apiIntel.publicEndpointRiskCount,
    },
    risks: capList(risks, cap),
    cap,
  };

  return { ...digest, evidenceKeys: collectEvidenceKeys(digest) };
}

/**
 * The deterministic allow-list of citations the model may use. Built from the
 * digest so it stays in lock-step with what the model actually sees: fixed
 * metric-key paths, dynamic keyed-map entries, and the ids of every SHOWN list
 * item (a capped item the model never saw can never be cited). Sorted for a
 * stable, deep-equal result.
 */
export function collectEvidenceKeys(d: Omit<ReviewDigest, "evidenceKeys">): string[] {
  const keys = new Set<string>();
  const add = (k: string) => keys.add(k);

  // Fixed scalar metric paths.
  [
    "health.score", "health.grade", "health.label",
    "health.subScores.documentation", "health.subScores.connectivity",
    "health.subScores.traceability", "health.subScores.validation", "health.subScores.governance",
    "counts.artifacts", "counts.relations",
    "documentation.coveragePct", "documentation.documentedCount", "documentation.total",
    "validation.openCount", "validation.weightedIssues",
    "connectivity.avgDegree", "connectivity.orphanCount",
    "traceability.requirementCoverage", "traceability.resourceLinkage",
    "governance.memberCount", "governance.lastValidatedAt", "governance.signals",
    "apiIntel.totalEndpoints", "apiIntel.endpointPayloadCoveragePct",
    "apiIntel.fieldMappingCoveragePct", "apiIntel.sensitiveExposureCount",
    "apiIntel.publicEndpointRiskCount",
  ].forEach(add);

  // Dynamic keyed maps.
  for (const k of Object.keys(d.counts.byType)) add(`counts.byType.${k}`);
  for (const k of Object.keys(d.counts.byStatus)) add(`counts.byStatus.${k}`);
  for (const k of Object.keys(d.validation.bySeverity)) add(`validation.bySeverity.${k}`);
  for (const k of Object.keys(d.validation.byCategory)) add(`validation.byCategory.${k}`);
  for (const k of Object.keys(d.connectivity.relationMix)) add(`connectivity.relationMix.${k}`);
  for (const k of Object.keys(d.governance.roleDistribution)) add(`governance.roleDistribution.${k}`);

  // Ids of SHOWN list items (the only entities the model was given).
  const addIds = (list: DigestList<{ id: string }>) => list.shown.forEach((x) => add(x.id));
  addIds(d.connectivity.orphans);
  addIds(d.connectivity.overCoupled);
  addIds(d.connectivity.hubs);
  addIds(d.undocumented);
  addIds(d.traceability.unimplementedRequirements);
  addIds(d.traceability.unlinkedResources);
  for (const r of d.risks.shown) {
    add(r.id);
    add(r.ruleId);
    // Namespaced canonical-code key so the model can cite a finding by its rule
    // identity (e.g. "finding:DEPENDS_ON_DEPRECATED"), not only its row id.
    add(`finding:${r.ruleId}`);
  }

  return [...keys].sort();
}
