// bootstrap.schema.ts — the strict contract for AI bootstrap proposals, expressed
// twice and kept in sync from the Prisma enums:
//   1. `bootstrapProposalSchema` (Zod) — validates any proposal at runtime
//      (Claude output at propose; the user-selected subset at apply).
//   2. `bootstrapToolInputSchema` (JSON Schema) — handed to Claude as a tool so
//      the model is forced to emit conforming JSON.
// Deriving both from `ArtifactType` / `RelationType` guarantees they never drift
// from the database enums.

import { z } from "zod";
import { ArtifactType, RelationType } from "@prisma/client";

const ARTIFACT_TYPE_VALUES = Object.values(ArtifactType) as [ArtifactType, ...ArtifactType[]];
const RELATION_TYPE_VALUES = Object.values(RelationType) as [RelationType, ...RelationType[]];

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

// Lenient counts: structural only. The 3–20 / 1–3 *generation* targets live in the
// tool schema + prompt. Apply may receive a smaller user-selected subset, so the
// shared schema must not enforce minimums beyond what apply allows.
// Field order mirrors the tool schema (diagrams before the bulky `relations`) so
// that, if the model overshoots the budget, `relations` — the largest and most
// expendable field — is the last to be emitted rather than the required diagrams.
export const bootstrapProposalSchema = z.object({
  summary: z.string().trim().max(400).catch(""),
  artifacts: z.array(proposedArtifactSchema).max(20),
  diagrams: z.array(proposedDiagramSchema).max(3),
  relations: z.array(proposedRelationSchema).max(40),
});

export type ParsedBootstrapProposal = z.infer<typeof bootstrapProposalSchema>;

// ── Claude tool (structured output) ──

export const BOOTSTRAP_TOOL_NAME = "propose_architecture";
export const BOOTSTRAP_TOOL_DESCRIPTION =
  "Return the proposed initial architecture (artifacts, relations, and 1–3 Mermaid flowchart diagrams) as structured data.";

const artifactTypeEnum = Object.values(ArtifactType) as string[];
const relationTypeEnum = Object.values(RelationType) as string[];

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
  },
  required: ["summary", "artifacts", "diagrams", "relations"],
  additionalProperties: false,
};
