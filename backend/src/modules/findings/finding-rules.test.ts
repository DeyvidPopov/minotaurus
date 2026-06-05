import test from "node:test";
import assert from "node:assert/strict";
import { analyzeArchitectureFindings, type ProjectFindingModel } from "./finding-rules.js";

const A = (id: string, status = "ACTIVE", title = id) => ({ id, title, status });

function model(over: Partial<ProjectFindingModel> = {}): ProjectFindingModel {
  return { artifacts: [], relations: [], churnByArtifact: new Map(), ...over };
}

// ── individual rules ──

test("ORPHAN_ARTIFACT for an artifact with no relations", () => {
  const f = analyzeArchitectureFindings(model({ artifacts: [A("x", "ACTIVE", "Lonely")] }));
  assert.deepEqual(f.map((x) => x.code), ["ORPHAN_ARTIFACT"]);
  assert.equal(f[0].artifactId, "x");
  assert.equal(f[0].severity, "WARNING");
  assert.equal(f[0].message, 'Artifact "Lonely" is orphaned — no incoming or outgoing relations.');
});

test("DEPENDS_ON_DEPRECATED for an active→deprecated edge (ERROR)", () => {
  const f = analyzeArchitectureFindings(model({
    artifacts: [A("svc", "ACTIVE", "Order Service"), A("old", "DEPRECATED", "Legacy Payment Service")],
    relations: [{ sourceArtifactId: "svc", targetArtifactId: "old" }],
  }));
  const dep = f.find((x) => x.code === "DEPENDS_ON_DEPRECATED");
  assert.ok(dep, "DEPENDS_ON_DEPRECATED expected");
  assert.equal(dep!.severity, "ERROR");
  assert.equal(dep!.artifactId, "svc");
  assert.equal(dep!.message, 'Active artifact "Order Service" depends on deprecated artifact "Legacy Payment Service".');
});

test("HIGH_FAN_OUT fires at degree > 6, not at exactly 6", () => {
  const neighbors = Array.from({ length: 6 }, (_, i) => A(`n${i}`));
  const rel6 = neighbors.map((n) => ({ sourceArtifactId: "hub", targetArtifactId: n.id }));
  const at6 = analyzeArchitectureFindings(model({ artifacts: [A("hub"), ...neighbors], relations: rel6 }));
  assert.ok(!at6.some((x) => x.code === "HIGH_FAN_OUT"), "degree 6 must not fire");

  const rel7 = [...rel6, { sourceArtifactId: "hub", targetArtifactId: "n6" }];
  const at7 = analyzeArchitectureFindings(model({ artifacts: [A("hub"), ...neighbors, A("n6")], relations: rel7 }));
  const hit = at7.find((x) => x.code === "HIGH_FAN_OUT");
  assert.ok(hit && hit.artifactId === "hub" && hit.severity === "INFO", "degree 7 fires");
});

test("HIGH_CHURN fires at churn > 5, not at exactly 5", () => {
  const base = { artifacts: [A("a"), A("b")], relations: [{ sourceArtifactId: "a", targetArtifactId: "b" }] };
  const at5 = analyzeArchitectureFindings(model({ ...base, churnByArtifact: new Map([["a", 5]]) }));
  assert.ok(!at5.some((x) => x.code === "HIGH_CHURN"), "churn 5 must not fire");
  const at6 = analyzeArchitectureFindings(model({ ...base, churnByArtifact: new Map([["a", 6]]) }));
  const hit = at6.find((x) => x.code === "HIGH_CHURN");
  assert.ok(hit && hit.artifactId === "a" && hit.severity === "INFO", "churn 6 fires");
  assert.equal(hit!.message, 'Artifact "a" was changed 6 times in the last 7 days.');
});

test("DEPRECATED_STILL_REFERENCED fires at incoming > 2, not at exactly 2", () => {
  const arts = (n: number) => [A("old", "DEPRECATED"), ...Array.from({ length: n }, (_, i) => A(`s${i}`))];
  const refs = (n: number) => Array.from({ length: n }, (_, i) => ({ sourceArtifactId: `s${i}`, targetArtifactId: "old" }));
  const at2 = analyzeArchitectureFindings(model({ artifacts: arts(2), relations: refs(2) }));
  assert.ok(!at2.some((x) => x.code === "DEPRECATED_STILL_REFERENCED"), "2 incoming must not fire");
  const at3 = analyzeArchitectureFindings(model({ artifacts: arts(3), relations: refs(3) }));
  const hit = at3.find((x) => x.code === "DEPRECATED_STILL_REFERENCED");
  assert.ok(hit && hit.artifactId === "old" && hit.severity === "WARNING", "3 incoming fires");
});

test("output is deterministic — same model, deep-equal twice", () => {
  const m = model({
    artifacts: [A("svc", "ACTIVE", "Svc"), A("old", "DEPRECATED", "Old"), A("orphan")],
    relations: [{ sourceArtifactId: "svc", targetArtifactId: "old" }],
    churnByArtifact: new Map([["svc", 9]]),
  });
  assert.deepEqual(analyzeArchitectureFindings(m), analyzeArchitectureFindings(m));
});

// ── SSOT parity: the validation adapter and the analysis adapter produce the
//    SAME canonical findings from the same logical project. This is the guarantee
//    that there is one rule implementation, not two. ──

test("SSOT parity: validation-path and analysis-path yield identical findings", () => {
  // Prisma-shaped source (validation path).
  const prismaArtifacts = [
    { id: "svc", title: "Order Service", type: "SERVICE", status: "ACTIVE" },
    { id: "old", title: "Legacy", type: "SERVICE", status: "DEPRECATED" },
    { id: "orphan", title: "Lonely", type: "SERVICE", status: "ACTIVE" },
  ];
  const prismaRelations = [{ sourceArtifactId: "svc", targetArtifactId: "old", relationType: "DEPENDS_ON" }];
  const recentEvents = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, entityId: "svc" })); // churn 6

  const churnV = new Map<string, number>();
  for (const e of recentEvents) churnV.set(e.entityId, (churnV.get(e.entityId) ?? 0) + 1);
  const validationModel: ProjectFindingModel = {
    artifacts: prismaArtifacts.map((a) => ({ id: a.id, title: a.title, status: a.status })),
    relations: prismaRelations.map((r) => ({ sourceArtifactId: r.sourceArtifactId, targetArtifactId: r.targetArtifactId })),
    churnByArtifact: churnV,
  };

  // Snapshot-shaped source (analysis path) — different shape, same facts.
  const snapArtifacts = prismaArtifacts.map((a) => ({ id: a.id, title: a.title, type: a.type, status: a.status }));
  const snapRelations = prismaRelations.map((r) => ({
    sourceArtifactId: r.sourceArtifactId,
    targetArtifactId: r.targetArtifactId,
    relationType: r.relationType,
  }));
  const versionHistory = recentEvents.map((e, i) => ({ id: `v${i}`, entityId: e.entityId, action: "UPDATED", createdAt: "2026-01-01T00:00:00.000Z" }));
  const churnA = new Map<string, number>();
  for (const e of versionHistory) churnA.set(e.entityId, (churnA.get(e.entityId) ?? 0) + 1);
  const analysisModel: ProjectFindingModel = {
    artifacts: snapArtifacts.map((a) => ({ id: a.id, title: a.title, status: a.status })),
    relations: snapRelations.map((r) => ({ sourceArtifactId: r.sourceArtifactId, targetArtifactId: r.targetArtifactId })),
    churnByArtifact: churnA,
  };

  const vf = analyzeArchitectureFindings(validationModel);
  const af = analyzeArchitectureFindings(analysisModel);
  assert.deepEqual(vf, af, "both paths must produce identical findings");

  const codes = [...new Set(vf.map((x) => x.code))].sort();
  assert.deepEqual(codes, ["DEPENDS_ON_DEPRECATED", "HIGH_CHURN", "ORPHAN_ARTIFACT"]);
});
