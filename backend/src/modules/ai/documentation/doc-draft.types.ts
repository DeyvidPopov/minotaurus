// doc-draft.types.ts — DTOs for the artifact-level AI Documentation Assistant.
//
// On-demand, per-artifact, human-reviewed draft generation. The chain is:
//   SSOT (one artifact + its local neighborhood) → bounded ArtifactDocDigest →
//   AI Markdown draft → existing documentation editor (pre-filled) → user Save.
// AI never writes documentation; it only drafts text the user reviews and saves
// through the existing PUT /artifacts/:id/documentation path.
// Mirrored on the frontend in lib/api/ai.ts.

// ── Raw input handed to the pure digest builder (already fetched from Prisma) ──
// Kept separate so the builder stays pure/deterministic and unit-testable
// without a database — the service does the Prisma joins, the builder caps/shapes.

export interface RawDocRelation {
  relationType: string;
  neighborTitle: string;
  neighborType: string;
  neighborStatus: string;
}

export interface RawDocApiSpec {
  title: string;
  version: string;
  endpointPaths: string[];
}

export interface RawDocDatabaseModel {
  title: string;
  databaseType: string;
  entityNames: string[];
}

export interface RawDocDiagram {
  title: string;
  diagramType: string;
}

export interface RawDocValidationIssue {
  severity: string;
  category: string;
  message: string;
}

export interface RawDocDigestInput {
  project: { name: string; description: string };
  artifact: {
    id: string;
    title: string;
    type: string;
    status: string;
    tags: string[];
    description: string;
    documentationContent: string | null;
  };
  incoming: RawDocRelation[];
  outgoing: RawDocRelation[];
  apiSpecs: RawDocApiSpec[];
  databaseModels: RawDocDatabaseModel[];
  diagrams: RawDocDiagram[];
  validationIssues: RawDocValidationIssue[];
}

// ── ArtifactDocDigest (the bounded, deterministic context the model sees) ──
// Every list is capped with its true total kept so the model can speak to
// magnitude without seeing every row. Never the whole project.

export interface DigestRelation {
  direction: "incoming" | "outgoing";
  relationType: string;
  neighborTitle: string;
  neighborType: string;
  neighborStatus: string;
}

export interface DigestApiSpec {
  title: string;
  version: string;
  endpointCount: number;
  topPaths: string[];
}

export interface DigestDatabaseModel {
  title: string;
  databaseType: string;
  entities: string[];
}

export interface DigestDiagram {
  title: string;
  diagramType: string;
}

export interface DigestValidationIssue {
  severity: string;
  category: string;
  message: string;
}

export interface DigestList<T> {
  total: number;
  shown: T[];
}

export interface ArtifactDocDigest {
  project: { name: string; description: string };
  artifact: {
    id: string;
    title: string;
    type: string;
    status: string;
    tags: string[];
    description: string;
    hasDocumentation: boolean;
    existingDocLength: number;
    existingDocExcerpt: string;
  };
  relations: DigestList<DigestRelation>;
  apiSpecs: DigestList<DigestApiSpec>;
  databaseModels: DigestList<DigestDatabaseModel>;
  diagrams: DigestList<DigestDiagram>;
  validationIssues: DigestList<DigestValidationIssue>;
  /** The caps applied (so the audit/UI can record what was elided). */
  caps: { relations: number; resources: number; validationIssues: number };
}

// ── Endpoint result (draft only — NO SSOT write) ──

export interface DocDraftResult {
  /** AiSession audit row id (null only if the best-effort audit write failed). */
  sessionId: string | null;
  /** The AI-drafted Markdown the editor opens pre-filled with. */
  markdown: string;
  /** "new" when the artifact has no docs yet; otherwise an improvement suggestion. */
  mode: "new" | "replacement_suggestion";
  generatedAt: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** True when the model hit its output ceiling; the markdown is still a usable draft. */
  truncated: boolean;
}
