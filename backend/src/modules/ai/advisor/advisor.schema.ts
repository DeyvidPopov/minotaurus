// advisor.schema.ts — the structured contract for an AI Architecture Advisory
// (the "Advisor / Next Steps" mode), expressed twice (mirroring review.schema.ts):
//   1. `advisorReportSchema` (Zod) — validates the model's output at runtime.
//   2. `advisorToolInputSchema` (JSON Schema) — forces Claude to emit conforming
//      JSON via tool_choice.
// The Advisor is a COACH, not an auditor: it emits a short snapshot, the top 2–3
// focus areas, a few opportunities, and prioritized next steps — NOT the full
// audit (strengths/risks/blind spots/…) that Full Review owns. Field/emit order
// is load-bearing: executiveSummary first, recommendations last, so a truncated
// (max_tokens) response loses the most expendable trailing field rather than the
// snapshot. Item COUNTS (not prose length) bound output.

import { z } from "zod";

const PRIORITY = ["HIGH", "MEDIUM", "LOW"] as const;

// Evidence is lenient on `kind`/`value` (cosmetic) but strict on `ref` — the ref
// is what the deterministic verifier resolves against the digest allow-list.
const evidenceRefSchema = z.object({
  kind: z.enum(["metric", "artifact", "risk", "resource", "count"]).catch("metric"),
  ref: z.string().trim().min(1).max(160),
  value: z.union([z.string(), z.number()]).optional().catch(undefined),
});

// Curated, not exhaustive: at most 3 of the most relevant evidence refs.
const evidenceArray = z.array(evidenceRefSchema).max(3);

const title = z.string().trim().min(1).max(160);
// The prompt + tool schema tell the model to keep prose <= 280 chars; this Zod
// GATE allows a small buffer so a marginal overshoot is accepted instead of
// failing the whole advisory.
const prose = z.string().trim().min(1).max(400);

// A focus area / opportunity: heading + why-it-matters + evidence.
const noteSchema = z.object({
  title,
  detail: prose,
  evidence: evidenceArray,
});

const recommendationSchema = z.object({
  title,
  priority: z.enum(PRIORITY).catch("MEDIUM"),
  rationale: prose,
  evidence: evidenceArray,
});

export const advisorReportSchema = z.object({
  // Prompt/tool target is a very short snapshot (<= 80 words); the gate allows a
  // buffer (see `prose`).
  executiveSummary: z.string().trim().min(1).max(1200),
  // Top 2–3 concerns to address now (the dominant section).
  focusAreas: z.array(noteSchema).max(3),
  // A few lightweight improvement areas.
  opportunities: z.array(noteSchema).max(4),
  // Hard cap of 5 prioritized next steps (the centerpiece).
  recommendations: z.array(recommendationSchema).max(5),
});

export type ParsedAdvisorReport = z.infer<typeof advisorReportSchema>;

// Lenient salvage schema for a max_tokens-truncated response: keep whatever
// complete sections arrived (field order emits recommendations last, so the
// prefix is usually intact), drop any section that failed to parse. Used ONLY on
// truncation — the strict schema above governs the normal path.
export const partialAdvisorReportSchema = z
  .object({
    executiveSummary: z.string().trim().min(1).max(3000).optional().catch(undefined),
    focusAreas: z.array(noteSchema).optional().catch([]),
    opportunities: z.array(noteSchema).optional().catch([]),
    recommendations: z.array(recommendationSchema).optional().catch([]),
  })
  .catch({});

// ── Claude tool (structured output) ──

export const ADVISOR_TOOL_NAME = "write_architecture_advisory";
export const ADVISOR_TOOL_DESCRIPTION =
  "Return a senior-architect ADVISORY (an action plan, not an audit): a short snapshot, the top 2–3 focus areas, a few opportunities, and prioritized next steps. Help the team decide where to focus. Cite evidence by digest key for every item.";

const evidenceItems = {
  type: "array",
  maxItems: 3,
  description:
    "1–3 pieces of the MOST relevant evidence. Each `ref` MUST be a string copied verbatim from the digest's evidenceKeys array. An item with NO valid evidence will be discarded.",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["metric", "artifact", "risk", "resource", "count"] },
      ref: { type: "string", description: "A string from digest.evidenceKeys (a metric path or an id/finding code you were shown)." },
      value: { type: "string", description: "Optional: the cited number/value, as text." },
    },
    required: ["kind", "ref"],
    additionalProperties: false,
  },
} as const;

const detail = {
  type: "string",
  description: "A grounded statement of why this matters and what to look at (<= 280 chars). Concise; reference only the numbers that drive the point.",
};
const rationale = {
  type: "string",
  description: "Why this next step matters, grounded in the evidence (<= 280 chars).",
};

// Property order = emission order. recommendations is last (most expendable on truncation).
export const advisorToolInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    executiveSummary: {
      type: "string",
      description: "Executive Snapshot: a VERY short statement of where the project stands (<= 80 words), grounded in the health score and grade. This is a snapshot, NOT an assessment — do not enumerate findings here.",
    },
    focusAreas: {
      type: "array",
      maxItems: 3,
      description: "Current Focus Areas: the TOP 2–3 architectural concerns that deserve attention NOW — the most important things, not a risk inventory. Each grounded in evidence. Prefer fewer, higher-leverage areas.",
      items: {
        type: "object",
        properties: { title: { type: "string", description: "Short heading (<= 120 chars)." }, detail, evidence: evidenceItems },
        required: ["title", "detail", "evidence"],
        additionalProperties: false,
      },
    },
    opportunities: {
      type: "array",
      maxItems: 4,
      description: "Opportunities: a few areas where architecture quality could improve (e.g. better ownership, stronger traceability, reduced coupling). Lightweight — each grounded in evidence.",
      items: {
        type: "object",
        properties: { title: { type: "string", description: "Short heading (<= 120 chars)." }, detail, evidence: evidenceItems },
        required: ["title", "detail", "evidence"],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: "array",
      maxItems: 5,
      description: "Recommended Next Steps: AT MOST 5 prioritized actions — the highest-leverage things to do first. Each MUST cite evidence. Order by priority (HIGH first). Emit this field LAST.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, specific heading (<= 120 chars)." },
          priority: { type: "string", enum: PRIORITY },
          rationale,
          evidence: evidenceItems,
        },
        required: ["title", "priority", "rationale", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["executiveSummary", "focusAreas", "opportunities", "recommendations"],
  additionalProperties: false,
};
