import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchTerm } from "./list-filter.js";

test("normalizeSearchTerm prefers the first truthy value, then lowercases + trims", () => {
  assert.equal(normalizeSearchTerm("  Patient ", undefined), "patient");
  assert.equal(normalizeSearchTerm(undefined, " FOO "), "foo");
  // An empty `search` falls through to `q`, matching `search || q`.
  assert.equal(normalizeSearchTerm("", "bar"), "bar");
  assert.equal(normalizeSearchTerm(undefined, undefined), "");
  assert.equal(normalizeSearchTerm("", ""), "");
});

test("normalizeSearchTerm is byte-equivalent to the legacy expression", () => {
  const legacy = (search?: string, q?: string) => (search || q || "").toLowerCase().trim();
  const cases: [string | undefined, string | undefined][] = [
    ["A", "B"],
    ["", "B"],
    [undefined, "Q"],
    ["S", ""],
    [undefined, undefined],
    ["  Mixed Case ", undefined],
    ["", ""],
  ];
  for (const [s, q] of cases) {
    assert.equal(normalizeSearchTerm(s, q), legacy(s, q));
  }
});
