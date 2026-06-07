// advisor.service.test.ts — persistence + read orchestration for the Advisor mode
// of AI Review, exercised through the __setAdvisorDeps injection seam with
// in-memory fakes (no DB, no network, no export engine). Covers the consolidation
// spec's behavioral requirements:
//   1. an advisory is PERSISTED on generate
//   2. the latest advisory can be fetched back
//   3. fetching reuses the stored result with NO new AI call
//   4. staleness is reported when the project changed since generation
//   5. Review and Advisor histories are separated (listAdvisors returns ADVISOR only)
//   6. unsupported recommendations are discarded by generate's verification policy
// Run with: npm run test:unit

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  generateArchitectureAdvisory,
  getLatestAdvisor,
  getAdvisorById,
  listAdvisors,
  __setAdvisorDeps,
} from "./advisor.service.js";
import type { AnalysisContext } from "../architecture/analysis-runner.js";
import type { ReviewDigest } from "../review/review.types.js";
import type { AnalysisResult, ExportSnapshot } from "../../exports/analysis/analysis.types.js";
import type { AiProvider, StructuredResult } from "../providers/ai.provider.js";

// ── Fakes ──────────────────────────────────────────────────────────────────

/** Minimal ReviewDigest whose only load-bearing field for tests is evidenceKeys. */
function digest(evidenceKeys: string[]): ReviewDigest {
  return {
    project: { id: "p1", name: "Proj", description: "" },
    health: { score: 50, grade: "D", label: "At Risk", subScores: {} as never, weights: {} as never },
    counts: { artifacts: 1, relations: 0, byType: {}, byStatus: {} },
    documentation: { coveragePct: 0, documentedCount: 0, total: 1 },
    validation: { openCount: 0, bySeverity: {}, byCategory: {}, weightedIssues: 0 },
    governance: { memberCount: 1, roleDistribution: {}, lastValidatedAt: null, signals: [] },
    traceability: {
      requirementCoverage: null, resourceLinkage: null,
      unimplementedRequirements: { total: 0, shown: [] }, unlinkedResources: { total: 0, shown: [] },
    },
    connectivity: {
      avgDegree: null, orphanCount: 0,
      orphans: { total: 0, shown: [] }, overCoupled: { total: 0, shown: [] }, hubs: { total: 0, shown: [] },
      relationMix: {},
    },
    undocumented: { total: 0, shown: [] },
    apiIntel: {
      totalEndpoints: 0, endpointPayloadCoveragePct: null, fieldMappingCoveragePct: null,
      sensitiveExposureCount: 0, publicEndpointRiskCount: 0,
    },
    risks: { total: 0, shown: [] },
    evidenceKeys,
    cap: 10,
  };
}

function context(analysisHash: string, evidenceKeys: string[]): AnalysisContext {
  return {
    content: {} as unknown as ExportSnapshot,
    analysis: { meta: { generatedAt: "2026-06-07T12:00:00.000Z", projectId: "p1" } } as unknown as AnalysisResult,
    digest: digest(evidenceKeys),
    analysisHash,
    generatedAt: "2026-06-07T12:00:00.000Z",
  };
}

/** A fake provider returning a canned, schema-valid advisory; counts its calls. */
function fakeProvider(toolData: unknown): AiProvider & { calls: number } {
  return {
    calls: 0,
    async generateStructured(): Promise<StructuredResult> {
      this.calls += 1;
      return {
        data: toolData,
        model: "fake-model",
        usage: { inputTokens: 10, outputTokens: 20 },
        stopReason: "tool_use",
        maxTokens: 6000,
        durationMs: 1,
      };
    },
  };
}

function advisoryToolData(over: Record<string, unknown> = {}): unknown {
  return {
    executiveSummary: "What to investigate next.",
    focusAreas: [],
    opportunities: [],
    recommendations: [
      { title: "Link security policy", priority: "HIGH", rationale: "exposure", evidence: [{ kind: "metric", ref: "health.score" }] },
    ],
    ...over,
  };
}

interface FakeRow {
  id: string;
  projectId: string;
  kind: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  analysisHash: string | null;
  proposal: unknown;
  createdAt: Date;
}

/** In-memory stand-in for prisma.aiSession (only the methods the service uses). */
function fakeDb(seed: FakeRow[] = []) {
  const rows: FakeRow[] = [...seed];
  let n = 0;
  const matches = (row: FakeRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);
  const byNewest = (a: FakeRow, b: FakeRow) => b.createdAt.getTime() - a.createdAt.getTime();
  const aiSession = {
    async create({ data }: { data: Record<string, unknown> }) {
      n += 1;
      const row: FakeRow = {
        id: `adv-${n}`,
        projectId: data.projectId as string,
        kind: data.kind as string,
        model: (data.model as string) ?? "",
        promptTokens: (data.promptTokens as number) ?? 0,
        completionTokens: (data.completionTokens as number) ?? 0,
        analysisHash: (data.analysisHash as string | null) ?? null,
        proposal: data.proposal,
        createdAt: new Date(2026, 5, 7, 12, 0, n), // strictly increasing
      };
      rows.push(row);
      return row;
    },
    async findFirst({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) {
      const found = rows.filter((r) => matches(r, where));
      if (orderBy) found.sort(byNewest);
      return found[0] ?? null;
    },
    async findMany({ where }: { where: Record<string, unknown>; orderBy?: unknown; select?: unknown }) {
      return rows.filter((r) => matches(r, where)).sort(byNewest);
    },
    _rows: rows,
  };
  return { aiSession };
}

afterEach(() => __setAdvisorDeps(null));

// ── Tests ─────────────────────────────────────────────────────────────────

test("generate persists an ADVISOR session and returns its id (req. 1)", async () => {
  const db = fakeDb();
  const provider = fakeProvider(advisoryToolData());
  __setAdvisorDeps({
    db: db as unknown as never,
    provider,
    loadContext: async () => context("HASH_A", ["health.score"]),
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_A" }),
  });

  const result = await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });

  assert.equal(db.aiSession._rows.length, 1, "exactly one row persisted");
  assert.equal(db.aiSession._rows[0].kind, "ADVISOR");
  assert.equal(db.aiSession._rows[0].analysisHash, "HASH_A");
  assert.equal(result.id, "adv-1");
  assert.equal(result.stale, false);
  // The persisted payload contains the verified report.
  const stored = db.aiSession._rows[0].proposal as { report: { recommendations: unknown[] } };
  assert.equal(stored.report.recommendations.length, 1);
});

test("latest advisory can be fetched back after generate (req. 2)", async () => {
  const db = fakeDb();
  __setAdvisorDeps({
    db: db as unknown as never,
    provider: fakeProvider(advisoryToolData()),
    loadContext: async () => context("HASH_A", ["health.score"]),
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_A" }),
  });

  const gen = await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });
  const latest = await getLatestAdvisor("p1");

  assert.ok(latest);
  assert.equal(latest.id, gen.id);
  assert.equal(latest.report.recommendations[0].title, "Link security policy");
});

test("fetching the latest advisory does NOT make a new AI call (req. 3)", async () => {
  const db = fakeDb();
  const provider = fakeProvider(advisoryToolData());
  __setAdvisorDeps({
    db: db as unknown as never,
    provider,
    loadContext: async () => context("HASH_A", ["health.score"]),
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_A" }),
  });

  await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });
  assert.equal(provider.calls, 1, "generate calls the provider once");

  await getLatestAdvisor("p1");
  await getAdvisorById("p1", "adv-1");
  assert.equal(provider.calls, 1, "reads reuse the stored result — no new AI call");
});

test("staleness: a fetched advisory is stale when the project changed since generation (req. 4)", async () => {
  const db = fakeDb();
  __setAdvisorDeps({
    db: db as unknown as never,
    provider: fakeProvider(advisoryToolData()),
    loadContext: async () => context("HASH_A", ["health.score"]), // generated against HASH_A
    // …but the project's CURRENT hash is now different:
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_B" }),
  });

  await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });
  const latest = await getLatestAdvisor("p1");
  assert.ok(latest);
  assert.equal(latest.stale, true);
});

test("Review and Advisor histories are separated (req. 5)", async () => {
  // Seed a REVIEW row that must NOT appear in advisor history.
  const db = fakeDb([
    { id: "rev-1", projectId: "p1", kind: "REVIEW", model: "m", promptTokens: 0, completionTokens: 0, analysisHash: "X", proposal: {}, createdAt: new Date(2026, 5, 1) },
  ]);
  __setAdvisorDeps({
    db: db as unknown as never,
    provider: fakeProvider(advisoryToolData()),
    loadContext: async () => context("HASH_A", ["health.score"]),
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_A" }),
  });

  await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });
  await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });

  const history = await listAdvisors("p1");
  assert.equal(history.length, 2, "only the two ADVISOR rows, not the REVIEW row");
  assert.ok(history.every((h) => h.id.startsWith("adv-")));
});

test("generate discards an unsupported recommendation (verification policy runs, req. 6)", async () => {
  const db = fakeDb();
  // The recommendation cites a ref NOT in evidenceKeys → must be discarded.
  const provider = fakeProvider(advisoryToolData({
    recommendations: [{ title: "Invented", priority: "HIGH", rationale: "x", evidence: [{ kind: "metric", ref: "not.a.real.key" }] }],
  }));
  __setAdvisorDeps({
    db: db as unknown as never,
    provider,
    loadContext: async () => context("HASH_A", ["health.score"]),
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_A" }),
  });

  const result = await generateArchitectureAdvisory({ projectId: "p1", userId: "u1" });
  assert.equal(result.report.recommendations.length, 0, "unsupported recommendation discarded");
  assert.equal(result.verification.discardedFindings, 1);
  const stored = db.aiSession._rows[0].proposal as { report: { recommendations: unknown[] } };
  assert.equal(stored.report.recommendations.length, 0, "the discard is persisted, not just returned");
});

test("getLatestAdvisor returns null when none exists", async () => {
  const db = fakeDb();
  __setAdvisorDeps({
    db: db as unknown as never,
    provider: fakeProvider(advisoryToolData()),
    loadContext: async () => context("HASH_A", ["health.score"]),
    computeAnalysis: async () => ({ analysis: {} as AnalysisResult, analysisHash: "HASH_A" }),
  });
  assert.equal(await getLatestAdvisor("p1"), null);
  assert.equal(await getAdvisorById("p1", "nope"), null);
});
