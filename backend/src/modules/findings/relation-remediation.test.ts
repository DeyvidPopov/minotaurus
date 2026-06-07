import test from "node:test";
import assert from "node:assert/strict";
import {
  candidatesForDiagramUnlinked,
  candidatesForOrphan,
  candidatesForSecurityPolicy,
  confidenceFromScore,
  EVIDENCE_WEIGHTS,
  getRelationRemediationIdForCode,
  isManualFallback,
  type RArtifact,
  type RemediationCandidate,
  type RInferredEdge,
  type RRelation,
} from "./relation-remediation.js";

const art = (over: Partial<RArtifact>): RArtifact => ({ id: "a", title: "A", type: "SERVICE", status: "ACTIVE", ...over });

// ── code → remediation mapping ──

test("only the three review-required codes map to a remediation", () => {
  assert.equal(getRelationRemediationIdForCode("DIAGRAM_UNLINKED"), "LINK_DIAGRAM_ARTIFACT");
  assert.equal(getRelationRemediationIdForCode("SECURITY_POLICY_NOT_LINKED"), "LINK_SECURITY_POLICY");
  assert.equal(getRelationRemediationIdForCode("ORPHAN_ARTIFACT"), "LINK_ORPHAN_ARTIFACT");
  for (const code of ["DEPENDS_ON_DEPRECATED", "HIGH_FAN_OUT", "HIGH_CHURN", "MISSING_DOCUMENTATION", "NOPE"]) {
    assert.equal(getRelationRemediationIdForCode(code), null, `${code} must NOT have a relation remediation`);
  }
});

// ── DIAGRAM_UNLINKED ──

test("diagram candidate from a diagram-title token match (single match)", () => {
  const arts = [
    art({ id: "svc", title: "Appointment Service", type: "SERVICE" }),
    art({ id: "other", title: "Billing Service", type: "SERVICE" }),
  ];
  const out = candidatesForDiagramUnlinked({ title: "Appointment Booking Flow" }, [], arts);
  assert.equal(out.length, 1); // only the appointment one shares a token
  assert.equal(out[0].targetId, "svc");
  assert.equal(out[0].relationType, undefined); // FK link, not a relation
});

test("diagram candidate by Mermaid node label scores via MERMAID_NODE_MATCH", () => {
  const arts = [art({ id: "svc", title: "Patient Service", type: "SERVICE" })];
  const out = candidatesForDiagramUnlinked({ title: "Untitled" }, ["Patient Service", "DB"], arts);
  assert.equal(out[0].targetId, "svc");
  assert.ok(out[0].evidence.some((e) => e.type === "MERMAID_NODE_MATCH"));
  assert.equal(out[0].score, 30); // node match alone (no title overlap)
});

test("diagram candidates exclude DEPRECATED targets", () => {
  const arts = [art({ id: "svc", title: "Patient Service", status: "DEPRECATED" })];
  assert.deepEqual(candidatesForDiagramUnlinked({ title: "x" }, ["Patient Service"], arts), []);
});

// ── SECURITY_POLICY_NOT_LINKED ──

const policy = art({ id: "pol", title: "Authentication Policy", type: "SECURITY_POLICY" });

test("security policy suggests SECURES targets by title match", () => {
  const arts = [policy, art({ id: "auth", title: "Authentication Service", type: "SERVICE" })];
  const out = candidatesForSecurityPolicy(policy, arts, [], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].targetId, "auth");
  assert.equal(out[0].relationType, "SECURES");
});

test("security policy ranks an inferred SECURED_BY candidate above a pure title match", () => {
  const arts = [
    policy,
    art({ id: "auth", title: "Login Backend", type: "SERVICE" }), // API evidence only
    art({ id: "gw", title: "Authentication Gateway", type: "SERVICE" }), // title evidence only
  ];
  const edges: RInferredEdge[] = [{ source: "auth", target: "pol", kind: "SECURED_BY", confidence: "high", basis: "x" }];
  const out = candidatesForSecurityPolicy(policy, arts, [], edges);
  // auth: API(25)+TYPE(15)=40 ; gw: TOKEN(20)+TYPE(15)=35 → API-supported ranks first.
  assert.equal(out[0].targetId, "auth");
  assert.equal(out[0].relationType, "SECURES");
  assert.ok(out[0].evidence.some((e) => e.type === "API_INTELLIGENCE"));
  const gw = out.find((c) => c.targetId === "gw")!;
  assert.ok(gw.evidence.some((e) => e.type === "TOKEN_MATCH"));
  assert.ok(out[0].score > gw.score); // API beats pure title
});

test("security policy excludes an already-SECURES target, self, and deprecated", () => {
  const arts = [
    policy,
    art({ id: "auth", title: "Authentication Service", type: "SERVICE" }),
    art({ id: "dep", title: "Authentication Gateway", type: "SERVICE", status: "DEPRECATED" }),
  ];
  const rels: RRelation[] = [{ sourceArtifactId: "pol", targetArtifactId: "auth", relationType: "SECURES" }];
  // auth already secured → excluded; dep deprecated → excluded; self never appears.
  assert.deepEqual(candidatesForSecurityPolicy(policy, arts, rels, []), []);
});

test("security policy does not suggest non-securable target types (e.g. DOCUMENTATION)", () => {
  const arts = [policy, art({ id: "doc", title: "Authentication Notes", type: "DOCUMENTATION" })];
  assert.deepEqual(candidatesForSecurityPolicy(policy, arts, [], []), []);
});

// ── ORPHAN_ARTIFACT ──

test("orphan suggests USES → data model from an inferred TOUCHES edge", () => {
  const orphan = art({ id: "svc", title: "Notification Backend", type: "SERVICE" });
  const arts = [orphan, art({ id: "db", title: "Message Store", type: "DATABASE_MODEL" })];
  const edges: RInferredEdge[] = [{ source: "svc", target: "db", kind: "TOUCHES", confidence: "medium", basis: "x" }];
  const out = candidatesForOrphan(orphan, arts, [], edges);
  assert.equal(out[0].targetId, "db");
  assert.equal(out[0].relationType, "USES");
});

test("orphan title-match carries a type-compatible relation type and is downgraded", () => {
  const orphan = art({ id: "svc", title: "Notification Service", type: "SERVICE" });
  const arts = [orphan, art({ id: "email", title: "Notification Email", type: "SERVICE" })];
  const out = candidatesForOrphan(orphan, arts, [], []);
  const c = out.find((x) => x.targetId === "email");
  assert.ok(c);
  assert.equal(c!.relationType, "DEPENDS_ON"); // SERVICE→SERVICE default
  assert.notEqual(c!.confidence, "HIGH"); // title-only orphan match never HIGH
});

test("orphan does NOT suggest a DOCUMENTATION target (would be a backwards DOCUMENTS edge)", () => {
  // A DOCUMENTS edge is doc→documented-thing; the orphan is the source here, so a
  // doc target is skipped rather than writing a reversed edge.
  const orphan = art({ id: "svc", title: "Billing Service", type: "SERVICE" });
  const arts = [orphan, art({ id: "doc", title: "Billing Notes", type: "DOCUMENTATION" })];
  assert.deepEqual(candidatesForOrphan(orphan, arts, [], []), []);
});

test("orphan returns [] (manual fallback) when no deterministic evidence exists", () => {
  const orphan = art({ id: "x", title: "Zxqv Widget", type: "SERVICE" });
  const arts = [orphan, art({ id: "y", title: "Totally Different", type: "SERVICE" })];
  assert.deepEqual(candidatesForOrphan(orphan, arts, [], []), []);
});

test("orphan excludes self, deprecated, and existing same-type edges", () => {
  const orphan = art({ id: "svc", title: "Notification Service", type: "SERVICE" });
  const arts = [
    orphan,
    art({ id: "dep", title: "Notification Cache", type: "DATABASE_MODEL", status: "DEPRECATED" }),
    art({ id: "db", title: "Notification Store", type: "DATABASE_MODEL" }),
  ];
  const rels: RRelation[] = [{ sourceArtifactId: "svc", targetArtifactId: "db", relationType: "USES" }];
  // dep deprecated → out; db already USES → out; self never appears.
  assert.deepEqual(candidatesForOrphan(orphan, arts, rels, []), []);
});

// ── general invariants ──

test("candidates are deterministic and sorted by confidence then title", () => {
  const orphan = art({ id: "o", title: "Order Service", type: "SERVICE" });
  const arts = [
    orphan,
    art({ id: "z", title: "Order Audit", type: "DATABASE_MODEL" }),
    art({ id: "a", title: "Order Archive", type: "DATABASE_MODEL" }),
  ];
  const edges: RInferredEdge[] = [{ source: "o", target: "z", kind: "TOUCHES", confidence: "high", basis: "x" }];
  const first = candidatesForOrphan(orphan, arts, [], edges);
  // z is HIGH (inferred) → before the title-match LOW/MEDIUM ones; a before others by title.
  assert.equal(first[0].targetId, "z");
  assert.deepEqual(candidatesForOrphan(orphan, arts, [], edges), first); // deterministic
});

test("self-loops are never suggested", () => {
  const a = art({ id: "self", title: "Self Service", type: "SERVICE" });
  assert.ok(candidatesForOrphan(a, [a], [], []).every((c) => c.targetId !== "self"));
  assert.ok(candidatesForSecurityPolicy(a, [a], [], []).every((c) => c.targetId !== "self"));
});

// ── V2: confidence & evidence engine ──

test("isManualFallback: true unless a candidate reaches the MEDIUM (>=50) bar", () => {
  const c = (score: number): RemediationCandidate => ({ targetId: "t", targetTitle: "T", targetType: "SERVICE", confidence: confidenceFromScore(score), score, evidence: [] });
  assert.equal(isManualFallback([]), true); // no candidates
  assert.equal(isManualFallback([c(35), c(49)]), true); // all LOW
  assert.equal(isManualFallback([c(35), c(50)]), false); // one MEDIUM
  assert.equal(isManualFallback([c(80)]), false); // HIGH
});

test("confidence bands: 80+ HIGH, 50–79 MEDIUM, 0–49 LOW", () => {
  assert.equal(confidenceFromScore(100), "HIGH");
  assert.equal(confidenceFromScore(80), "HIGH");
  assert.equal(confidenceFromScore(79), "MEDIUM");
  assert.equal(confidenceFromScore(50), "MEDIUM");
  assert.equal(confidenceFromScore(49), "LOW");
  assert.equal(confidenceFromScore(0), "LOW");
});

test("worked example: Authentication Service scores 80 / HIGH (TITLE 40 + API 25 + TYPE 15)", () => {
  const pol = art({ id: "pol", title: "Authentication Policy", type: "SECURITY_POLICY" });
  const arts = [pol, art({ id: "auth", title: "Authentication Service", type: "SERVICE" })];
  const edges: RInferredEdge[] = [{ source: "auth", target: "pol", kind: "SECURED_BY", confidence: "high", basis: "x" }];
  const [c] = candidatesForSecurityPolicy(pol, arts, [], edges);
  assert.equal(c.targetId, "auth");
  assert.equal(c.score, 80);
  assert.equal(c.confidence, "HIGH");
  assert.deepEqual(c.evidence.map((e) => e.type).sort(), ["API_INTELLIGENCE", "ARTIFACT_TYPE_COMPATIBILITY", "TITLE_MATCH"]);
  for (const e of c.evidence) assert.ok(e.weight > 0 && e.explanation.trim().length > 0);
});

test("every emitted evidence weight equals its EVIDENCE_WEIGHTS entry; score = capped sum", () => {
  const pol = art({ id: "pol", title: "Authentication Policy", type: "SECURITY_POLICY" });
  const arts = [pol, art({ id: "auth", title: "Authentication Service", type: "SERVICE" })];
  const edges: RInferredEdge[] = [{ source: "auth", target: "pol", kind: "SECURED_BY", confidence: "high", basis: "x" }];
  for (const c of candidatesForSecurityPolicy(pol, arts, [], edges)) {
    for (const e of c.evidence) assert.equal(e.weight, EVIDENCE_WEIGHTS[e.type], `${e.type} weight`);
    assert.equal(c.score, Math.min(100, c.evidence.reduce((s, e) => s + e.weight, 0)));
    assert.ok(c.score >= 0 && c.score <= 100);
  }
});

test("every candidate carries confidence, score, and at least one evidence item", () => {
  const pol = art({ id: "pol", title: "Billing Policy", type: "SECURITY_POLICY" });
  const arts = [pol, art({ id: "svc", title: "Billing Service", type: "SERVICE" }), art({ id: "db", title: "Billing Database", type: "DATABASE_MODEL" })];
  const cands = candidatesForSecurityPolicy(pol, arts, [], []);
  assert.ok(cands.length >= 1);
  for (const c of cands) {
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(c.confidence));
    assert.equal(typeof c.score, "number");
    assert.ok(c.evidence.length >= 1);
  }
});

test("diagram: a Mermaid node match outranks a candidate that only matches the diagram title", () => {
  const arts = [
    art({ id: "node", title: "Patient Service", type: "SERVICE" }), // appears as a node
    art({ id: "titled", title: "Booking Service", type: "SERVICE" }), // only shares a diagram-title token
  ];
  const out = candidatesForDiagramUnlinked({ title: "Booking Flow" }, ["Patient Service"], arts);
  assert.equal(out[0].targetId, "node");
  assert.ok(out[0].evidence.some((e) => e.type === "MERMAID_NODE_MATCH"));
  const titled = out.find((c) => c.targetId === "titled")!;
  assert.ok(titled.evidence.some((e) => e.type === "TOKEN_MATCH"));
  assert.ok(out[0].score > titled.score); // 30 (node) > 20 (title token)
});

// ── V2: PHRASE_TITLE_MATCH refinement (diagram) ──

const DIAG_TITLE = "Billing Service Architecture";
const diagNodes = ["API Gateway", "Billing Service", "Billing Database", "HIPAA Policy"];
const diagArts = [
  art({ id: "gw", title: "API Gateway", type: "SERVICE" }),
  art({ id: "svc", title: "Billing Service", type: "SERVICE" }),
  art({ id: "db", title: "Billing Database", type: "DATABASE_MODEL" }),
  art({ id: "pol", title: "HIPAA Policy", type: "SECURITY_POLICY" }),
];

test("phrase match: a node candidate whose full title is contained in the diagram title gets PHRASE_TITLE_MATCH (+25)", () => {
  const out = candidatesForDiagramUnlinked({ title: DIAG_TITLE }, diagNodes, diagArts);
  const svc = out.find((c) => c.targetId === "svc")!;
  assert.ok(svc.evidence.some((e) => e.type === "PHRASE_TITLE_MATCH" && e.weight === 25));
  assert.equal(svc.score, 75); // MERMAID 30 + TOKEN 20 + PHRASE 25
  assert.equal(svc.confidence, "MEDIUM");
});

test("phrase match beats a token-only node match (Billing Service ranks above Billing Database)", () => {
  const out = candidatesForDiagramUnlinked({ title: DIAG_TITLE }, diagNodes, diagArts);
  const svc = out.find((c) => c.targetId === "svc")!;
  const db = out.find((c) => c.targetId === "db")!;
  assert.equal(db.score, 50); // node + token, no phrase ("Billing Database" not contained)
  assert.ok(svc.score > db.score);
  assert.ok(out.findIndex((c) => c.targetId === "svc") < out.findIndex((c) => c.targetId === "db"));
  // and both still rank above the node-only candidates (30)
  assert.equal(out.find((c) => c.targetId === "gw")!.score, 30);
  assert.equal(out.find((c) => c.targetId === "pol")!.score, 30);
});

test("a title-only phrase candidate does NOT outrank a Mermaid-node-backed candidate", () => {
  // "Billing Service" is contained in the title but is NOT drawn (only API Gateway is a node).
  const out = candidatesForDiagramUnlinked({ title: DIAG_TITLE }, ["API Gateway"], diagArts);
  const gw = out.find((c) => c.targetId === "gw")!; // node, no title overlap → 30
  const svc = out.find((c) => c.targetId === "svc")!; // title-only "billing" → TOKEN 20, NO phrase (node-gated)
  assert.ok(svc.evidence.every((e) => e.type !== "PHRASE_TITLE_MATCH"), "phrase is node-gated");
  assert.equal(svc.score, 20);
  assert.equal(gw.score, 30);
  assert.ok(out.findIndex((c) => c.targetId === "gw") < out.findIndex((c) => c.targetId === "svc"));
});

test("generic stopwords do not create a false phrase match", () => {
  // A node titled "Service" — "service" IS contained in the title but is all-stopword.
  const arts = [art({ id: "s", title: "Service", type: "SERVICE" })];
  const out = candidatesForDiagramUnlinked({ title: DIAG_TITLE }, ["Service"], arts);
  const s = out.find((c) => c.targetId === "s")!;
  assert.ok(s.evidence.every((e) => e.type !== "PHRASE_TITLE_MATCH"), "all-generic title must not phrase-match");
  // it is still a node, so MERMAID fires; "service" is a stopword so no token/phrase
  assert.deepEqual(s.evidence.map((e) => e.type), ["MERMAID_NODE_MATCH"]);
  assert.equal(s.score, 30);
});

test("orphan: a TOUCHES (API) candidate outranks a title-only candidate", () => {
  const orphan = art({ id: "o", title: "Order Service", type: "SERVICE" });
  const arts = [
    orphan,
    art({ id: "touched", title: "Ledger Store", type: "DATABASE_MODEL" }), // API touches, no title overlap
    art({ id: "titled", title: "Order Archive", type: "DATABASE_MODEL" }), // title overlap only
  ];
  const edges: RInferredEdge[] = [{ source: "o", target: "touched", kind: "TOUCHES", confidence: "high", basis: "x" }];
  const out = candidatesForOrphan(orphan, arts, [], edges);
  assert.equal(out[0].targetId, "touched");
  assert.ok(out[0].evidence.some((e) => e.type === "API_INTELLIGENCE"));
  assert.ok(out[0].score > out.find((c) => c.targetId === "titled")!.score);
});

test("EXISTING_NEIGHBORHOOD boosts an orphan candidate connected to a same-topic artifact", () => {
  const orphan = art({ id: "o", title: "Patient Portal", type: "SERVICE" });
  const arts = [orphan, art({ id: "svc", title: "Patient Service", type: "SERVICE" }), art({ id: "db", title: "Patient Database", type: "DATABASE_MODEL" })];
  const rels: RRelation[] = [{ sourceArtifactId: "svc", targetArtifactId: "db", relationType: "USES" }]; // svc↔db, both "patient"
  const out = candidatesForOrphan(orphan, arts, rels, []);
  const svc = out.find((c) => c.targetId === "svc")!;
  assert.ok(svc.evidence.some((e) => e.type === "EXISTING_NEIGHBORHOOD"));
});

test("ordering is strictly deterministic: score desc, then title asc", () => {
  const pol = art({ id: "pol", title: "Billing Policy", type: "SECURITY_POLICY" });
  // two equal-score (TOKEN+TYPE=35) title matches → tie broken by title asc
  const arts = [pol, art({ id: "z", title: "Billing Zebra", type: "SERVICE" }), art({ id: "a", title: "Billing Apex", type: "SERVICE" })];
  const out = candidatesForSecurityPolicy(pol, arts, [], []);
  assert.deepEqual(out.map((c) => c.targetTitle), ["Billing Apex", "Billing Zebra"]);
  assert.deepEqual(candidatesForSecurityPolicy(pol, arts, [], []), out); // same input → identical
});
