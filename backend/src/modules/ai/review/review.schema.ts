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

// Bounded so the whole review stays ~3–5k output tokens regardless of project
// size (a truncation root-cause fix — see the investigation). Findings are
// curated, not exhaustive: few high-value items, short prose, ≤3 evidence refs.
const evidenceArray = z.array(evidenceRefSchema).max(3);

const title = z.string().trim().min(1).max(160);
// The prompt + tool schema tell the model to keep prose <= 280 chars; this Zod
// GATE allows a small buffer so a marginal overshoot is accepted instead of
// failing the whole review. Item COUNTS (not prose length) bound total output.
const prose = z.string().trim().min(1).max(400);

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
  // Prompt/tool target is <= 700; the gate allows a small buffer (see `prose`).
  executiveSummary: z.string().trim().min(1).max(900),
  strengths: z.array(strengthSchema).max(3),
  risks: z.array(riskSchema).max(5),
  blindSpots: z.array(blindSpotSchema).max(3),
  governanceReview: z.array(governanceSchema).max(3),
  validationCommentary: z.array(validationCommentarySchema).max(3),
  recommendations: z.array(recommendationSchema).max(5),
});

export type ParsedArchitectureReview = z.infer<typeof architectureReviewSchema>;

// Lenient salvage schema for a max_tokens-truncated response: keep whatever
// complete sections arrived (field order emits recommendations last, so the
// prefix is usually intact), drop any section that failed to parse. Used ONLY on
// truncation — the strict schema above governs the normal path.
export const partialArchitectureReviewSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(2400).optional().catch(undefined),
  strengths: z.array(strengthSchema).optional().catch([]),
  risks: z.array(riskSchema).optional().catch([]),
  blindSpots: z.array(blindSpotSchema).optional().catch([]),
  governanceReview: z.array(governanceSchema).optional().catch([]),
  validationCommentary: z.array(validationCommentarySchema).optional().catch([]),
  recommendations: z.array(recommendationSchema).optional().catch([]),
}).catch({});

// ── Claude tool (structured output) ──

export const REVIEW_TOOL_NAME = "write_architecture_review";
export const REVIEW_TOOL_DESCRIPTION =
  "Return a senior-architect review of the project, interpreting the supplied deterministic analysis. Cite evidence by digest key for every observation.";

const evidenceItems = {
  type: "array",
  maxItems: 3,
  description: "1–3 pieces of the MOST relevant evidence. Each `ref` MUST be a string copied verbatim from the digest's evidenceKeys array.",
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

const observation = { type: "string", description: "A grounded statement of what the analysis shows (<= 280 chars). Concise. No recommendations here." };
const recommendation = { type: "string", description: "One concrete, actionable suggestion (<= 280 chars)." };

// Property order = emission order. recommendations is last (most expendable on truncation).
export const reviewToolInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    executiveSummary: {
      type: "string",
      description: "2–4 sentences (<= 700 chars): the overall architectural assessment, grounded in the health score and grade.",
    },
    strengths: {
      type: "array",
      maxItems: 3,
      description: "Up to 3 of the most notable strengths, each grounded in evidence. Pick the most important; do not list everything.",
      items: finding({ observation }, ["title", "observation"]),
    },
    risks: {
      type: "array",
      maxItems: 5,
      description: "Up to 5 of the most architecturally important risks. Separate observation (what is true) from recommendation (what to do). Prioritize; do not enumerate every issue.",
      items: finding(
        { severity: { type: "string", enum: RISK_SEVERITY }, observation, recommendation },
        ["title", "severity", "observation", "recommendation"],
      ),
    },
    blindSpots: {
      type: "array",
      maxItems: 3,
      description: "Up to 3 gaps the metrics imply but don't name outright (missing policies, thin requirements, etc.).",
      items: finding({ observation, recommendation }, ["title", "observation", "recommendation"]),
    },
    governanceReview: {
      type: "array",
      maxItems: 3,
      description: "Up to 3 governance points: ownership, membership, validation freshness, traceability.",
      items: finding({ observation, recommendation }, ["title", "observation"]),
    },
    validationCommentary: {
      type: "array",
      maxItems: 3,
      description: "Up to 3 notes INTERPRETING existing validation findings. Do NOT invent new validation issues.",
      items: finding({ observation, recommendation }, ["title", "observation"]),
    },
    recommendations: {
      type: "array",
      maxItems: 5,
      description: "Up to 5 prioritized, actionable recommendations — the highest-leverage actions only. Emit this field LAST.",
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
