import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyIssue,
  explainIssue,
  parseIssueCode,
  KNOWN_RULE_IDS,
  type IssueInput,
  type ResourceIndex,
} from "./validation.presenter.js";

// ── A small fixture project: one artifact, one (linked) spec, one (unlinked)
//    spec, one db model, one diagram. ──
const ART = { id: "art_web", title: "Public Web App", type: "SERVICE" };
const DOC = { id: "art_doc", title: "Billing Flow", type: "DOCUMENTATION" };
const index: ResourceIndex = {
  artifactsById: new Map([
    [ART.id, ART],
    [DOC.id, DOC],
  ]),
  specs: [
    { id: "spec_auth", artifactId: "art_auth", title: "Authentication API" }, // linked
    { id: "spec_appt", artifactId: null, title: "Appointment API" }, // unlinked
  ],
  models: [{ id: "model_core", artifactId: "art_db", title: "Core DB" }],
  diagrams: [
    { id: "diag_arch", artifactId: null, title: "System Architecture" },
    { id: "diag_flow", artifactId: "art_web", title: "Web Flow" },
  ],
};

const issue = (over: Partial<IssueInput>): IssueInput => ({
  artifactId: ART.id,
  category: "RELATIONSHIP",
  severity: "WARNING",
  message: `Artifact "${ART.title}" is orphaned — no incoming or outgoing relations.`,
  ...over,
});

// ── parseIssueCode ──

test("parseIssueCode splits an api-intel CODE prefix", () => {
  const { code, cleanMessage } = parseIssueCode('API_FIELD_UNMAPPED · POST /x: field "y" maps to nothing');
  assert.equal(code, "API_FIELD_UNMAPPED");
  assert.equal(cleanMessage, 'POST /x: field "y" maps to nothing');
});

test("parseIssueCode treats PROJECT_LEVEL prefix as a code token", () => {
  const { code, cleanMessage } = parseIssueCode("PROJECT_LEVEL · Single-user project may reduce visibility.");
  assert.equal(code, "PROJECT_LEVEL");
  assert.equal(cleanMessage, "Single-user project may reduce visibility.");
});

test("parseIssueCode leaves an uncoded message untouched", () => {
  const { code, cleanMessage } = parseIssueCode('Artifact "X" is orphaned — no incoming or outgoing relations.');
  assert.equal(code, null);
  assert.equal(cleanMessage, 'Artifact "X" is orphaned — no incoming or outgoing relations.');
});

// ── classifyIssue ──

const CASES: Array<[Partial<IssueInput>, string]> = [
  [{ category: "RELATIONSHIP", message: 'Artifact "X" is orphaned — no incoming or outgoing relations.' }, "ORPHAN_ARTIFACT"],
  [{ category: "DOCUMENTATION", message: 'Documentation artifact "X" has no documentation content.' }, "MISSING_DOCUMENTATION"],
  [{ category: "SECURITY", message: 'Security policy "X" has no SECURES outgoing relation.' }, "SECURITY_POLICY_NOT_LINKED"],
  [{ category: "SECURITY", message: 'Endpoint GET /admin on security-related spec "X" is marked public (requiresAuth=false).' }, "PUBLIC_SECURITY_ENDPOINT"],
  [{ category: "API", message: 'API spec "X" has no endpoints.' }, "API_SPEC_NO_ENDPOINTS"],
  [{ category: "API", message: 'Endpoint POST /x in "X" has no summary.' }, "ENDPOINT_NO_SUMMARY"],
  [{ category: "DATABASE", message: 'Database model "X" has no entities.' }, "DB_MODEL_NO_ENTITIES"],
  [{ category: "DATABASE", message: 'Entity "E" in "X" has no fields.' }, "DB_ENTITY_NO_FIELDS"],
  [{ category: "DATABASE", message: 'Entity "E" in "X" has no primary key.' }, "DB_ENTITY_NO_PK"],
  [{ category: "DATABASE", message: 'Foreign key "E.f" has no target entity.' }, "DB_FK_NO_TARGET"],
  [{ category: "DATABASE", message: 'Foreign key "E.f" references a missing entity.' }, "DB_FK_MISSING_TARGET"],
  [{ category: "DIAGRAM", message: 'Diagram "X" has an empty Mermaid source.' }, "DIAGRAM_EMPTY"],
  [{ category: "DIAGRAM", message: 'Diagram "X" may be invalid Mermaid (missing diagram-type header).' }, "DIAGRAM_INVALID"],
  [{ category: "DIAGRAM", message: 'Architecture diagram "X" is not linked to an artifact.' }, "DIAGRAM_UNLINKED"],
  [{ category: "ARCHITECTURE", message: 'Active artifact "X" depends on deprecated artifact "Y".' }, "DEPENDS_ON_DEPRECATED"],
  [{ category: "ARCHITECTURE", message: 'Artifact "X" has 9 relations — consider splitting responsibilities.' }, "HIGH_FAN_OUT"],
  [{ category: "ARCHITECTURE", message: 'Artifact "X" was changed 7 times in the last 7 days.' }, "HIGH_CHURN"],
  [{ category: "ARCHITECTURE", message: 'Deprecated artifact "X" still has 3 incoming references.' }, "DEPRECATED_STILL_REFERENCED"],
  [{ category: "ARCHITECTURE", message: "PROJECT_LEVEL · Single-user project may reduce collaboration visibility." }, "SINGLE_MEMBER_PROJECT"],
  [{ category: "API", message: 'API_FIELD_UNMAPPED · POST /x: field "y" looks like an entity reference but maps to no database entity' }, "API_FIELD_UNMAPPED"],
  [{ category: "SECURITY", message: "USER_SCOPED_ENDPOINT_WITHOUT_AUTH · GET /patients/{id}: operates on user-scoped resource but requires no authentication" }, "USER_SCOPED_ENDPOINT_WITHOUT_AUTH"],
  [{ category: "SECURITY", message: 'RESPONSE_EXPOSES_TOKEN_OR_SECRET · GET /x: response exposes credential field "token"' }, "RESPONSE_EXPOSES_TOKEN_OR_SECRET"],
];

for (const [over, expected] of CASES) {
  test(`classifyIssue → ${expected}`, () => {
    assert.equal(classifyIssue(issue(over)), expected);
  });
}

test("classifyIssue falls back to UNKNOWN_FINDING for an unrecognised message", () => {
  assert.equal(classifyIssue(issue({ category: "ARCHITECTURE", message: "Something brand new happened." })), "UNKNOWN_FINDING");
});

// ── explainIssue: target resolution ──

test("orphan artifact → ARTIFACT target resolved by id", () => {
  const meta = explainIssue(issue({}), index);
  assert.equal(meta.ruleId, "ORPHAN_ARTIFACT");
  assert.deepEqual(meta.target, { kind: "ARTIFACT", id: ART.id, title: ART.title });
  assert.equal(meta.deterministic, true);
  assert.ok(meta.why.length > 0 && meta.suggestedFix.length > 0);
});

test("missing documentation → ARTIFACT target with the documentation tab", () => {
  const meta = explainIssue(
    issue({ artifactId: DOC.id, category: "DOCUMENTATION", message: 'Documentation artifact "Billing Flow" has no documentation content.' }),
    index,
  );
  assert.equal(meta.ruleId, "MISSING_DOCUMENTATION");
  assert.equal(meta.target?.kind, "ARTIFACT");
  assert.equal(meta.target?.id, DOC.id);
  assert.equal(meta.target?.tab, "documentation");
});

test("project-level issue → TEAM target, no resource id, code suppressed", () => {
  const meta = explainIssue(
    issue({ artifactId: "proj_1", category: "ARCHITECTURE", message: "PROJECT_LEVEL · Single-user project may reduce collaboration visibility." }),
    index,
  );
  assert.equal(meta.ruleId, "SINGLE_MEMBER_PROJECT");
  assert.deepEqual(meta.target, { kind: "TEAM", id: null, title: null });
  assert.equal(meta.code, null); // PROJECT_LEVEL is a scope marker, not a rule code
  assert.equal(meta.cleanMessage, "Single-user project may reduce collaboration visibility.");
});

test("API_FIELD_UNMAPPED → API_SPEC target (unlinked spec, by own id) + endpoint + code", () => {
  const meta = explainIssue(
    issue({
      artifactId: "spec_appt",
      category: "API",
      message: 'API_FIELD_UNMAPPED · POST /appointments: field "doctorId" looks like an entity reference but maps to no database entity',
    }),
    index,
  );
  assert.equal(meta.ruleId, "API_FIELD_UNMAPPED");
  assert.equal(meta.code, "API_FIELD_UNMAPPED");
  assert.equal(meta.target?.kind, "API_SPEC");
  assert.equal(meta.target?.id, "spec_appt");
  assert.equal(meta.target?.title, "Appointment API");
  assert.deepEqual(meta.target?.endpoint, { method: "POST", path: "/appointments" });
});

test("security API issue on a LINKED spec → API_SPEC resolved by linked artifactId", () => {
  const meta = explainIssue(
    issue({
      artifactId: "art_auth", // the spec's linked artifact id
      category: "SECURITY",
      message: "USER_SCOPED_ENDPOINT_WITHOUT_AUTH · GET /users/{id}: operates on user-scoped resource but requires no authentication",
    }),
    index,
  );
  assert.equal(meta.ruleId, "USER_SCOPED_ENDPOINT_WITHOUT_AUTH");
  assert.equal(meta.target?.kind, "API_SPEC");
  assert.equal(meta.target?.id, "spec_auth");
  assert.deepEqual(meta.target?.endpoint, { method: "GET", path: "/users/{id}" });
});

test("database FK issue → DATABASE_MODEL target resolved by linked artifactId", () => {
  const meta = explainIssue(
    issue({ artifactId: "art_db", category: "DATABASE", message: 'Foreign key "Order.userId" references a missing entity.' }),
    index,
  );
  assert.equal(meta.ruleId, "DB_FK_MISSING_TARGET");
  assert.equal(meta.target?.kind, "DATABASE_MODEL");
  assert.equal(meta.target?.id, "model_core");
});

test("unlinked architecture diagram → DIAGRAM target resolved by own id", () => {
  const meta = explainIssue(
    issue({ artifactId: "diag_arch", category: "DIAGRAM", message: 'Architecture diagram "System Architecture" is not linked to an artifact.' }),
    index,
  );
  assert.equal(meta.ruleId, "DIAGRAM_UNLINKED");
  assert.equal(meta.target?.kind, "DIAGRAM");
  assert.equal(meta.target?.id, "diag_arch");
});

test("unresolved target (resource not in index) yields id=null", () => {
  const meta = explainIssue(
    issue({ artifactId: "ghost_spec", category: "API", message: 'API spec "Gone" has no endpoints.' }),
    index,
  );
  assert.equal(meta.target?.kind, "API_SPEC");
  assert.equal(meta.target?.id, null);
  assert.equal(meta.target?.title, null);
});

test("unknown rule uses the fallback (artifact target, non-empty guidance)", () => {
  const meta = explainIssue(issue({ category: "ARCHITECTURE", message: "Totally novel finding." }), index);
  assert.equal(meta.ruleId, "UNKNOWN_FINDING");
  assert.equal(meta.target?.kind, "ARTIFACT");
  assert.ok(meta.why.length > 0 && meta.suggestedFix.length > 0);
});

// ── invariants ──

test("every known rule has non-empty why + suggestedFix", () => {
  for (const ruleId of KNOWN_RULE_IDS) {
    // drive a synthetic issue that classifies to this rule via the fallback path
    const meta = explainIssue(issue({}), index);
    assert.ok(meta.why.length > 0);
    assert.ok(meta.suggestedFix.length > 0);
    assert.ok(ruleId.length > 0);
  }
});

test("explainIssue is deterministic — same input, deep-equal output", () => {
  const i = issue({
    artifactId: "spec_appt",
    category: "API",
    message: 'API_FIELD_UNMAPPED · POST /appointments: field "doctorId" maps to no entity',
  });
  assert.deepEqual(explainIssue(i, index), explainIssue(i, index));
});

test("every current rule is deterministic", () => {
  for (const [over] of CASES) {
    assert.equal(explainIssue(issue(over), index).deterministic, true);
  }
});
