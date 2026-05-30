// Export Engine V2 — diagram SVG normalization tests.

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMermaidSvgForPdf, fitDiagram } from "./diagram-svg.js";

const TEXT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect x="0" y="0" width="200" height="80"/><text x="10" y="40">Order Service</text></svg>';

test("normalizes a valid text-based SVG and reports size", () => {
  const n = normalizeMermaidSvgForPdf(TEXT_SVG);
  assert.ok(n, "expected normalized SVG");
  assert.equal(n!.width, 200);
  assert.equal(n!.height, 80);
  assert.match(n!.svg, /viewBox="0 0 200 80"/);
  assert.match(n!.svg, /preserveAspectRatio="xMidYMid meet"/);
});

test("derives size from viewBox and prefers it over child widths", () => {
  // Mimics real Mermaid: root width="100%" + a child rect width="100".
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 880px;" viewBox="0 0 880 612"><g class="node"><rect width="100" height="32"/><text>API Gateway</text></g></svg>';
  const n = normalizeMermaidSvgForPdf(svg);
  assert.ok(n);
  assert.equal(n!.width, 880, "must use viewBox, not the child rect width");
  assert.equal(n!.height, 612);
  // Root width="100%" and max-width style must be stripped so pdfmake measures correctly.
  assert.doesNotMatch(n!.svg, /width="100%"/);
  assert.doesNotMatch(n!.svg, /max-width/);
  assert.match(n!.svg, /width="880"/);
  assert.match(n!.svg, /height="612"/);
  // xmlns must survive.
  assert.match(n!.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("synthesizes a viewBox from numeric width/height when none present", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><text>x</text></svg>';
  const n = normalizeMermaidSvgForPdf(svg);
  assert.ok(n);
  assert.match(n!.svg, /viewBox="0 0 300 150"/);
});

test("rejects foreignObject, scripts, empty, non-svg, oversized, and dimensionless", () => {
  assert.equal(normalizeMermaidSvgForPdf(null), null);
  assert.equal(normalizeMermaidSvgForPdf(""), null);
  assert.equal(normalizeMermaidSvgForPdf("not an svg"), null);
  assert.equal(
    normalizeMermaidSvgForPdf(
      '<svg width="10" height="10"><foreignObject x="0" y="0" width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>',
    ),
    null,
  );
  assert.equal(normalizeMermaidSvgForPdf('<svg width="1" height="1"><script>x</script></svg>'), null);
  assert.equal(normalizeMermaidSvgForPdf('<svg width="1" height="1">' + "x".repeat(1_600_000) + "</svg>"), null);
  // Only a percentage width and no viewBox -> no derivable size.
  assert.equal(normalizeMermaidSvgForPdf('<svg xmlns="http://www.w3.org/2000/svg" width="100%"><text>x</text></svg>'), null);
});

test("fitDiagram upscales to content width and preserves aspect ratio", () => {
  const r = fitDiagram(200, 100, 497, 560); // small, wide
  assert.equal(r.width, 497);
  assert.equal(r.height, 248.5); // 497 * (100/200)
});

test("fitDiagram clamps by height for very tall diagrams", () => {
  const r = fitDiagram(400, 1200, 497, 560); // tall
  assert.equal(r.height, 560);
  assert.ok(r.width < 497, "tall diagram must be width-constrained by height cap");
  assert.equal(r.width, Math.round((400 / 1200) * 560 * 100) / 100);
});

test("fitDiagram is deterministic for the seeded 8-node flowchart shape", () => {
  // Same inputs must always yield the same dimensions.
  const a = fitDiagram(900, 620, 497, 560);
  const b = fitDiagram(900, 620, 497, 560);
  assert.deepEqual(a, b);
});
