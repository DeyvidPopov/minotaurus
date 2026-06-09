// bootstrap.schema.ts — the strict contract for AI bootstrap proposals, expressed
// twice and kept in sync from the Prisma enums:
//   1. `bootstrapProposalSchema` (Zod) — validates any proposal at runtime
//      (Claude output at propose; the user-selected subset at apply).
//   2. `bootstrapToolInputSchema` (JSON Schema) — handed to Claude as a tool so
//      the model is forced to emit conforming JSON.
// Deriving both from `ArtifactType` / `RelationType` guarantees they never drift
// from the database enums.

import { z } from "zod";
import { ArtifactType, DatabaseType, HttpMethod, RelationType } from "@prisma/client";

const ARTIFACT_TYPE_VALUES = Object.values(ArtifactType) as [ArtifactType, ...ArtifactType[]];
const RELATION_TYPE_VALUES = Object.values(RelationType) as [RelationType, ...RelationType[]];
const DATABASE_TYPE_VALUES = Object.values(DatabaseType) as [DatabaseType, ...DatabaseType[]];
const HTTP_METHOD_VALUES = Object.values(HttpMethod) as [HttpMethod, ...HttpMethod[]];

// Confidence/rationale are cosmetic — be lenient so one odd value never fails the
// whole parse. Titles and enums stay strict (structural correctness).
const confidence = z.number().min(0).max(1).catch(0.5);

export const proposedArtifactSchema = z.object({
  title: z.string().trim().min(1).max(120),
  type: z.enum(ARTIFACT_TYPE_VALUES),
  rationale: z.string().trim().max(240).catch(""),
  confidence,
});

export const proposedRelationSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(120),
  targetTitle: z.string().trim().min(1).max(120),
  relationType: z.enum(RELATION_TYPE_VALUES),
  rationale: z.string().trim().max(200).catch(""),
  confidence,
});

export const proposedDiagramSchema = z.object({
  title: z.string().trim().min(1).max(120),
  mermaidSource: z.string().trim().min(1).max(8000),
  confidence,
});

// ── Database (Bootstrap V2, Phase 1) ──
// Structure-only: names, types, and PK/FK flags. The FK target is expressed as
// `referencesEntityName` (an entity name within the SAME model) — ids don't exist
// until apply; the validator resolves the name → an entity, apply maps it to an id.
// Flags/strings are lenient (`.catch`) so one odd value never fails the whole parse;
// only the names stay strict (structural correctness).
export const proposedDatabaseFieldSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.string().trim().min(1).max(60).catch("text"),
  required: z.boolean().catch(false),
  isPrimaryKey: z.boolean().catch(false),
  isForeignKey: z.boolean().catch(false),
  referencesEntityName: z.string().trim().max(80).nullable().optional().catch(null),
  // Optional PRECISE FK target column (the referenced entity's column name). Lenient
  // + optional so older / column-less proposals still parse; apply falls back to the
  // referenced entity's single primary key when this is absent.
  referencesFieldName: z.string().trim().max(80).nullable().optional().catch(null),
  confidence,
});

export const proposedDatabaseEntitySchema = z.object({
  name: z.string().trim().min(1).max(80),
  fields: z.array(proposedDatabaseFieldSchema).max(12),
  confidence,
});

export const proposedDatabaseModelSchema = z.object({
  title: z.string().trim().min(1).max(120),
  databaseType: z.enum(DATABASE_TYPE_VALUES).catch("PostgreSQL"),
  /** Optional link to the owning artifact (by exact title); dropped if it doesn't resolve. */
  artifactTitle: z.string().trim().max(120).nullable().optional().catch(null),
  entities: z.array(proposedDatabaseEntitySchema).max(8),
  confidence,
});

// ── API catalog (Bootstrap V2, Phase 2) ──
// Lightweight catalog only: method + path + a one-line summary. Request/response
// schema BODIES are deliberately NOT generated (token bloat / truncation risk) —
// apply persists them as the existing empty-string default. `method` is a strict
// enum and `summary` is strictly capped (mirrors the artifact-type / title strictness):
// a structurally broken endpoint trips the one repair retry rather than slipping through.
export const proposedApiEndpointSchema = z.object({
  method: z.enum(HTTP_METHOD_VALUES),
  path: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(120),
  requiresAuth: z.boolean().catch(true), // default to secured when unclear
  confidence,
});

export const proposedApiSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(40).catch("1.0.0"),
  baseUrl: z.string().trim().max(200).nullable().optional().catch(""),
  /** Optional link to the owning artifact (by exact title); dropped if it doesn't resolve. */
  artifactTitle: z.string().trim().max(120).nullable().optional().catch(null),
  description: z.string().trim().max(200).catch(""),
  endpoints: z.array(proposedApiEndpointSchema).max(10),
  confidence,
});

// Lenient counts: structural only. The 3–20 / 1–3 *generation* targets live in the
// tool schema + prompt. Apply may receive a smaller user-selected subset, so the
// shared schema must not enforce minimums beyond what apply allows.
// Field order mirrors the tool schema (diagrams before the bulky `relations`) so
// that, if the model overshoots the budget, `relations` — the largest and most
// expendable field — is the last to be emitted rather than the required diagrams.
// `databaseModels` is last and `.default([])`: it is the newest, most expendable
// block (emitted last in the tool schema), so a truncated or DB-less response still
// parses — the trailing database section is simply absent.
export const bootstrapProposalSchema = z.object({
  summary: z.string().trim().max(400).catch(""),
  artifacts: z.array(proposedArtifactSchema).max(20),
  diagrams: z.array(proposedDiagramSchema).max(3),
  relations: z.array(proposedRelationSchema).max(40),
  databaseModels: z.array(proposedDatabaseModelSchema).max(4).default([]),
  // `apiSpecs` is the newest, most expendable block — emitted last, `.default([])`,
  // so a truncated or API-less response still parses.
  apiSpecs: z.array(proposedApiSpecSchema).max(4).default([]),
});

export type ParsedBootstrapProposal = z.infer<typeof bootstrapProposalSchema>;

// ── Claude tool (structured output) ──

export const BOOTSTRAP_TOOL_NAME = "propose_architecture";
export const BOOTSTRAP_TOOL_DESCRIPTION =
  "Return the proposed initial architecture (artifacts, relations, 1–3 Mermaid flowchart diagrams, optional database models, and an optional API catalog) as structured data.";

const artifactTypeEnum = Object.values(ArtifactType) as string[];
const relationTypeEnum = Object.values(RelationType) as string[];
const databaseTypeEnum = Object.values(DatabaseType) as string[];
const httpMethodEnum = Object.values(HttpMethod) as string[];

// Property order = emission order. Diagrams are placed BEFORE relations so a
// truncated response loses trailing relations (expendable) rather than the
// required diagrams. Descriptions carry the brevity caps that keep the output
// within the token budget.
export const bootstrapToolInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One or two sentences (<= 250 characters) describing the proposed architecture.",
    },
    artifacts: {
      type: "array",
      minItems: 3,
      maxItems: 20,
      description: "The components/services of the system. Domain capabilities first.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concise, unique, Title Case name." },
          type: { type: "string", enum: artifactTypeEnum },
          rationale: { type: "string", description: "One concise sentence (<= 160 characters): why this exists." },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["title", "type", "rationale", "confidence"],
        additionalProperties: false,
      },
    },
    diagrams: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      description: "1–3 Mermaid flowchart diagrams visualizing the architecture. Emit these before relations.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title (<= 80 characters)." },
          mermaidSource: {
            type: "string",
            description: "Valid Mermaid flowchart, starting with 'flowchart TD' or 'flowchart LR'. Structure only — no styling.",
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["title", "mermaidSource", "confidence"],
        additionalProperties: false,
      },
    },
    relations: {
      type: "array",
      maxItems: 40,
      description: "Directed relations between artifacts, referenced by exact title. Include only the most important — roughly 1–3 per service.",
      items: {
        type: "object",
        properties: {
          sourceTitle: { type: "string" },
          targetTitle: { type: "string" },
          relationType: { type: "string", enum: relationTypeEnum },
          rationale: { type: "string", description: "One concise sentence (<= 120 characters)." },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["sourceTitle", "targetTitle", "relationType", "rationale", "confidence"],
        additionalProperties: false,
      },
    },
    // Database models are emitted LAST (after relations) so a truncated response
    // sheds them before any required field. Structure only — no prose bodies.
    databaseModels: {
      type: "array",
      maxItems: 4,
      description:
        "Optional database models for the data-owning services. One model per service that stores data; skip if the idea has no obvious persistence. Structure only — no sample data.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concise model name, e.g. \"Player Database\"." },
          databaseType: { type: "string", enum: databaseTypeEnum },
          artifactTitle: {
            type: "string",
            description: "Exact title of the owning artifact this model belongs to (must match one of the artifacts).",
          },
          entities: {
            type: "array",
            maxItems: 8,
            description: "The tables/collections of this model. Name each after a domain noun (e.g. Player, Match).",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Singular domain noun, Title Case (e.g. \"Player\")." },
                fields: {
                  type: "array",
                  maxItems: 12,
                  description: "Columns. Give each entity an id primary key plus its key attributes. Be terse.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "snake_case or camelCase column name." },
                      type: { type: "string", description: "Short type, e.g. uuid, text, int, boolean, timestamp." },
                      required: { type: "boolean" },
                      isPrimaryKey: { type: "boolean" },
                      isForeignKey: { type: "boolean" },
                      referencesEntityName: {
                        type: "string",
                        description: "For a foreign key: the EXACT name of the entity (in this same model) it references.",
                      },
                      referencesFieldName: {
                        type: "string",
                        description: "For a foreign key: the EXACT referenced column name in that entity (usually its id / primary key). Optional — omit if unsure.",
                      },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                    },
                    required: ["name", "type", "required", "isPrimaryKey", "isForeignKey", "confidence"],
                    additionalProperties: false,
                  },
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["name", "fields", "confidence"],
              additionalProperties: false,
            },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["title", "databaseType", "entities", "confidence"],
        additionalProperties: false,
      },
    },
    // API catalog is emitted LAST (after databaseModels) so a truncated response
    // sheds it before any required field. Catalog only — no request/response bodies.
    apiSpecs: {
      type: "array",
      maxItems: 4,
      description:
        "Optional API catalog: 1–3 specs for the system's important HTTP boundaries. Skip entirely if the idea has no obvious API surface. No request/response schema bodies.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concise spec name, e.g. \"Booking API\"." },
          version: { type: "string", description: "Semantic version, default \"1.0.0\"." },
          baseUrl: { type: "string", description: "Optional base URL, e.g. \"/api/v1\" (may be empty)." },
          artifactTitle: {
            type: "string",
            description: "Exact title of the owning artifact this API exposes (must match one of the artifacts).",
          },
          description: { type: "string", description: "One short sentence (<= 200 characters). May be empty." },
          endpoints: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            description: "The key endpoints. Be concise — the most important operations only.",
            items: {
              type: "object",
              properties: {
                method: { type: "string", enum: httpMethodEnum },
                path: { type: "string", description: "Route path starting with '/', e.g. \"/bookings/{id}\"." },
                summary: { type: "string", description: "One concise line (<= 120 characters): what the endpoint does." },
                requiresAuth: { type: "boolean", description: "Whether the endpoint requires authentication (default true)." },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["method", "path", "summary", "requiresAuth", "confidence"],
              additionalProperties: false,
            },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["title", "version", "endpoints", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "artifacts", "diagrams", "relations"],
  additionalProperties: false,
};
