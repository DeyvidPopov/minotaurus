// doc-draft.schema.ts — the structured contract for an AI documentation draft,
// expressed twice (like bootstrap.schema.ts / review.schema.ts):
//   1. `docDraftSchema` (Zod) — validates the model's output at runtime.
//   2. `docDraftToolInputSchema` (JSON Schema) — forces Claude to emit conforming
//      JSON via tool_choice.
// The output is a single Markdown string; there is no apply path — the user
// reviews/edits and saves through the existing documentation endpoint.

import { z } from "zod";

/** Prompt target is ~1200–1800 chars; the Zod gate allows headroom so a marginal
 *  overshoot becomes a usable draft (the user edits anyway) rather than a hard
 *  failure. Total output stays small regardless of project size. */
export const DOC_DRAFT_MAX_CHARS = 4000;

export const docDraftSchema = z.object({
  markdown: z.string().trim().min(1).max(DOC_DRAFT_MAX_CHARS),
});

export type ParsedDocDraft = z.infer<typeof docDraftSchema>;

// ── Claude tool (structured output) ──

export const DOC_DRAFT_TOOL_NAME = "write_documentation_draft";
export const DOC_DRAFT_TOOL_DESCRIPTION =
  "Return a concise Markdown documentation draft for the supplied artifact, grounded ONLY in the provided digest. The draft is advisory — a human reviews and saves it.";

export const docDraftToolInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    markdown: {
      type: "string",
      description:
        "The documentation draft as GitHub-flavored Markdown (~1200–1800 characters). Use only facts present in the digest; phrase anything unknown as an open question. No invented implementation details, no Mermaid, no marketing language.",
    },
  },
  required: ["markdown"],
  additionalProperties: false,
};
