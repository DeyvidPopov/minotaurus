import test from "node:test";
import assert from "node:assert/strict";
import { formatSchemaForExport } from "./format-schema.js";

test("pretty-prints valid JSON with 2-space indent", () => {
  assert.equal(
    formatSchemaForExport('{"a":1,"b":[2,3]}'),
    '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
  );
});

test("normalizes JSON whitespace deterministically", () => {
  assert.equal(formatSchemaForExport('{ "x" :  1 }'), '{\n  "x": 1\n}');
});

test("returns empty string for empty / whitespace / nullish input", () => {
  assert.equal(formatSchemaForExport(""), "");
  assert.equal(formatSchemaForExport("   "), "");
  assert.equal(formatSchemaForExport(null), "");
  assert.equal(formatSchemaForExport(undefined), "");
});

test("returns trimmed verbatim text for non-JSON input", () => {
  assert.equal(formatSchemaForExport("  free text schema  "), "free text schema");
});
