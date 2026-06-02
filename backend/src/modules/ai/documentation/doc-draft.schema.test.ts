// doc-draft.schema.test.ts — the output contract for an AI documentation draft.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { DOC_DRAFT_MAX_CHARS, docDraftSchema, docDraftToolInputSchema } from "./doc-draft.schema.js";

test("accepts a well-formed Markdown draft and trims it", () => {
  const parsed = docDraftSchema.safeParse({ markdown: "  # Player Management\n\n## Purpose\nOwns players.  " });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.ok(parsed.data.markdown.startsWith("# Player Management"));
    assert.ok(!parsed.data.markdown.endsWith(" "));
  }
});

test("rejects empty / missing markdown", () => {
  assert.equal(docDraftSchema.safeParse({ markdown: "" }).success, false);
  assert.equal(docDraftSchema.safeParse({ markdown: "   " }).success, false);
  assert.equal(docDraftSchema.safeParse({}).success, false);
});

test("rejects markdown beyond the max-char gate", () => {
  const tooLong = "x".repeat(DOC_DRAFT_MAX_CHARS + 1);
  assert.equal(docDraftSchema.safeParse({ markdown: tooLong }).success, false);
});

test("tool input schema requires exactly the markdown property", () => {
  assert.equal(docDraftToolInputSchema.type, "object");
  assert.deepEqual(docDraftToolInputSchema.required, ["markdown"]);
  assert.equal(docDraftToolInputSchema.additionalProperties, false);
  const props = docDraftToolInputSchema.properties as Record<string, { type: string }>;
  assert.equal(props.markdown.type, "string");
});
