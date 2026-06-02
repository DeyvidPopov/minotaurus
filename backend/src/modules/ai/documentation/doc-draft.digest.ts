// doc-draft.digest.ts — pure, deterministic builder for the bounded artifact
// documentation context. No I/O, no Prisma, no Date.now(): the service fetches
// the artifact + its local neighborhood and this shapes/caps it into the digest
// the model sees. Bounded by design — it NEVER receives the whole project.

import type { ArtifactDocDigest, DigestRelation, RawDocDigestInput } from "./doc-draft.types.js";

/** Per-list caps. Incoming + outgoing relations share the relation cap. */
export const DOC_DIGEST_RELATION_CAP = 20;
export const DOC_DIGEST_RESOURCE_CAP = 8;
export const DOC_DIGEST_VALIDATION_CAP = 10;
/** Sub-caps on the bulkiest nested fields, so a single resource can't blow the budget. */
export const DOC_DIGEST_TOP_PATHS = 5;
export const DOC_DIGEST_ENTITY_NAMES = 12;
/** Length of the existing-documentation excerpt handed to the model. */
export const DOC_DIGEST_EXCERPT_CHARS = 280;

function excerpt(markdown: string, max = DOC_DIGEST_EXCERPT_CHARS): string {
  const flat = markdown.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Build the bounded documentation digest for one artifact. Pure and
 * deterministic: same input ⇒ deep-equal digest. Caps every list (relations,
 * linked resources, validation issues) and trims nested sub-lists, keeping the
 * true total of each so the model can reason about magnitude.
 */
export function buildArtifactDocumentationDigest(input: RawDocDigestInput): ArtifactDocDigest {
  const doc = input.artifact.documentationContent ?? "";
  const hasDocumentation = doc.trim().length > 0;

  // Merge incoming + outgoing into one direction-tagged list, then cap the total.
  const allRelations: DigestRelation[] = [
    ...input.incoming.map((r) => ({ direction: "incoming" as const, ...r })),
    ...input.outgoing.map((r) => ({ direction: "outgoing" as const, ...r })),
  ];

  return {
    project: { name: input.project.name, description: input.project.description },
    artifact: {
      id: input.artifact.id,
      title: input.artifact.title,
      type: input.artifact.type,
      status: input.artifact.status,
      tags: input.artifact.tags,
      description: input.artifact.description,
      hasDocumentation,
      existingDocLength: doc.length,
      existingDocExcerpt: hasDocumentation ? excerpt(doc) : "",
    },
    relations: {
      total: allRelations.length,
      shown: allRelations.slice(0, DOC_DIGEST_RELATION_CAP),
    },
    apiSpecs: {
      total: input.apiSpecs.length,
      shown: input.apiSpecs.slice(0, DOC_DIGEST_RESOURCE_CAP).map((s) => ({
        title: s.title,
        version: s.version,
        endpointCount: s.endpointPaths.length,
        topPaths: s.endpointPaths.slice(0, DOC_DIGEST_TOP_PATHS),
      })),
    },
    databaseModels: {
      total: input.databaseModels.length,
      shown: input.databaseModels.slice(0, DOC_DIGEST_RESOURCE_CAP).map((m) => ({
        title: m.title,
        databaseType: m.databaseType,
        entities: m.entityNames.slice(0, DOC_DIGEST_ENTITY_NAMES),
      })),
    },
    diagrams: {
      total: input.diagrams.length,
      shown: input.diagrams.slice(0, DOC_DIGEST_RESOURCE_CAP).map((d) => ({
        title: d.title,
        diagramType: d.diagramType,
      })),
    },
    validationIssues: {
      total: input.validationIssues.length,
      shown: input.validationIssues.slice(0, DOC_DIGEST_VALIDATION_CAP).map((v) => ({
        severity: v.severity,
        category: v.category,
        message: v.message,
      })),
    },
    caps: {
      relations: DOC_DIGEST_RELATION_CAP,
      resources: DOC_DIGEST_RESOURCE_CAP,
      validationIssues: DOC_DIGEST_VALIDATION_CAP,
    },
  };
}
