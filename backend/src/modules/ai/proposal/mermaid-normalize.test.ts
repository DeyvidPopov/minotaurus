// mermaid-normalize.test.ts — pure-logic tests. Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMermaidSource } from "./mermaid-normalize.js";

test("strips classDef + inline ::: but keeps nodes and edges", () => {
  const input = [
    "flowchart TD",
    '  RP["Registration & Payments"]',
    '  PG["Payment Gateway"]',
    "  RP --> PG",
    "  PG:::external",
    "  classDef external fill:#f5f5f5,stroke:#999,stroke-dasharray:5 5",
  ].join("\n");
  const out = normalizeMermaidSource(input);
  assert.ok(!/classDef/.test(out), "classDef removed");
  assert.ok(!/:::/.test(out), "inline class removed");
  assert.ok(!/fill:|stroke:/.test(out), "no style props remain");
  assert.ok(out.includes("flowchart TD"));
  assert.ok(out.includes('RP["Registration & Payments"]'));
  assert.ok(out.includes('PG["Payment Gateway"]'));
  assert.ok(out.includes("RP --> PG"));
});

test("strips style, linkStyle, and %%{init}%% directives", () => {
  const input = [
    '%%{init: {"theme":"dark","themeVariables":{"primaryColor":"#fff"}}}%%',
    "flowchart LR",
    "  A --> B",
    "  style A fill:#fff,stroke:#000",
    "  linkStyle 0 stroke:#999,color:red",
  ].join("\n");
  const out = normalizeMermaidSource(input);
  assert.ok(!/%%\{/.test(out), "init directive removed");
  assert.ok(!/^\s*style\s/im.test(out), "style statement removed");
  assert.ok(!/linkStyle/.test(out), "linkStyle removed");
  assert.ok(out.includes("flowchart LR"));
  assert.ok(out.includes("A --> B"));
});

test("strips a flowchart `class X Y` assignment", () => {
  const out = normalizeMermaidSource("flowchart TD\n A --> B\n class A,B external");
  assert.ok(!/^\s*class\s/im.test(out), "class assignment removed");
  assert.ok(out.includes("A --> B"));
});

test("does NOT strip classDiagram `class Foo {` definitions (structure)", () => {
  const input = ["classDiagram", "  class Animal {", "    +int age", "  }"].join("\n");
  const out = normalizeMermaidSource(input);
  assert.ok(out.includes("class Animal {"), "classDiagram class kept");
  assert.ok(out.includes("+int age"));
});

test("preserves subgraphs and labeled edges", () => {
  const input = [
    "flowchart TD",
    "  subgraph Core",
    '    A["Auth"]',
    '    B["Users"]',
    "  end",
    "  B -->|uses| A",
  ].join("\n");
  const out = normalizeMermaidSource(input);
  assert.ok(out.includes("subgraph Core"));
  assert.ok(/^\s*end\s*$/m.test(out));
  assert.ok(out.includes("B -->|uses| A"));
});

test("is idempotent and leaves no styling behind", () => {
  const input = "flowchart TD\n A:::x --> B\n classDef x fill:#fff";
  const once = normalizeMermaidSource(input);
  const twice = normalizeMermaidSource(once);
  assert.equal(once, twice, "idempotent");
  assert.ok(!/classDef|:::/.test(once));
  assert.ok(once.includes("A --> B"));
});

test("handles empty / whitespace input", () => {
  assert.equal(normalizeMermaidSource(""), "");
  assert.equal(normalizeMermaidSource("   \n  \n"), "");
});
