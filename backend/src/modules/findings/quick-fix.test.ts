import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENTATION_TEMPLATE,
  QUICK_FIX_IDS,
  STARTER_DIAGRAM,
  buildQuickFixPreview,
  getQuickFixDescriptor,
  getQuickFixIdForCode,
  quickFixContent,
  starterDiagramSupportsType,
} from "./quick-fix.js";
import { getFinding } from "./finding-catalog.js";

// ── code ↔ fix mapping ──

test("only MISSING_DOCUMENTATION and DIAGRAM_EMPTY map to a quick fix", () => {
  assert.equal(getQuickFixIdForCode("MISSING_DOCUMENTATION"), "GENERATE_DOCUMENTATION_TEMPLATE");
  assert.equal(getQuickFixIdForCode("DIAGRAM_EMPTY"), "GENERATE_STARTER_DIAGRAM");
  // explicitly NOT supported (per V1 safety constraints)
  for (const code of ["ORPHAN_ARTIFACT", "API_SPEC_NO_ENDPOINTS", "SECURITY_POLICY_NOT_LINKED", "DEPENDS_ON_DEPRECATED", "API_FIELD_UNMAPPED"]) {
    assert.equal(getQuickFixIdForCode(code), null, `${code} must NOT be quick-fixable in V1`);
  }
  assert.equal(getQuickFixIdForCode("NOT_A_CODE"), null);
});

test("every quick fix descriptor points back at a real catalog code", () => {
  for (const fixId of QUICK_FIX_IDS) {
    const d = getQuickFixDescriptor(fixId);
    assert.equal(d.fixId, fixId);
    assert.ok(getFinding(d.code), `${fixId}: ${d.code} must be a catalog code`);
    assert.equal(getQuickFixIdForCode(d.code), fixId, `${fixId}: round-trips through its code`);
    assert.ok(d.title.trim().length > 0 && d.description.trim().length > 0);
  }
});

// ── content is deterministic & matches the spec ──

test("documentation template is the fixed section skeleton", () => {
  const c = quickFixContent("GENERATE_DOCUMENTATION_TEMPLATE");
  assert.equal(c, DOCUMENTATION_TEMPLATE);
  for (const heading of ["# Purpose", "# Overview", "# Actors", "# Inputs", "# Outputs", "# Flow", "# Failure Scenarios", "# Security Considerations", "# Dependencies"]) {
    assert.ok(c.includes(heading), `missing ${heading}`);
  }
});

test("starter diagram is a valid graph (header + arrow) so it clears DIAGRAM_EMPTY without tripping DIAGRAM_INVALID", () => {
  const c = quickFixContent("GENERATE_STARTER_DIAGRAM");
  assert.equal(c, STARTER_DIAGRAM);
  assert.match(c, /^\s*graph\b/m); // satisfies the FLOWCHART/ARCHITECTURE header rule
  assert.match(c, /-->/); // satisfies the "has an arrow" rule
});

test("content is a pure function of the fixId — deep-equal across calls", () => {
  assert.equal(quickFixContent("GENERATE_DOCUMENTATION_TEMPLATE"), quickFixContent("GENERATE_DOCUMENTATION_TEMPLATE"));
  assert.equal(quickFixContent("GENERATE_STARTER_DIAGRAM"), quickFixContent("GENERATE_STARTER_DIAGRAM"));
});

test("buildQuickFixPreview returns descriptor + content", () => {
  const p = buildQuickFixPreview("GENERATE_DOCUMENTATION_TEMPLATE");
  assert.equal(p.fixId, "GENERATE_DOCUMENTATION_TEMPLATE");
  assert.equal(p.code, "MISSING_DOCUMENTATION");
  assert.equal(p.targetKind, "ARTIFACT");
  assert.equal(p.contentKind, "markdown");
  assert.equal(p.content, DOCUMENTATION_TEMPLATE);
});

// ── starter-diagram type guard ──

test("starter diagram only applies to graph-headed diagram types", () => {
  assert.ok(starterDiagramSupportsType("FLOWCHART"));
  assert.ok(starterDiagramSupportsType("ARCHITECTURE"));
  for (const t of ["SEQUENCE", "ERD", "CLASS", "STATE", "GANTT"]) {
    assert.equal(starterDiagramSupportsType(t), false, `${t} needs a type-specific starter (out of V1 scope)`);
  }
});
