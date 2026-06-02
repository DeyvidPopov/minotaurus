// doc-draft.digest.test.ts — pure-logic tests for the artifact documentation
// digest builder. Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_DIGEST_ENTITY_NAMES,
  DOC_DIGEST_RELATION_CAP,
  DOC_DIGEST_RESOURCE_CAP,
  DOC_DIGEST_TOP_PATHS,
  DOC_DIGEST_VALIDATION_CAP,
  buildArtifactDocumentationDigest,
} from "./doc-draft.digest.js";
import type { RawDocDigestInput } from "./doc-draft.types.js";

function raw(over: Partial<RawDocDigestInput> = {}): RawDocDigestInput {
  return {
    project: { name: "Acme", description: "An app" },
    artifact: {
      id: "a1",
      title: "Player Management",
      type: "SERVICE",
      status: "ACTIVE",
      tags: ["core"],
      description: "Owns players",
      documentationContent: null,
    },
    incoming: [],
    outgoing: [],
    apiSpecs: [],
    databaseModels: [],
    diagrams: [],
    validationIssues: [],
    ...over,
  };
}

test("includes project + artifact context and local relations", () => {
  const d = buildArtifactDocumentationDigest(
    raw({
      incoming: [
        { relationType: "USES", neighborTitle: "Auth", neighborType: "SERVICE", neighborStatus: "ACTIVE" },
      ],
      outgoing: [
        { relationType: "DEPENDS_ON", neighborTitle: "Billing", neighborType: "SERVICE", neighborStatus: "DRAFT" },
      ],
    }),
  );

  assert.equal(d.project.name, "Acme");
  assert.equal(d.artifact.title, "Player Management");
  assert.equal(d.artifact.type, "SERVICE");
  assert.deepEqual(d.artifact.tags, ["core"]);
  assert.equal(d.artifact.hasDocumentation, false);

  assert.equal(d.relations.total, 2);
  // incoming emitted before outgoing, each direction-tagged.
  assert.deepEqual(
    d.relations.shown.map((r) => [r.direction, r.relationType, r.neighborTitle]),
    [
      ["incoming", "USES", "Auth"],
      ["outgoing", "DEPENDS_ON", "Billing"],
    ],
  );
});

test("caps relations at the relation cap but keeps the true total", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    relationType: "USES",
    neighborTitle: `N${i}`,
    neighborType: "SERVICE",
    neighborStatus: "ACTIVE",
  }));
  const d = buildArtifactDocumentationDigest(raw({ outgoing: many }));
  assert.equal(d.relations.total, 30);
  assert.equal(d.relations.shown.length, DOC_DIGEST_RELATION_CAP);
});

test("caps linked resources and their nested sub-lists", () => {
  const specs = Array.from({ length: 12 }, (_, i) => ({
    title: `Spec ${i}`,
    version: "1.0.0",
    endpointPaths: Array.from({ length: 10 }, (_, j) => `/p${i}/${j}`),
  }));
  const models = [
    {
      title: "Core DB",
      databaseType: "PostgreSQL",
      entityNames: Array.from({ length: 20 }, (_, i) => `E${i}`),
    },
  ];
  const issues = Array.from({ length: 15 }, (_, i) => ({
    severity: "WARNING",
    category: "DOCUMENTATION",
    message: `issue ${i}`,
  }));

  const d = buildArtifactDocumentationDigest(raw({ apiSpecs: specs, databaseModels: models, validationIssues: issues }));

  assert.equal(d.apiSpecs.total, 12);
  assert.equal(d.apiSpecs.shown.length, DOC_DIGEST_RESOURCE_CAP);
  assert.equal(d.apiSpecs.shown[0].endpointCount, 10);
  assert.equal(d.apiSpecs.shown[0].topPaths.length, DOC_DIGEST_TOP_PATHS);

  assert.equal(d.databaseModels.shown[0].entities.length, DOC_DIGEST_ENTITY_NAMES);

  assert.equal(d.validationIssues.total, 15);
  assert.equal(d.validationIssues.shown.length, DOC_DIGEST_VALIDATION_CAP);
});

test("flags existing documentation and builds a bounded excerpt", () => {
  const longDoc = "# Title\n\n" + "word ".repeat(200);
  const d = buildArtifactDocumentationDigest(raw({ artifact: { ...raw().artifact, documentationContent: longDoc } }));
  assert.equal(d.artifact.hasDocumentation, true);
  assert.equal(d.artifact.existingDocLength, longDoc.length);
  assert.ok(d.artifact.existingDocExcerpt.length <= 280);
  assert.ok(d.artifact.existingDocExcerpt.endsWith("…"));
});

test("is deterministic — same input ⇒ deep-equal digest", () => {
  const input = raw({
    incoming: [{ relationType: "USES", neighborTitle: "Auth", neighborType: "SERVICE", neighborStatus: "ACTIVE" }],
    diagrams: [{ title: "Flow", diagramType: "FLOWCHART" }],
  });
  assert.deepEqual(buildArtifactDocumentationDigest(input), buildArtifactDocumentationDigest(input));
});
