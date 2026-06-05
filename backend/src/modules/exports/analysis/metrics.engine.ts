// Export Engine V2 — deterministic Architecture Analysis Engine.
//
//   ExportPackage.content  →  analyzeExportSnapshot(content)  →  AnalysisResult
//
// Hard guarantees (see project spec):
//  • Pure function: no I/O, no Prisma, no Express, no PDF, no AI.
//  • No Date.now(): the ONLY time reference is `snapshot.generatedAt`.
//  • Same snapshot ⇒ byte-identical AnalysisResult (every emitted list is
//    sorted by a fixed key with an id tie-break; every aggregate is
//    order-independent).
//
// This object is the shared foundation for the PDF renderer and any future AI
// analysis layer. Keep it free of presentation concerns.

import {
  CHURN_LIMIT,
  CHURN_WINDOW_DAYS,
  COUPLING_PENALTY_CAP,
  DEGREE_LIMIT,
  EMPTY_GRADE,
  GOV_RECENCY_DAYS,
  GRADE_BANDS,
  HEALTH_WEIGHTS,
  HUB_LIMIT,
  MS_PER_DAY,
  SEVERITY_RANK,
  SEVERITY_WEIGHT,
  TRACE_WEIGHTS,
  VALIDATION_K,
} from "./analysis.constants.js";
import type {
  AnalysisResult,
  ExportSnapshot,
  RiskFinding,
  SnapshotApiSpec,
  SnapshotArtifact,
  SnapshotDatabaseEntity,
  SnapshotDatabaseModel,
  SnapshotEndpoint,
  SnapshotIssue,
  SnapshotVersionEvent,
} from "./analysis.types.js";
import { analyzeApiIntelCounts } from "../../api-intel/api-metrics.js";

// ────────────────────────────── numeric helpers ──────────────────────────────

/** Round half-up to nearest integer (JS Math.round semantics). */
const ROUND = (x: number): number => Math.round(x);
/** Round to one decimal place — used only for the descriptive avgDegree. */
const ROUND_1 = (x: number): number => Math.round(x * 10) / 10;
const CLAMP = (lo: number, hi: number, x: number): number => Math.min(hi, Math.max(lo, x));

/** Integer percentage; null when the denominator is zero (renders as "N/A"). */
function PCT(n: number, d: number): number | null {
  return d === 0 ? null : ROUND((100 * n) / d);
}

/**
 * Weighted average over [value, weight] pairs. Null values are dropped and the
 * surviving weights renormalized. Returns null when every value is null.
 */
function weightedAvg(parts: Array<[number | null, number]>): number | null {
  let wsum = 0;
  let vsum = 0;
  for (const [v, w] of parts) {
    if (v == null) continue;
    wsum += w;
    vsum += v * w;
  }
  return wsum === 0 ? null : vsum / wsum;
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Documentation content from either the serialized snapshot or a raw artifact. */
function docContent(a: SnapshotArtifact): string {
  return (a.documentation?.markdownContent ?? a.documentationContent ?? "").toString();
}

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/** Parse an ISO timestamp to epoch ms; NaN-safe (returns null on bad input). */
function toMs(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function gradeFor(score: number | null): { grade: string; label: string } {
  if (score == null) return { grade: EMPTY_GRADE.grade, label: EMPTY_GRADE.label };
  const band = GRADE_BANDS.find((b) => score >= b.min && score <= b.max);
  return band ? { grade: band.grade, label: band.label } : { grade: EMPTY_GRADE.grade, label: EMPTY_GRADE.label };
}

// String comparison that does not depend on locale.
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ────────────────────────────── main entry ──────────────────────────────

export function analyzeExportSnapshot(content: unknown): AnalysisResult {
  const snap: ExportSnapshot =
    content && typeof content === "object" ? (content as ExportSnapshot) : {};

  const generatedAt =
    typeof snap.generatedAt === "string" ? snap.generatedAt : "";
  const nowMs = toMs(generatedAt); // null only if generatedAt is absent/invalid
  const projectId = snap.project?.id ?? "";

  const artifacts = asArray<SnapshotArtifact>(snap.artifacts);
  const relations = asArray<NonNullable<ExportSnapshot["relations"]>[number]>(snap.relations);
  const apiSpecs = asArray<NonNullable<ExportSnapshot["apiSpecs"]>[number]>(snap.apiSpecs);
  const databaseModels = asArray<NonNullable<ExportSnapshot["databaseModels"]>[number]>(snap.databaseModels);
  const diagrams = asArray<NonNullable<ExportSnapshot["diagrams"]>[number]>(snap.diagrams);
  const issues = asArray<SnapshotIssue>(snap.validationIssues);
  const events = asArray<SnapshotVersionEvent>(snap.versionHistory);
  const team = asArray<NonNullable<ExportSnapshot["team"]>[number]>(snap.team);

  const totalArtifacts = artifacts.length;
  const emptyProject = totalArtifacts === 0;

  // Keep relations to those whose endpoints are both real artifacts in-scope.
  const artifactById = new Map<string, SnapshotArtifact>();
  for (const a of artifacts) artifactById.set(a.id, a);
  const titleOf = (id: string): string => artifactById.get(id)?.title ?? id;

  const validRelations = relations.filter(
    (r) =>
      r.sourceArtifactId != null &&
      r.targetArtifactId != null &&
      artifactById.has(r.sourceArtifactId) &&
      artifactById.has(r.targetArtifactId),
  );

  // ─────────────── Documentation ───────────────
  const documentsTargets = new Set<string>();
  for (const r of validRelations) {
    if (r.relationType === "DOCUMENTS" && r.targetArtifactId) documentsTargets.add(r.targetArtifactId);
  }
  const covered = (a: SnapshotArtifact): boolean =>
    nonEmpty(docContent(a)) || documentsTargets.has(a.id);

  let documentedCount = 0;
  const byTypeTotal = new Map<string, number>();
  const byTypeCovered = new Map<string, number>();
  const byStatusTotal = new Map<string, number>();
  const byStatusCovered = new Map<string, number>();
  const undocumented: AnalysisResult["documentation"]["undocumented"] = [];

  for (const a of artifacts) {
    const t = a.type ?? "UNKNOWN";
    const s = a.status ?? "UNKNOWN";
    byTypeTotal.set(t, (byTypeTotal.get(t) ?? 0) + 1);
    byStatusTotal.set(s, (byStatusTotal.get(s) ?? 0) + 1);
    if (covered(a)) {
      documentedCount += 1;
      byTypeCovered.set(t, (byTypeCovered.get(t) ?? 0) + 1);
      byStatusCovered.set(s, (byStatusCovered.get(s) ?? 0) + 1);
    } else {
      undocumented.push({ id: a.id, title: a.title ?? a.id, type: t, status: s });
    }
  }
  undocumented.sort(
    (x, y) => cmp(x.type, y.type) || cmp(x.title, y.title) || cmp(x.id, y.id),
  );

  const byType: Record<string, number | null> = {};
  for (const [t, total] of byTypeTotal) byType[t] = PCT(byTypeCovered.get(t) ?? 0, total);
  const byStatus: Record<string, number | null> = {};
  for (const [s, total] of byStatusTotal) byStatus[s] = PCT(byStatusCovered.get(s) ?? 0, total);

  const coveragePct = PCT(documentedCount, totalArtifacts);

  const allEndpoints = apiSpecs.flatMap((s) => asArray<{ summary?: string }>(s.endpoints));
  const descriptive = {
    apiSpec: PCT(apiSpecs.filter((s) => nonEmpty(s.description)).length, apiSpecs.length),
    endpoint: PCT(allEndpoints.filter((e) => nonEmpty(e.summary)).length, allEndpoints.length),
    databaseModel: PCT(databaseModels.filter((m) => nonEmpty(m.description)).length, databaseModels.length),
    diagram: PCT(diagrams.filter((d) => nonEmpty(d.description)).length, diagrams.length),
  };

  const docScore = coveragePct ?? 100;

  // ─────────────── Connectivity ───────────────
  const degree = new Map<string, number>();
  for (const a of artifacts) degree.set(a.id, 0);
  const relationMix: Record<string, number> = {};
  for (const r of validRelations) {
    degree.set(r.sourceArtifactId!, (degree.get(r.sourceArtifactId!) ?? 0) + 1);
    degree.set(r.targetArtifactId!, (degree.get(r.targetArtifactId!) ?? 0) + 1);
    const rt = r.relationType ?? "UNKNOWN";
    relationMix[rt] = (relationMix[rt] ?? 0) + 1;
  }

  const orphans: AnalysisResult["connectivity"]["orphans"] = [];
  const overCoupled: AnalysisResult["connectivity"]["overCoupled"] = [];
  const hubsAll: Array<{ id: string; title: string; degree: number }> = [];
  for (const a of artifacts) {
    const d = degree.get(a.id) ?? 0;
    if (d === 0) orphans.push({ id: a.id, title: a.title ?? a.id, type: a.type ?? "UNKNOWN" });
    if (d > DEGREE_LIMIT) overCoupled.push({ id: a.id, title: a.title ?? a.id, degree: d });
    hubsAll.push({ id: a.id, title: a.title ?? a.id, degree: d });
  }
  orphans.sort((x, y) => cmp(x.title, y.title) || cmp(x.id, y.id));
  overCoupled.sort((x, y) => y.degree - x.degree || cmp(x.title, y.title) || cmp(x.id, y.id));
  const hubs = hubsAll
    .sort((x, y) => y.degree - x.degree || cmp(x.title, y.title) || cmp(x.id, y.id))
    .slice(0, HUB_LIMIT);

  const orphanRatio = totalArtifacts === 0 ? 0 : orphans.length / totalArtifacts;
  const avgDegree = totalArtifacts === 0 ? null : ROUND_1((2 * validRelations.length) / totalArtifacts);
  const couplingPenalty = Math.min(COUPLING_PENALTY_CAP, 3 * overCoupled.length);
  const connectivityScore = CLAMP(0, 100, ROUND(100 * (1 - orphanRatio) - couplingPenalty));

  // ─────────────── Traceability ───────────────
  const implementsTargets = new Set<string>();
  for (const r of validRelations) {
    if (r.relationType === "IMPLEMENTS" && r.targetArtifactId) implementsTargets.add(r.targetArtifactId);
  }
  const requirements = artifacts.filter((a) => a.type === "REQUIREMENT");
  const reqTraced = requirements.filter((a) => implementsTargets.has(a.id)).length;
  const requirementCoverageRatio = requirements.length === 0 ? null : reqTraced / requirements.length;
  const unimplementedRequirements = requirements
    .filter((a) => !implementsTargets.has(a.id))
    .map((a) => ({ id: a.id, title: a.title ?? a.id, status: a.status ?? "UNKNOWN" }))
    .sort((x, y) => cmp(x.status, y.status) || cmp(x.title, y.title) || cmp(x.id, y.id));

  type Resource = { id: string; title: string; kind: string; artifactId?: string | null };
  const resources: Resource[] = [
    ...apiSpecs.map((s) => ({ id: s.id, title: s.title ?? s.id, kind: "apiSpec", artifactId: s.artifactId })),
    ...databaseModels.map((m) => ({ id: m.id, title: m.title ?? m.id, kind: "databaseModel", artifactId: m.artifactId })),
    ...diagrams.map((d) => ({ id: d.id, title: d.title ?? d.id, kind: "diagram", artifactId: d.artifactId })),
  ];
  const linkedResources = resources.filter((r) => r.artifactId != null).length;
  const resourceLinkageRatio = resources.length === 0 ? null : linkedResources / resources.length;
  const unlinkedResources = resources
    .filter((r) => r.artifactId == null)
    .map((r) => ({ id: r.id, title: r.title, kind: r.kind }))
    .sort((x, y) => cmp(x.kind, y.kind) || cmp(x.title, y.title) || cmp(x.id, y.id));

  const traceabilityRatio = weightedAvg([
    [requirementCoverageRatio, TRACE_WEIGHTS.requirement],
    [resourceLinkageRatio, TRACE_WEIGHTS.resource],
  ]);
  const traceabilityScore = ROUND(100 * (traceabilityRatio ?? 1));

  // ─────────────── Governance ───────────────
  const memberCount = team.length;
  const roleDistribution: Record<string, number> = {};
  for (const m of team) {
    const role = m.role ?? "UNKNOWN";
    roleDistribution[role] = (roleDistribution[role] ?? 0) + 1;
  }
  const owners = roleDistribution["OWNER"] ?? 0;
  const architects = roleDistribution["ARCHITECT"] ?? 0;

  let lastValidatedMs: number | null = null;
  for (const e of events) {
    if (e.action !== "VALIDATED") continue;
    const t = toMs(e.createdAt);
    if (t != null && (lastValidatedMs == null || t > lastValidatedMs)) lastValidatedMs = t;
  }
  const lastValidatedAt =
    lastValidatedMs == null
      ? null
      : (events.find((e) => e.action === "VALIDATED" && toMs(e.createdAt) === lastValidatedMs)?.createdAt ?? null);

  const ownerAssigned = snap.project?.ownerId != null;
  const hasReviewCapacity = architects >= 1 || owners >= 2;
  const notSingleMember = memberCount > 1;
  const recentlyValidated =
    lastValidatedMs != null && nowMs != null && nowMs - lastValidatedMs <= GOV_RECENCY_DAYS * MS_PER_DAY;

  const governanceScore =
    25 * Number(ownerAssigned) +
    25 * Number(hasReviewCapacity) +
    25 * Number(notSingleMember) +
    25 * Number(recentlyValidated);

  const signals = [
    {
      label: "Project owner assigned",
      passed: ownerAssigned,
      evidence: ownerAssigned ? `Owner ${snap.project?.ownerId}` : "No owner set",
    },
    {
      label: "Architectural review capacity",
      passed: hasReviewCapacity,
      evidence: `${architects} architect(s), ${owners} owner(s)`,
    },
    {
      label: "Multiple team members",
      passed: notSingleMember,
      evidence: `${memberCount} member(s)`,
    },
    {
      label: `Recently validated (≤ ${GOV_RECENCY_DAYS}d)`,
      passed: recentlyValidated,
      evidence: lastValidatedAt ? `Last validated ${lastValidatedAt}` : "Never validated",
    },
  ];

  // ─────────────── Validation ───────────────
  const openIssues = issues.filter((v) => v.status === "OPEN");
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let weightedIssues = 0;
  for (const v of openIssues) {
    const sev = v.severity ?? "INFO";
    const cat = v.category ?? "UNKNOWN";
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    weightedIssues += SEVERITY_WEIGHT[sev] ?? 0;
  }
  const validationScore =
    totalArtifacts === 0 ? 100 : CLAMP(0, 100, ROUND(100 - VALIDATION_K * (weightedIssues / totalArtifacts)));

  // ─────────────── Composite health ───────────────
  const subScores = {
    documentation: docScore,
    connectivity: connectivityScore,
    traceability: traceabilityScore,
    validation: validationScore,
    governance: governanceScore,
  };
  const healthScore = emptyProject
    ? null
    : ROUND(
        subScores.documentation * HEALTH_WEIGHTS.documentation +
          subScores.connectivity * HEALTH_WEIGHTS.connectivity +
          subScores.traceability * HEALTH_WEIGHTS.traceability +
          subScores.validation * HEALTH_WEIGHTS.validation +
          subScores.governance * HEALTH_WEIGHTS.governance,
      );
  const { grade, label } = gradeFor(healthScore);

  // ─────────────── Risk detection ───────────────
  const risks = buildRisks({
    artifacts,
    validRelations,
    openIssues,
    events,
    nowMs,
    titleOf,
    degree,
    covered,
    resources,
    owners,
    recentlyValidated,
    lastValidatedAt,
  });

  // ── API Payload Intelligence (deterministic; reuses the api-intel analyzer) ──
  const apiIntelCounts = analyzeApiIntelCounts({
    specs: apiSpecs.map((s) => ({
      id: s.id,
      artifactId: s.artifactId ?? null,
      title: s.title ?? "",
      endpoints: asArray<SnapshotEndpoint>((s as SnapshotApiSpec).endpoints).map((e) => ({
        id: e.id ?? "",
        method: e.method ?? "",
        path: e.path ?? "",
        summary: e.summary ?? "",
        requestSchema: e.requestSchema ?? "",
        responseSchema: e.responseSchema ?? "",
        requiresAuth: e.requiresAuth ?? false,
      })),
    })),
    models: databaseModels.map((m) => ({
      id: m.id,
      artifactId: m.artifactId ?? null,
      title: m.title ?? "",
      entities: asArray<SnapshotDatabaseEntity>((m as SnapshotDatabaseModel).entities).map((en) => ({
        id: en.id ?? "",
        name: en.name ?? "",
        fields: asArray<{ name?: string }>(en.fields).map((f) => ({ name: f.name ?? "" })),
      })),
    })),
  });
  const apiIntel = {
    totalEndpoints: apiIntelCounts.totalEndpoints,
    endpointsWithPayload: apiIntelCounts.endpointsWithPayload,
    endpointPayloadCoveragePct: PCT(apiIntelCounts.endpointsWithPayload, apiIntelCounts.totalEndpoints),
    idLikeFields: apiIntelCounts.idLikeFieldTotal,
    mappedFields: apiIntelCounts.mappedFieldTotal,
    fieldMappingCoveragePct: PCT(apiIntelCounts.mappedFieldTotal, apiIntelCounts.idLikeFieldTotal),
    sensitiveExposureCount: apiIntelCounts.sensitiveExposureCount,
    publicEndpointRiskCount: apiIntelCounts.publicEndpointRiskCount,
    sensitiveExposures: apiIntelCounts.sensitiveExposures,
    risks: apiIntelCounts.risks,
  };

  return {
    meta: { generatedAt, projectId, emptyProject },
    health: { score: healthScore, grade, label, subScores, weights: { ...HEALTH_WEIGHTS } },
    documentation: {
      coveragePct,
      documentedCount,
      total: totalArtifacts,
      byType,
      byStatus,
      undocumented,
      descriptive,
    },
    connectivity: {
      avgDegree,
      orphanCount: orphans.length,
      orphans,
      overCoupled,
      hubs,
      relationMix,
    },
    traceability: {
      requirementCoverage: requirementCoverageRatio == null ? null : ROUND(100 * requirementCoverageRatio),
      unimplementedRequirements,
      resourceLinkage: resourceLinkageRatio == null ? null : ROUND(100 * resourceLinkageRatio),
      unlinkedResources,
    },
    governance: { memberCount, roleDistribution, lastValidatedAt, signals },
    validation: { openCount: openIssues.length, bySeverity, byCategory, weightedIssues },
    apiIntel,
    risks,
  };
}

// ────────────────────────────── risk synthesis ──────────────────────────────

interface RiskCtx {
  artifacts: SnapshotArtifact[];
  validRelations: Array<{ sourceArtifactId?: string; targetArtifactId?: string; relationType?: string }>;
  openIssues: SnapshotIssue[];
  events: SnapshotVersionEvent[];
  nowMs: number | null;
  titleOf: (id: string) => string;
  degree: Map<string, number>;
  covered: (a: SnapshotArtifact) => boolean;
  resources: Array<{ artifactId?: string | null }>;
  owners: number;
  recentlyValidated: boolean;
  lastValidatedAt: string | null;
}

function buildRisks(ctx: RiskCtx): RiskFinding[] {
  const {
    artifacts,
    validRelations,
    openIssues,
    events,
    nowMs,
    titleOf,
    degree,
    covered,
    resources,
    owners,
    recentlyValidated,
    lastValidatedAt,
  } = ctx;

  const findings: RiskFinding[] = [];

  // (a) Carry through every OPEN validation issue.
  for (const v of openIssues) {
    const aid = v.artifactId ?? "";
    findings.push({
      id: v.id ?? `VALIDATION_ISSUE:${aid}:${v.message ?? ""}`,
      ruleId: "VALIDATION_ISSUE",
      severity: v.severity ?? "INFO",
      message: v.message ?? "Validation issue",
      evidence: [
        { type: "artifact", id: aid, title: titleOf(aid) },
        { type: "category", value: v.category ?? "UNKNOWN" },
      ],
    });
  }

  // (b) Derived architecture risks.
  const incoming = new Map<string, number>();
  const linkedArtifactIds = new Set<string>();
  for (const r of validRelations) {
    if (r.targetArtifactId) incoming.set(r.targetArtifactId, (incoming.get(r.targetArtifactId) ?? 0) + 1);
  }
  for (const res of resources) if (res.artifactId) linkedArtifactIds.add(res.artifactId);

  const implementsTargets = new Set<string>();
  for (const r of validRelations) {
    if (r.relationType === "IMPLEMENTS" && r.targetArtifactId) implementsTargets.add(r.targetArtifactId);
  }

  for (const a of artifacts) {
    const d = degree.get(a.id) ?? 0;
    const inc = incoming.get(a.id) ?? 0;

    if (a.status === "DEPRECATED" && inc > 0) {
      findings.push({
        id: `DEPRECATED_REFERENCED:${a.id}`,
        ruleId: "DEPRECATED_REFERENCED",
        severity: "ERROR",
        message: `Deprecated artifact "${a.title ?? a.id}" still has ${inc} incoming reference(s).`,
        evidence: [{ type: "artifact", id: a.id, title: a.title ?? a.id }, { type: "count", value: inc }],
      });
    }
    if (d === 0) {
      findings.push({
        id: `ORPHAN_ARTIFACT:${a.id}`,
        ruleId: "ORPHAN_ARTIFACT",
        severity: "WARNING",
        message: `Artifact "${a.title ?? a.id}" is orphaned — no relations.`,
        evidence: [{ type: "artifact", id: a.id, title: a.title ?? a.id }],
      });
    }
    if (d > DEGREE_LIMIT) {
      findings.push({
        id: `OVER_COUPLED:${a.id}`,
        ruleId: "OVER_COUPLED",
        severity: "INFO",
        message: `Artifact "${a.title ?? a.id}" has ${d} relations — consider splitting responsibilities.`,
        evidence: [{ type: "artifact", id: a.id, title: a.title ?? a.id }, { type: "degree", value: d }],
      });
    }
    if (a.type === "REQUIREMENT" && !implementsTargets.has(a.id)) {
      findings.push({
        id: `UNIMPLEMENTED_REQUIREMENT:${a.id}`,
        ruleId: "UNIMPLEMENTED_REQUIREMENT",
        severity: "WARNING",
        message: `Requirement "${a.title ?? a.id}" has no inbound IMPLEMENTS relation.`,
        evidence: [{ type: "artifact", id: a.id, title: a.title ?? a.id }],
      });
    }
    if (a.type === "SECURITY_POLICY" && !covered(a)) {
      findings.push({
        id: `UNDOCUMENTED_SECURITY_POLICY:${a.id}`,
        ruleId: "UNDOCUMENTED_SECURITY_POLICY",
        severity: "ERROR",
        message: `Security policy "${a.title ?? a.id}" is undocumented.`,
        evidence: [{ type: "artifact", id: a.id, title: a.title ?? a.id }],
      });
    }
    if (a.type === "SERVICE" && d === 0 && !linkedArtifactIds.has(a.id)) {
      findings.push({
        id: `UNLINKED_SERVICE:${a.id}`,
        ruleId: "UNLINKED_SERVICE",
        severity: "WARNING",
        message: `Service "${a.title ?? a.id}" has no relations and no linked API/DB/diagram.`,
        evidence: [{ type: "artifact", id: a.id, title: a.title ?? a.id }],
      });
    }
  }

  // Project-level risks.
  if (owners === 1) {
    findings.push({
      id: "SINGLE_OWNER",
      ruleId: "SINGLE_OWNER",
      severity: "INFO",
      message: "Project has exactly one OWNER — continuity risk.",
      evidence: [{ type: "count", value: owners }],
    });
  }
  if (!recentlyValidated) {
    findings.push({
      id: "STALE_VALIDATION",
      ruleId: "STALE_VALIDATION",
      severity: "INFO",
      message: `No validation run within the last ${GOV_RECENCY_DAYS} days.`,
      evidence: [{ type: "timestamp", value: lastValidatedAt ?? "never" }],
    });
  }

  // HIGH_CHURN — CREATED/UPDATED events per artifact inside the churn window.
  if (nowMs != null) {
    const windowStart = nowMs - CHURN_WINDOW_DAYS * MS_PER_DAY;
    const churn = new Map<string, number>();
    for (const e of events) {
      if (e.action !== "CREATED" && e.action !== "UPDATED") continue;
      const t = toMs(e.createdAt);
      if (t == null || t < windowStart || t > nowMs) continue;
      if (!e.entityId) continue;
      churn.set(e.entityId, (churn.get(e.entityId) ?? 0) + 1);
    }
    const artifactIds = new Set(artifacts.map((a) => a.id));
    for (const [entityId, count] of churn) {
      if (count > CHURN_LIMIT && artifactIds.has(entityId)) {
        findings.push({
          id: `HIGH_CHURN:${entityId}`,
          ruleId: "HIGH_CHURN",
          severity: "INFO",
          message: `Artifact "${titleOf(entityId)}" changed ${count} times in ${CHURN_WINDOW_DAYS} days.`,
          evidence: [{ type: "artifact", id: entityId, title: titleOf(entityId) }, { type: "count", value: count }],
        });
      }
    }
  }

  // Deterministic ordering: severity, then ruleId, then primary artifact id.
  const primaryArtifactId = (f: RiskFinding): string =>
    f.evidence.find((e) => e.type === "artifact")?.id ?? "";
  findings.sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99) ||
      cmp(a.ruleId, b.ruleId) ||
      cmp(primaryArtifactId(a), primaryArtifactId(b)) ||
      cmp(a.id, b.id),
  );

  return findings;
}
