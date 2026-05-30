// Export Engine V2 — diagram SVG preparation tests.

import test from "node:test";
import assert from "node:assert/strict";
import { prepareDiagramSvg, fitWidth } from "./diagram-svg.js";

const TEXT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect x="0" y="0" width="200" height="80"/><text x="10" y="40">Order Service</text></svg>';

test("accepts a valid text-based SVG and extracts size", () => {
  const p = prepareDiagramSvg(TEXT_SVG);
  assert.ok(p, "expected prepared SVG");
  assert.equal(p!.width, 200);
  assert.equal(p!.height, 80);
});

test("derives size from viewBox when width/height absent", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140"><text>x</text></svg>';
  const p = prepareDiagramSvg(svg);
  assert.ok(p);
  assert.equal(p!.width, 320);
  assert.equal(p!.height, 140);
});

test("rejects foreignObject SVG (pdfmake drops its text)", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><foreignObject x="0" y="0" width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml">label</div></foreignObject></svg>';
  assert.equal(prepareDiagramSvg(svg), null);
});

test("rejects scripts, empty, non-svg, and oversized input", () => {
  assert.equal(prepareDiagramSvg(null), null);
  assert.equal(prepareDiagramSvg(""), null);
  assert.equal(prepareDiagramSvg("not an svg"), null);
  assert.equal(prepareDiagramSvg('<svg><script>x</script></svg>'), null);
  assert.equal(prepareDiagramSvg('<svg width="1" height="1">' + "x".repeat(1_600_000) + "</svg>"), null);
});

test("fitWidth never upscales and never exceeds content width", () => {
  assert.equal(fitWidth({ svg: TEXT_SVG, width: 200, height: 80 }, 515), 200); // no upscale
  assert.equal(fitWidth({ svg: TEXT_SVG, width: 900, height: 400 }, 515), 515); // clamp
  assert.equal(fitWidth({ svg: TEXT_SVG }, 515), 515); // unknown size -> content width
});
