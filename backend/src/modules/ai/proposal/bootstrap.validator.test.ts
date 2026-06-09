// bootstrap.validator.test.ts — pure-logic tests for the AI bootstrap validator.
// Run with: npm run test:unit  (node:test + node:assert, no Jest/Vitest).

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBootstrapProposal, type ValidationContext } from "./bootstrap.validator.js";
import type { BootstrapProposal, ProposedApiSpec, ProposedDatabaseModel } from "../ai.types.js";

const FLOW = "flowchart TD\n  A[Auth Service] --> B[Player Management]";

function emptyCtx(): ValidationContext {
  return { existingArtifacts: [], existingRelations: [] };
}

function proposal(over: Partial<BootstrapProposal> = {}): BootstrapProposal {
  return {
    summary: "x",
    artifacts: [
      { title: "Auth Service", type: "SERVICE", rationale: "", confidence: 0.9 },
      { title: "Player Management", type: "SERVICE", rationale: "", confidence: 0.8 },
    ],
    relations: [
      { sourceTitle: "Player Management", targetTitle: "Auth Service", relationType: "USES", rationale: "", confidence: 0.7 },
    ],
    diagrams: [{ title: "Overview", mermaidSource: FLOW, confidence: 0.6 }],
    databaseModels: [],
    apiSpecs: [],
    ...over,
  };
}

// A DB-only proposal: no artifacts/relations/diagrams, just one database model. Lets
// the database tests stand alone without dragging in the default artifacts/diagram.
function dbModel(over: Partial<ProposedDatabaseModel> = {}): ProposedDatabaseModel {
  return {
    title: "Player Database",
    databaseType: "PostgreSQL",
    entities: [
      {
        name: "Player",
        confidence: 0.9,
        fields: [
          { name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 },
          { name: "name", type: "text", required: true, isPrimaryKey: false, isForeignKey: false, confidence: 0.8 },
        ],
      },
    ],
    confidence: 0.85,
    ...over,
  };
}

function dbOnly(models: ProposedDatabaseModel[]): BootstrapProposal {
  return { summary: "x", artifacts: [], relations: [], diagrams: [], databaseModels: models, apiSpecs: [] };
}

// An API-only proposal: no artifacts/relations/diagrams/models, just API specs.
function apiSpec(over: Partial<ProposedApiSpec> = {}): ProposedApiSpec {
  return {
    title: "Booking API",
    version: "1.0.0",
    endpoints: [
      { method: "GET", path: "/bookings", summary: "List bookings", requiresAuth: true, confidence: 0.9 },
      { method: "POST", path: "/bookings", summary: "Create a booking", requiresAuth: true, confidence: 0.8 },
    ],
    confidence: 0.85,
    ...over,
  };
}

function apiOnly(specs: ProposedApiSpec[]): BootstrapProposal {
  return { summary: "x", artifacts: [], relations: [], diagrams: [], databaseModels: [], apiSpecs: specs };
}

test("valid proposal: everything accepted, ok true", () => {
  const r = validateBootstrapProposal(proposal(), emptyCtx());
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.artifacts.map((a) => a.accepted), [true, true]);
  assert.equal(r.relations[0].accepted, true);
  assert.equal(r.diagrams[0].accepted, true);
});

test("duplicate title within proposal: second artifact rejected", () => {
  const r = validateBootstrapProposal(
    proposal({
      artifacts: [
        { title: "Auth Service", type: "SERVICE", rationale: "", confidence: 1 },
        { title: " auth   service ", type: "SERVICE", rationale: "", confidence: 1 }, // normalizes equal
      ],
      relations: [],
    }),
    emptyCtx(),
  );
  assert.equal(r.artifacts[0].accepted, true);
  assert.equal(r.artifacts[1].accepted, false);
  assert.match(r.artifacts[1].reason ?? "", /duplicate/i);
  assert.equal(r.ok, true); // first one is still creatable
});

test("artifact whose title already exists is skipped (not a hard failure)", () => {
  const ctx: ValidationContext = {
    existingArtifacts: [{ id: "a1", normalizedTitle: "auth service" }],
    existingRelations: [],
  };
  const r = validateBootstrapProposal(proposal(), ctx);
  assert.equal(r.artifacts[0].accepted, false); // Auth Service exists
  assert.match(r.artifacts[0].reason ?? "", /already exists/i);
  assert.equal(r.artifacts[1].accepted, true);
  // relation Player Management USES Auth Service still resolves (Auth exists)
  assert.equal(r.relations[0].accepted, true);
});

test("unknown artifact type is rejected", () => {
  const r = validateBootstrapProposal(
    proposal({
      artifacts: [{ title: "Weird", type: "NOT_A_TYPE" as never, rationale: "", confidence: 1 }],
      relations: [],
      diagrams: [],
    }),
    emptyCtx(),
  );
  assert.equal(r.artifacts[0].accepted, false);
  assert.match(r.artifacts[0].reason ?? "", /unknown artifact type/i);
  assert.equal(r.ok, false); // nothing left to apply
});

test("self-relation and unresolved endpoint are skipped", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [
        { sourceTitle: "Auth Service", targetTitle: "Auth Service", relationType: "USES", rationale: "", confidence: 1 },
        { sourceTitle: "Auth Service", targetTitle: "Ghost", relationType: "USES", rationale: "", confidence: 1 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.relations[0].accepted, false);
  assert.match(r.relations[0].reason ?? "", /self-relation/i);
  assert.equal(r.relations[1].accepted, false);
  assert.match(r.relations[1].reason ?? "", /not in selection/i);
});

test("duplicate relation within proposal is skipped once", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [
        { sourceTitle: "Player Management", targetTitle: "Auth Service", relationType: "USES", rationale: "", confidence: 1 },
        { sourceTitle: "player management", targetTitle: "auth service", relationType: "USES", rationale: "", confidence: 1 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.relations[0].accepted, true);
  assert.equal(r.relations[1].accepted, false);
  assert.match(r.relations[1].reason ?? "", /duplicate relation/i);
});

test("relation already present in the project is skipped", () => {
  const ctx: ValidationContext = {
    existingArtifacts: [
      { id: "a1", normalizedTitle: "auth service" },
      { id: "a2", normalizedTitle: "player management" },
    ],
    existingRelations: [{ sourceArtifactId: "a2", targetArtifactId: "a1", relationType: "USES" }],
  };
  // Both artifacts already exist → both skipped; relation duplicates an existing one.
  const r = validateBootstrapProposal(proposal(), ctx);
  assert.equal(r.relations[0].accepted, false);
  assert.match(r.relations[0].reason ?? "", /already exists/i);
});

test("invalid Mermaid diagram is skipped with a reason", () => {
  const r = validateBootstrapProposal(
    proposal({ diagrams: [{ title: "Bad", mermaidSource: "this is not mermaid", confidence: 1 }] }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, false);
  assert.ok((r.diagrams[0].reason ?? "").length > 0);
  assert.equal(r.ok, true); // artifacts + relation still apply
});

// ── Diagram ↔ artifact referential integrity ──

test("diagram referencing only selected artifacts is accepted, with nodes listed", () => {
  // Default diagram references "Auth Service" + "Player Management" — both selected.
  const r = validateBootstrapProposal(proposal(), emptyCtx());
  assert.equal(r.diagrams[0].accepted, true);
  assert.deepEqual(r.diagrams[0].nodes, ["Auth Service", "Player Management"]);
  assert.equal(r.diagrams[0].unresolvedNodes, undefined);
});

test("diagram referencing a deselected artifact is rejected (not silently skipped)", () => {
  // "Player Management" is deselected ⇒ absent from the proposal artifacts, but the
  // diagram still draws it. The diagram must be rejected, the rest still applies.
  const r = validateBootstrapProposal(
    proposal({
      artifacts: [{ title: "Auth Service", type: "SERVICE", rationale: "", confidence: 0.9 }],
      relations: [],
    }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, false);
  assert.deepEqual(r.diagrams[0].unresolvedNodes, ["Player Management"]);
  assert.match(r.diagrams[0].reason ?? "", /not in the selection/i);
  assert.match(r.diagrams[0].reason ?? "", /Player Management/);
  assert.equal(r.ok, true); // the Auth Service artifact is still creatable
});

test("diagram referencing an EXTERNAL_SYSTEM artifact resolves (Model A)", () => {
  const r = validateBootstrapProposal(
    proposal({
      artifacts: [
        { title: "Payments", type: "SERVICE", rationale: "", confidence: 0.9 },
        { title: "Stripe", type: "EXTERNAL_SYSTEM", rationale: "", confidence: 0.8 },
      ],
      relations: [],
      diagrams: [
        { title: "Payments flow", mermaidSource: 'flowchart LR\n  P["Payments"] --> S["Stripe"]', confidence: 0.7 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, true);
  assert.deepEqual(r.diagrams[0].nodes, ["Payments", "Stripe"]);
});

test("diagram resolves against an already-existing project artifact", () => {
  // "Player Management" lives in the project (not in this proposal); the diagram
  // referencing it must still resolve via the existing-artifact set.
  const ctx: ValidationContext = {
    existingArtifacts: [{ id: "a2", normalizedTitle: "player management" }],
    existingRelations: [],
  };
  const r = validateBootstrapProposal(
    proposal({ relations: [] }), // artifacts: Auth Service (new) + Player Management (exists → skipped, but resolvable)
    ctx,
  );
  assert.equal(r.diagrams[0].accepted, true);
});

test("multi-diagram: valid one accepted, invalid one rejected, no cross-contamination", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [],
      diagrams: [
        { title: "Good", mermaidSource: 'flowchart TD\n  A["Auth Service"] --> B["Player Management"]', confidence: 0.8 },
        { title: "Bad", mermaidSource: 'flowchart TD\n  A["Auth Service"] --> G["Analytics Service"]', confidence: 0.8 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, true);
  assert.equal(r.diagrams[1].accepted, false);
  assert.deepEqual(r.diagrams[1].unresolvedNodes, ["Analytics Service"]);
});

test("exact-title enforcement: an abbreviated node label does not resolve", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [],
      diagrams: [
        { title: "Overview", mermaidSource: 'flowchart TD\n  A["Auth Service"] --> B["Player Mgmt"]', confidence: 0.8 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, false);
  assert.deepEqual(r.diagrams[0].unresolvedNodes, ["Player Mgmt"]);
});

test("diagram check is case/whitespace-insensitive (matches title normalization)", () => {
  const r = validateBootstrapProposal(
    proposal({
      relations: [],
      diagrams: [
        { title: "Overview", mermaidSource: 'flowchart TD\n  A["auth   service"] --> B["PLAYER MANAGEMENT"]', confidence: 0.8 },
      ],
    }),
    emptyCtx(),
  );
  assert.equal(r.diagrams[0].accepted, true);
});

test("nothing acceptable ⇒ ok false with a batch error", () => {
  const r = validateBootstrapProposal(
    { summary: "", artifacts: [], relations: [], diagrams: [], databaseModels: [], apiSpecs: [] },
    emptyCtx(),
  );
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
});

// ────────────────────────── Database models (Bootstrap V2, Phase 1) ──────────────────────────

test("valid database model: model + entity + fields all accepted, ok true", () => {
  const r = validateBootstrapProposal(dbOnly([dbModel()]), emptyCtx());
  assert.equal(r.ok, true);
  assert.equal(r.databaseModels.length, 1);
  assert.equal(r.databaseModels[0].accepted, true);
  assert.equal(r.databaseModels[0].entities[0].accepted, true);
  assert.deepEqual(r.databaseModels[0].entities[0].fields.map((f) => f.accepted), [true, true]);
});

test("database-only proposal still applies (ok true even with no artifacts)", () => {
  const r = validateBootstrapProposal(dbOnly([dbModel()]), emptyCtx());
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test("FK referencesEntityName resolves to a sibling entity → field accepted + resolvedReference", () => {
  const model = dbModel({
    entities: [
      {
        name: "Team",
        confidence: 0.9,
        fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }],
      },
      {
        name: "Player",
        confidence: 0.9,
        fields: [
          { name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 },
          { name: "team_id", type: "uuid", required: true, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "Team", confidence: 0.8 },
        ],
      },
    ],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  const playerFields = r.databaseModels[0].entities[1].fields;
  assert.equal(playerFields[1].accepted, true);
  assert.equal(playerFields[1].resolvedReference, true);
});

// ── precise FK column (referencesFieldName) — optional, advisory ──

function teamPlayerModel(refFieldName?: string | null): ProposedDatabaseModel {
  return dbModel({
    entities: [
      { name: "Team", confidence: 0.9, fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }] },
      {
        name: "Player",
        confidence: 0.9,
        fields: [
          { name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 },
          { name: "team_id", type: "uuid", required: true, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "Team", referencesFieldName: refFieldName ?? null, confidence: 0.8 },
        ],
      },
    ],
  });
}

test("referencesFieldName that matches a column of the referenced entity → resolvedFieldReference true", () => {
  const r = validateBootstrapProposal(dbOnly([teamPlayerModel("id")]), emptyCtx());
  const fk = r.databaseModels[0].entities[1].fields[1];
  assert.equal(fk.accepted, true);
  assert.equal(fk.resolvedReference, true);
  assert.equal(fk.resolvedFieldReference, true);
});

test("referencesFieldName that does NOT match a column → field still accepted, resolvedFieldReference false", () => {
  const r = validateBootstrapProposal(dbOnly([teamPlayerModel("nonexistent")]), emptyCtx());
  const fk = r.databaseModels[0].entities[1].fields[1];
  assert.equal(fk.accepted, true); // never rejected for an unmatched precise column
  assert.equal(fk.resolvedReference, true);
  assert.equal(fk.resolvedFieldReference, false);
});

test("no referencesFieldName → resolvedFieldReference is absent (PK fallback happens at apply)", () => {
  const r = validateBootstrapProposal(dbOnly([teamPlayerModel(null)]), emptyCtx());
  const fk = r.databaseModels[0].entities[1].fields[1];
  assert.equal(fk.accepted, true);
  assert.equal(fk.resolvedReference, true);
  assert.equal(fk.resolvedFieldReference, undefined);
});

test("referencesFieldName match is case-insensitive", () => {
  const r = validateBootstrapProposal(dbOnly([teamPlayerModel("ID")]), emptyCtx());
  assert.equal(r.databaseModels[0].entities[1].fields[1].resolvedFieldReference, true);
});

test("FK to a forward-declared sibling resolves (order-independent within the model)", () => {
  // Player references Team, but Team is declared AFTER Player. Pass 1 fixes the
  // entity set before pass 2 resolves FKs, so declaration order doesn't matter.
  const model = dbModel({
    entities: [
      {
        name: "Player",
        confidence: 0.9,
        fields: [
          { name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 },
          { name: "team_id", type: "uuid", required: true, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "Team", confidence: 0.8 },
        ],
      },
      {
        name: "Team",
        confidence: 0.9,
        fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }],
      },
    ],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  assert.equal(r.databaseModels[0].entities[0].fields[1].accepted, true);
  assert.equal(r.databaseModels[0].entities[0].fields[1].resolvedReference, true);
});

test("FK to a nonexistent entity → that field is rejected with a reason", () => {
  const model = dbModel({
    entities: [
      {
        name: "Player",
        confidence: 0.9,
        fields: [
          { name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 },
          { name: "ghost_id", type: "uuid", required: false, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "Ghost", confidence: 0.6 },
        ],
      },
    ],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  const fields = r.databaseModels[0].entities[0].fields;
  assert.equal(fields[0].accepted, true);
  assert.equal(fields[1].accepted, false);
  assert.match(fields[1].reason ?? "", /unknown entity/i);
  // The model + its valid field still apply.
  assert.equal(r.databaseModels[0].accepted, true);
  assert.equal(r.ok, true);
});

test("FK self-reference resolves (an entity may reference itself)", () => {
  const model = dbModel({
    entities: [
      {
        name: "Category",
        confidence: 0.9,
        fields: [
          { name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 },
          { name: "parent_id", type: "uuid", required: false, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "Category", confidence: 0.7 },
        ],
      },
    ],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  assert.equal(r.databaseModels[0].entities[0].fields[1].accepted, true);
  assert.equal(r.databaseModels[0].entities[0].fields[1].resolvedReference, true);
});

test("FK match is case/whitespace-insensitive (matches title normalization)", () => {
  const model = dbModel({
    entities: [
      {
        name: "Team",
        confidence: 0.9,
        fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }],
      },
      {
        name: "Player",
        confidence: 0.9,
        fields: [
          { name: "team_id", type: "uuid", required: true, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "  team  ", confidence: 0.8 },
        ],
      },
    ],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  assert.equal(r.databaseModels[0].entities[1].fields[0].accepted, true);
  assert.equal(r.databaseModels[0].entities[1].fields[0].resolvedReference, true);
});

test("duplicate entity name within a model → second entity rejected", () => {
  const model = dbModel({
    entities: [
      {
        name: "Player",
        confidence: 0.9,
        fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }],
      },
      {
        name: " player ",
        confidence: 0.9,
        fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }],
      },
    ],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  assert.equal(r.databaseModels[0].entities[0].accepted, true);
  assert.equal(r.databaseModels[0].entities[1].accepted, false);
  assert.match(r.databaseModels[0].entities[1].reason ?? "", /duplicate entity/i);
});

test("entity with no fields → rejected", () => {
  const model = dbModel({
    entities: [{ name: "Empty", confidence: 0.9, fields: [] }],
  });
  const r = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  assert.equal(r.databaseModels[0].entities[0].accepted, false);
  assert.match(r.databaseModels[0].entities[0].reason ?? "", /no fields/i);
  // No valid entity ⇒ the whole model is rejected.
  assert.equal(r.databaseModels[0].accepted, false);
  assert.match(r.databaseModels[0].reason ?? "", /no valid entities/i);
});

test("model with an empty title → rejected", () => {
  const r = validateBootstrapProposal(dbOnly([dbModel({ title: "   " })]), emptyCtx());
  assert.equal(r.databaseModels[0].accepted, false);
  assert.match(r.databaseModels[0].reason ?? "", /empty model title/i);
});

test("artifactTitle resolves to a proposed artifact → model linked", () => {
  const r = validateBootstrapProposal(
    proposal({ databaseModels: [dbModel({ artifactTitle: "Player Management" })] }),
    emptyCtx(),
  );
  assert.equal(r.databaseModels[0].accepted, true);
  assert.equal(r.databaseModels[0].artifactLinked, true);
});

test("artifactTitle that doesn't resolve → model still accepted, link dropped", () => {
  const r = validateBootstrapProposal(
    proposal({ databaseModels: [dbModel({ artifactTitle: "Nonexistent Service" })] }),
    emptyCtx(),
  );
  assert.equal(r.databaseModels[0].accepted, true);
  assert.equal(r.databaseModels[0].artifactLinked, false);
});

test("artifactTitle resolves against an already-existing project artifact", () => {
  const ctx: ValidationContext = {
    existingArtifacts: [{ id: "a9", normalizedTitle: "billing service" }],
    existingRelations: [],
  };
  const r = validateBootstrapProposal(dbOnly([dbModel({ artifactTitle: "Billing Service" })]), ctx);
  assert.equal(r.databaseModels[0].artifactLinked, true);
});

test("multi-model: one valid, one invalid → no cross-contamination", () => {
  const good = dbModel({ title: "Player Database" });
  const bad = dbModel({ title: "Broken", entities: [{ name: "X", confidence: 0.5, fields: [] }] });
  const r = validateBootstrapProposal(dbOnly([good, bad]), emptyCtx());
  assert.equal(r.databaseModels[0].accepted, true);
  assert.equal(r.databaseModels[1].accepted, false);
  assert.equal(r.ok, true);
});

test("database validation is deterministic (same input ⇒ deep-equal report)", () => {
  const model = dbModel({
    entities: [
      { name: "Team", confidence: 0.9, fields: [{ name: "id", type: "uuid", required: true, isPrimaryKey: true, isForeignKey: false, confidence: 0.9 }] },
      { name: "Player", confidence: 0.9, fields: [{ name: "team_id", type: "uuid", required: true, isPrimaryKey: false, isForeignKey: true, referencesEntityName: "Team", confidence: 0.8 }] },
    ],
  });
  const a = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  const b = validateBootstrapProposal(dbOnly([model]), emptyCtx());
  assert.deepEqual(a, b);
});

// ────────────────────────── API catalog (Bootstrap V2, Phase 2) ──────────────────────────

test("valid API spec: spec + endpoints all accepted, ok true", () => {
  const r = validateBootstrapProposal(apiOnly([apiSpec()]), emptyCtx());
  assert.equal(r.ok, true);
  assert.equal(r.apiSpecs.length, 1);
  assert.equal(r.apiSpecs[0].accepted, true);
  assert.deepEqual(r.apiSpecs[0].endpoints.map((e) => e.accepted), [true, true]);
});

test("API-only proposal still applies (ok true even with no artifacts)", () => {
  const r = validateBootstrapProposal(apiOnly([apiSpec()]), emptyCtx());
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test("artifactTitle resolves to a proposed artifact → spec linked", () => {
  const r = validateBootstrapProposal(
    proposal({ apiSpecs: [apiSpec({ artifactTitle: "Player Management" })] }),
    emptyCtx(),
  );
  assert.equal(r.apiSpecs[0].accepted, true);
  assert.equal(r.apiSpecs[0].artifactLinked, true);
});

test("unresolved artifactTitle drops the link but keeps the spec", () => {
  const r = validateBootstrapProposal(
    proposal({ apiSpecs: [apiSpec({ artifactTitle: "Nonexistent Service" })] }),
    emptyCtx(),
  );
  assert.equal(r.apiSpecs[0].accepted, true);
  assert.equal(r.apiSpecs[0].artifactLinked, false);
});

test("duplicate API spec title within the proposal → second spec rejected", () => {
  const r = validateBootstrapProposal(apiOnly([apiSpec(), apiSpec({ title: " booking   api " })]), emptyCtx());
  assert.equal(r.apiSpecs[0].accepted, true);
  assert.equal(r.apiSpecs[1].accepted, false);
  assert.match(r.apiSpecs[1].reason ?? "", /duplicate api spec title/i);
});

test("duplicate endpoint (method + path) within a spec → second endpoint rejected", () => {
  const spec = apiSpec({
    endpoints: [
      { method: "GET", path: "/bookings", summary: "List", requiresAuth: true, confidence: 0.9 },
      { method: "GET", path: "/bookings", summary: "List again", requiresAuth: true, confidence: 0.9 },
    ],
  });
  const r = validateBootstrapProposal(apiOnly([spec]), emptyCtx());
  assert.equal(r.apiSpecs[0].endpoints[0].accepted, true);
  assert.equal(r.apiSpecs[0].endpoints[1].accepted, false);
  assert.match(r.apiSpecs[0].endpoints[1].reason ?? "", /duplicate endpoint/i);
  // The spec still applies via the surviving endpoint.
  assert.equal(r.apiSpecs[0].accepted, true);
});

test("invalid path (not starting with /) → endpoint rejected", () => {
  const spec = apiSpec({
    endpoints: [
      { method: "GET", path: "bookings", summary: "List", requiresAuth: true, confidence: 0.9 },
      { method: "POST", path: "/bookings", summary: "Create", requiresAuth: true, confidence: 0.9 },
    ],
  });
  const r = validateBootstrapProposal(apiOnly([spec]), emptyCtx());
  assert.equal(r.apiSpecs[0].endpoints[0].accepted, false);
  assert.match(r.apiSpecs[0].endpoints[0].reason ?? "", /must start with \//i);
  assert.equal(r.apiSpecs[0].endpoints[1].accepted, true);
});

test("invalid HTTP method → endpoint rejected", () => {
  const spec = apiSpec({
    endpoints: [
      { method: "FETCH" as never, path: "/bookings", summary: "List", requiresAuth: true, confidence: 0.9 },
      { method: "GET", path: "/bookings", summary: "List", requiresAuth: true, confidence: 0.9 },
    ],
  });
  const r = validateBootstrapProposal(apiOnly([spec]), emptyCtx());
  assert.equal(r.apiSpecs[0].endpoints[0].accepted, false);
  assert.match(r.apiSpecs[0].endpoints[0].reason ?? "", /unknown http method/i);
});

test("empty / overlong endpoint summary → endpoint rejected", () => {
  const spec = apiSpec({
    endpoints: [
      { method: "GET", path: "/a", summary: "", requiresAuth: true, confidence: 0.9 },
      { method: "GET", path: "/b", summary: "x".repeat(121), requiresAuth: true, confidence: 0.9 },
      { method: "GET", path: "/c", summary: "ok", requiresAuth: true, confidence: 0.9 },
    ],
  });
  const r = validateBootstrapProposal(apiOnly([spec]), emptyCtx());
  assert.equal(r.apiSpecs[0].endpoints[0].accepted, false);
  assert.match(r.apiSpecs[0].endpoints[0].reason ?? "", /empty endpoint summary/i);
  assert.equal(r.apiSpecs[0].endpoints[1].accepted, false);
  assert.match(r.apiSpecs[0].endpoints[1].reason ?? "", /exceeds 120/i);
  assert.equal(r.apiSpecs[0].endpoints[2].accepted, true);
});

test("spec with no valid endpoints → spec rejected", () => {
  const spec = apiSpec({
    endpoints: [{ method: "GET", path: "no-slash", summary: "bad", requiresAuth: true, confidence: 0.9 }],
  });
  const r = validateBootstrapProposal(apiOnly([spec]), emptyCtx());
  assert.equal(r.apiSpecs[0].accepted, false);
  assert.match(r.apiSpecs[0].reason ?? "", /no valid endpoints/i);
});

test("empty spec title → spec rejected", () => {
  const r = validateBootstrapProposal(apiOnly([apiSpec({ title: "   " })]), emptyCtx());
  assert.equal(r.apiSpecs[0].accepted, false);
  assert.match(r.apiSpecs[0].reason ?? "", /empty api spec title/i);
});

test("mixed valid/invalid API specs → no cross-contamination, ok true", () => {
  const good = apiSpec({ title: "Booking API" });
  const bad = apiSpec({
    title: "Broken API",
    endpoints: [{ method: "GET", path: "nope", summary: "bad", requiresAuth: true, confidence: 0.5 }],
  });
  const r = validateBootstrapProposal(apiOnly([good, bad]), emptyCtx());
  assert.equal(r.apiSpecs[0].accepted, true);
  assert.equal(r.apiSpecs[1].accepted, false);
  assert.equal(r.ok, true);
});

test("API validation is deterministic (same input ⇒ deep-equal report)", () => {
  const a = validateBootstrapProposal(apiOnly([apiSpec()]), emptyCtx());
  const b = validateBootstrapProposal(apiOnly([apiSpec()]), emptyCtx());
  assert.deepEqual(a, b);
});
