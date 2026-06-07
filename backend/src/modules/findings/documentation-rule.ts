// documentation-rule.ts — the pure MISSING_DOCUMENTATION rule (Option B).
//
// An artifact is "missing documentation" when it is a documentable, non-deprecated
// artifact that has NEITHER its own documentationContent NOR an incoming DOCUMENTS
// relation (i.e. it is not documented by a linked DOCUMENTATION artifact).
//
// This broadens the old rule (which only flagged empty DOCUMENTATION-type
// artifacts) to the types that should carry documentation, while staying quiet on
// the cases that would only add noise:
//   - non-documentable types (API_ENDPOINT, DATABASE_ENTITY, DIAGRAM, REQUIREMENT,
//     ENVIRONMENT) and EXTERNAL_SYSTEM (third-party / intentionally undocumented),
//   - DEPRECATED artifacts (being retired — don't nag),
//   - artifacts already documented by their own content OR a DOCUMENTS relation.
//
// (DRAFT is intentionally IN scope: the UI/AI-bootstrap default new artifacts to
// DRAFT, so excluding it would hide exactly the findings this rule is meant to
// surface. Flip the status guard to also skip DRAFT if bootstrap noise is a
// concern — it is a one-line change, isolated here.)
//
// Pure + deterministic: no IO, no clock, no randomness; output sorted by id.

export interface DocArtifactInput {
  id: string;
  title: string;
  type: string;
  status: string;
  documentationContent: string | null;
}

export interface DocRelationInput {
  targetArtifactId: string;
  relationType: string;
}

// Artifact types expected to carry documentation. Deliberately narrow (the types
// the rule should cover) so sub-resources / self-describing types aren't flagged.
// EXTERNAL_SYSTEM is excluded on purpose (often a third-party we don't own).
export const DOCUMENTABLE_TYPES: ReadonlySet<string> = new Set([
  "SERVICE",
  "API_SPEC",
  "DATABASE_MODEL",
  "SECURITY_POLICY",
  "DOCUMENTATION",
]);

export interface MissingDocFinding {
  artifactId: string;
  title: string;
  type: string;
  message: string;
}

function hasOwnDocumentation(content: string | null): boolean {
  return !!content && content.trim().length > 0;
}

/**
 * Compute the MISSING_DOCUMENTATION findings for a project. `relations` only needs
 * the in-project edges; only DOCUMENTS edges matter here.
 */
export function analyzeMissingDocumentation(
  artifacts: DocArtifactInput[],
  relations: DocRelationInput[],
): MissingDocFinding[] {
  // Artifacts documented by a linked DOCUMENTATION artifact (incoming DOCUMENTS
  // edge). Not flagged even with empty own content — the finding (if any) lands on
  // the documenting artifact instead. This is the main anti-noise guard.
  const documentedByRelation = new Set(
    relations.filter((r) => r.relationType === "DOCUMENTS").map((r) => r.targetArtifactId),
  );

  const findings: MissingDocFinding[] = [];
  for (const a of artifacts) {
    if (!DOCUMENTABLE_TYPES.has(a.type)) continue;
    if (a.status === "DEPRECATED") continue;
    if (hasOwnDocumentation(a.documentationContent)) continue;
    if (documentedByRelation.has(a.id)) continue;

    // Keep the EXACT legacy message for DOCUMENTATION artifacts so prior IGNORED
    // (waived) decisions — fingerprinted on the message — survive the change. Other
    // types get a generic message that still contains "no documentation content",
    // so the classifier maps both to MISSING_DOCUMENTATION (Quick Fix wiring intact).
    const message =
      a.type === "DOCUMENTATION"
        ? `Documentation artifact "${a.title}" has no documentation content.`
        : `Artifact "${a.title}" has no documentation content.`;
    findings.push({ artifactId: a.id, title: a.title, type: a.type, message });
  }

  return findings.sort((x, y) => (x.artifactId < y.artifactId ? -1 : x.artifactId > y.artifactId ? 1 : 0));
}
