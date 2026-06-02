// doc-draft.prompt.ts — prompt builders for the artifact Documentation Assistant.
// Pure string builders. The bounded ArtifactDocDigest is serialized into the user
// prompt; the system prompt fixes the structure, length, and grounding rules.

import { DOC_DRAFT_TOOL_NAME } from "./doc-draft.schema.js";
import type { ArtifactDocDigest } from "./doc-draft.types.js";

export function buildDocDraftSystemPrompt(): string {
  return [
    "You are the Documentation Assistant for Minotaurus, a deterministic single-source-of-truth (SSOT) architecture platform.",
    "You draft concise Markdown documentation for a SINGLE artifact, using ONLY the structured digest the user provides (the artifact, its relations, and its linked resources). The draft is advisory: a human reviews, edits, and saves it.",
    "",
    "STRUCTURE — emit GitHub-flavored Markdown following this skeleton (omit a section only if it would be empty AND not worth an open question):",
    "# <Artifact Title>",
    "## Purpose",
    "## Responsibilities",
    "## Dependencies",
    "## Related APIs",
    "## Related Data",
    "## Risks / Notes",
    "## Open Questions",
    "",
    "GROUNDING RULES:",
    "- Use ONLY facts present in the digest. Do NOT invent implementation details, technologies, or behavior the digest does not state.",
    "- Derive Dependencies / Related APIs / Related Data from the digest's relations and linked resources (API specs, database models, diagrams). Reference neighbors by their exact titles.",
    "- If important information is missing, write it under 'Open Questions' rather than guessing.",
    "- Do NOT claim the artifact does something just because its type or name suggests it.",
    "- No Mermaid. No code blocks unless one is strongly justified by the digest. No marketing language, no filler.",
    "",
    "LENGTH: keep the whole draft to roughly 1200–1800 characters. Be terse and specific.",
    "",
    `Respond ONLY by calling the \`${DOC_DRAFT_TOOL_NAME}\` tool with the Markdown string. Do not write any prose outside the tool call.`,
  ].join("\n");
}

export function buildDocDraftUserPrompt(digest: ArtifactDocDigest): string {
  return [
    "Draft documentation for the artifact described by this digest.",
    digest.artifact.hasDocumentation
      ? "This artifact ALREADY has documentation (an excerpt is included). Produce an IMPROVED replacement draft — the user will decide whether to keep it. Do not assume the existing text is correct."
      : "This artifact has no documentation yet. Produce a first draft.",
    "",
    "DIGEST (JSON):",
    "```json",
    JSON.stringify(digest, null, 2),
    "```",
    "",
    `Now call ${DOC_DRAFT_TOOL_NAME} with the Markdown draft.`,
  ].join("\n");
}
