// review.schema.ts — the structured contract for an AI Architecture Review,
// expressed twice (like bootstrap.schema.ts):
//   1. `architectureReviewSchema` (Zod) — validates the model's output at runtime.
//   2. `reviewToolInputSchema` (JSON Schema) — forces Claude to emit conforming
//      JSON via tool_choice.
// Field/emit order is load-bearing: executiveSummary first, recommendations last,
// so a truncated (max_tokens) response loses the most expendable trailing field
// rather than the required summary.

import { z } from "zod";

const RISK_SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const PRIORITY = ["LOW", "MEDIUM", "HIGH"] as const;

// Evidence is lenient on `kind`/`value` (cosmetic) but strict on `ref` — the ref
// is what the deterministic verifier resolves against the digest allow-list.
const evidenceRefSchema = z.object({
  kind: z.enum(["metric", "artifact", "risk", "resource", "count"]).catch("metric"),
  ref: z.string().trim().min(1).max(160),
  value: z.union([z.string(), z.number()]).optional().catch(undefined),
});

const evidenceArray = z.array(evidenceRefSchema).max(8);

const title = z.string().trim().min(1).max(160);
const prose = z.string().trim().min(1).max(800);

const strengthSchema = z.object({
  title,
  observation: prose,
  evidence: evidenceArray,
});

const riskSchema = z.object({
  title,
  severity: z.enum(RISK_SEVERITY).catch("MEDIUM"),
  observation: prose,
  recommendation: prose,
  evidence: evidenceArray,
});

const blindSpotSchema = z.object({
  title,
  observation: prose,
  recommendation: prose,
  evidence: evidenceArray,
});

const governanceSchema = z.object({
  title,
  observation: prose,
  recommendation: prose.optional().catch(undefined),
  evidence: evidenceArray,
});

const validationCommentarySchema = z.object({
  title,
  observation: prose,
  recommendation: prose.optional().catch(undefined),
  evidence: evidenceArray,
});

const recommendationSchema = z.object({
  title,
  priority: z.enum(PRIORITY).catch("MEDIUM"),
  recommendation: prose,
  evidence: evidenceArray,
});

export const architectureReviewSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(2400),
  strengths: z.array(strengthSchema).max(10),
  risks: z.array(riskSchema).max(15),
  blindSpots: z.array(blindSpotSchema).max(10),
  governanceReview: z.array(governanceSchema).max(10),
  validationCommentary: z.array(validationCommentarySchema).max(10),
  recommendations: z.array(recommendationSchema).max(15),
});

export type ParsedArchitectureReview = z.infer<typeof architectureReviewSchema>;

// ── Claude tool (structured output) ──

export const REVIEW_TOOL_NAME = "write_architecture_review";
export const REVIEW_TOOL_DESCRIPTION =
  "Return a senior-architect review of the project, interpreting the supplied deterministic analysis. Cite evidence by digest key for every observation.";

const evidenceItems = {
  type: "array",
  maxItems: 8,
  description: "Evidence. Each `ref` MUST be a string copied verbatim from the digest's evidenceKeys array.",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["metric", "artifact", "risk", "resource", "count"] },
      ref: { type: "string", description: "A string from digest.evidenceKeys (a metric path or an id you were shown)." },
      value: { type: "string", description: "Optional: the cited number/value, as text." },
    },
    required: ["kind", "ref"],
    additionalProperties: false,
  },
} as const;

const finding = (extra: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties: {
    title: { type: "string", description: "Short, specific heading (<= 120 chars)." },
    ...extra,
    evidence: evidenceItems,
  },
  required: [...required, "evidence"],
  additionalProperties: false,
});

const observation = { type: "string", description: "A grounded statement of what the analysis shows (<= 600 chars). No recommendations here." };
const recommendation = { type: "string", description: "A concrete suggested action (<= 600 chars)." };

// Property order = emission order. recommendations is last (most expendable on truncation).
export const reviewToolInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    executiveSummary: {
      type: "string",
      description: "2–5 sentences (<= 1200 chars): the overall architectural assessment, grounded in the health score and grade.",
    },
    strengths: {
      type: "array",
      maxItems: 10,
      description: "What the architecture does well, each grounded in evidence.",
      items: finding({ observation }, ["title", "observation"]),
    },
    risks: {
      type: "array",
      maxItems: 15,
      description: "Architectural risks. Separate observation (what is true) from recommendation (what to do).",
      items: finding(
        { severity: { type: "string", enum: RISK_SEVERITY }, observation, recommendation },
        ["title", "severity", "observation", "recommendation"],
      ),
    },
    blindSpots: {
      type: "array",
      maxItems: 10,
      description: "Gaps the deterministic metrics imply but don't name outright (missing policies, thin requirements, etc.).",
      items: finding({ observation, recommendation }, ["title", "observation", "recommendation"]),
    },
    governanceReview: {
      type: "array",
      maxItems: 10,
      description: "Ownership, membership, validation freshness, traceability of governance.",
      items: finding({ observation, recommendation }, ["title", "observation"]),
    },
    validationCommentary: {
      type: "array",
      maxItems: 10,
      description: "INTERPRET existing validation findings. Do NOT invent new validation issues.",
      items: finding({ observation, recommendation }, ["title", "observation"]),
    },
    recommendations: {
      type: "array",
      maxItems: 15,
      description: "Prioritized, actionable recommendations. Emit this field LAST.",
      items: finding(
        { priority: { type: "string", enum: PRIORITY }, recommendation },
        ["title", "priority", "recommendation"],
      ),
    },
  },
  required: [
    "executiveSummary",
    "strengths",
    "risks",
    "blindSpots",
    "governanceReview",
    "validationCommentary",
    "recommendations",
  ],
  additionalProperties: false,
};
