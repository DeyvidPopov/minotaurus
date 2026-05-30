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

// ── contrast normalization ──

const DARK_CAPTURED =
  '<svg viewBox="0 0 200 80" style="max-width:200px" xmlns="http://www.w3.org/2000/svg" width="100%" id="mmd">' +
  '<style>#mmd .node rect{fill:#1a1d24;stroke:#2a2e36;}#mmd .flowchart-link{stroke:#9aa3ad;}</style>' +
  '<g class="edgePaths"><path class="edgePath flowchart-link" d="M10,10 L50,50" fill="none"/></g>' +
  '<g class="node"><rect x="10" y="10" width="180" height="60"/><text fill="#e6e8ec" x="100" y="44">API Gateway</text></g>' +
  "</svg>";

test("strips Mermaid <style> block", () => {
  const n = normalizeMermaidSvgForPdf(DARK_CAPTURED);
  assert.ok(n);
  assert.doesNotMatch(n!.svg, /<style/i, "dark-theme style block must be removed");
});

test("remaps dark theme colors to the print palette", () => {
  const n = normalizeMermaidSvgForPdf(DARK_CAPTURED)!;
  // Dark fills/text/edges gone.
  assert.doesNotMatch(n.svg, /#1a1d24/i, "dark node fill must be remapped");
  assert.doesNotMatch(n.svg, /#e6e8ec/i, "light text must be remapped");
  assert.doesNotMatch(n.svg, /#9aa3ad/i, "faint edge must be remapped");
  // Print palette present.
  assert.match(n.svg, /#0f172a/i, "dark readable text expected");
  assert.match(n.svg, /#334155/i, "node border expected");
});

test("text elements get a dark readable fill", () => {
  const n = normalizeMermaidSvgForPdf(DARK_CAPTURED)!;
  const textTag = /<text\b[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(textTag, /fill="#0f172a"/i, "text must be dark");
});

test("node rect without a fill gets a light fill + border (not black)", () => {
  const svg =
    '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
    '<g class="node"><rect x="0" y="0" width="100" height="50"/><text>X</text></g></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  const rectTag = /<rect\b[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(rectTag, /fill="#f8fafc"/i, "node fill must be light");
  assert.match(rectTag, /stroke="#334155"/i, "node border must be visible");
});

test("edge paths get a visible stroke and stay unfilled", () => {
  const n = normalizeMermaidSvgForPdf(DARK_CAPTURED)!;
  const edge = /<path\b[^>]*class="[^"]*flowchart-link[^"]*"[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(edge, /stroke="#475569"/i, "edge stroke must be visible");
  assert.match(edge, /fill="none"/i, "edge must remain unfilled");
});

// Sequence-diagram lifelines: faint grey, ultra-thin, with an overriding inline
// style — must become visible (the reported "lines are not seeable" bug).
const SEQ_LIFELINE =
  '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
  '<line id="actor10" x1="75" y1="5" x2="75" y2="190" name="User" stroke="#999" stroke-width="0.5px" style="stroke: grey; stroke-width: 0.5px;"></line>' +
  '<text fill="#999" x="75" y="200">User</text></svg>';

test("sequence lifeline becomes a visible stroke with a usable width", () => {
  const n = normalizeMermaidSvgForPdf(SEQ_LIFELINE)!;
  const line = /<line\b[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(line, /stroke="#94a3b8"/i, "lifeline must get a visible stroke");
  assert.match(line, /stroke-width="1"/i, "lifeline must get a usable width");
  assert.doesNotMatch(line, /stroke:\s*grey/i, "overriding inline-style stroke must be stripped");
  assert.doesNotMatch(line, /#999/i, "faint grey must be gone from the lifeline");
});

test("no faint #999 / grey strokes survive anywhere", () => {
  const n = normalizeMermaidSvgForPdf(SEQ_LIFELINE)!;
  assert.doesNotMatch(n.svg, /#999\b/i, "no #999 anywhere");
  assert.doesNotMatch(n.svg, /stroke:\s*gr[ae]y/i, "no grey-keyword strokes anywhere");
});

test("label-background rect (no width) is NOT drawn as a box next to the label", () => {
  // Mermaid edge labels are <g class="edgeLabel"><g class="label"><rect/><text/>.
  // The unsized <rect> is a text background the browser grows; in PDF it must
  // stay invisible, not become a small bordered box beside "yes"/"places"/etc.
  const svg =
    '<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" width="200" height="80">' +
    '<g class="edgeLabels"><g class="edgeLabel"><g class="label" transform="translate(0,0)">' +
    "<rect></rect><text><tspan x=\"0\">yes</tspan></text></g></g></g></svg>";
  const n = normalizeMermaidSvgForPdf(svg)!;
  const rectTag = /<rect\b[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(rectTag, /fill="none"/i, "label-bg rect must be transparent");
  assert.doesNotMatch(rectTag, /stroke=/i, "label-bg rect must have no border");
});

test("a SIZED rect inside <g class=label> stays invisible (edge-label background)", () => {
  // In some captures the edge-label background rect IS sized (e.g. 19x20), so a
  // no-width guard misses it. Any rect inside a label group is a text bg.
  const svg =
    '<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" width="200" height="80">' +
    '<g class="edgeLabel"><g class="label" transform="translate(0,0)">' +
    '<rect rx="0" ry="0" width="19.2" height="20.8"></rect>' +
    '<text><tspan x="0">yes</tspan></text></g></g></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  const rectTag = /<rect\b[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(rectTag, /fill="none"/i, "sized label-bg rect must be transparent");
  assert.match(rectTag, /stroke="none"/i, "sized label-bg rect must have no visible border");
  assert.doesNotMatch(rectTag, /#f8fafc/i, "must not be filled like a node");
  // and the label is centered
  assert.match(n.svg, /<text[^>]*text-anchor="middle"/i);
});

test("a node rect WITH width still gets a light fill + border", () => {
  // Guard the boundary: the width check must not strip real node containers.
  const svg =
    '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
    '<g class="node"><rect class="label-container" x="0" y="0" width="100" height="50"/><text>X</text></g></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  const rectTag = /<rect\b[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(rectTag, /fill="#f8fafc"/i, "sized node rect must keep its light fill");
  assert.match(rectTag, /stroke="#334155"/i, "sized node rect must keep its border");
});

test("database cylinder (container path) gets a LIGHT fill, not the dark border color", () => {
  // Mermaid renders DB cylinders as <path class="basic label-container">.
  const svg =
    '<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
    '<g class="node"><path class="basic label-container" d="M0,5 a30,5 0 0,0 60,0 a30,5 0 0,0 -60,0 l0,40 a30,5 0 0,0 60,0 l0,-40"/>' +
    '<text>User Database</text></g></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  const pathTag = /<path\b[^>]*class="[^"]*label-container[^"]*"[^>]*>/i.exec(n.svg)?.[0] ?? "";
  assert.match(pathTag, /fill="#f8fafc"/i, "cylinder must use the light node fill");
  assert.doesNotMatch(pathTag, /fill="#334155"/i, "cylinder must not be filled with the dark border color");
  assert.match(pathTag, /stroke="#334155"/i, "cylinder border must be visible");
});

// Mermaid's native single-line node-label idiom — what the centering targets.
const MERMAID_LABEL =
  '<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" width="200" height="80">' +
  '<g class="node" transform="translate(100, 40)"><rect class="label-container" x="-60" y="-20" width="120" height="40"/>' +
  '<g class="label" transform="translate(0, -10.4)"><text><tspan dy="1em" x="0">API Gateway</tspan></text></g></g></svg>';

test("centers a single-line label: pins group to origin, anchors middle + central, drops dy", () => {
  const n = normalizeMermaidSvgForPdf(MERMAID_LABEL)!;
  assert.match(n.svg, /<g class="label"[^>]*transform="translate\(0, 0\)"/i, "label group must sit on the node origin");
  assert.doesNotMatch(n.svg, /dy="1em"/i, "single-line tspan dy must be dropped");
  assert.match(n.svg, /<text[^>]*text-anchor="middle"/i, "text must be horizontally centered");
  assert.match(n.svg, /<text[^>]*dominant-baseline="central"/i, "text must be vertically centered");
  assert.match(n.svg, /<tspan[^>]*\bx="0"/i, "tspan must be anchored at the node center (x=0)");
  assert.match(n.svg, /<text[^>]*fill="#0f172a"/i, "label must stay dark");
});

test("does NOT collapse multi-line labels (preserves per-line dy spacing)", () => {
  const svg =
    '<svg viewBox="0 0 200 90" xmlns="http://www.w3.org/2000/svg" width="200" height="90">' +
    '<g class="label" transform="translate(0, -14)"><text>' +
    '<tspan dy="1em" x="0">Line one</tspan><tspan dy="1.1em" x="0">Line two</tspan></text></g></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  assert.match(n.svg, /dy="1em"/i, "multi-line dy must be preserved");
  assert.match(n.svg, /dy="1.1em"/i, "multi-line dy must be preserved");
  assert.doesNotMatch(n.svg, /dominant-baseline="central"/i, "multi-line labels must not be re-centered");
});

test("recoloring is deterministic", () => {
  const a = normalizeMermaidSvgForPdf(DARK_CAPTURED)!.svg;
  const b = normalizeMermaidSvgForPdf(DARK_CAPTURED)!.svg;
  assert.equal(a, b);
});

// ── invalid stroke-dasharray (pdfkit dash() crash) ──

test("strips a zero-valued stroke-dasharray attribute (pdfkit would crash)", () => {
  const svg =
    '<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
    '<path class="flowchart-link" stroke-dasharray="1, 0" d="M10,10 L50,50" fill="none"/></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  assert.doesNotMatch(n.svg, /stroke-dasharray/i, "invalid dasharray must be removed");
});

test("strips a zero stroke-dasharray in inline style form", () => {
  const svg =
    '<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
    '<path class="flowchart-link" style="stroke-dasharray:0;stroke:#999" d="M10,10 L50,50"/></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  assert.doesNotMatch(n.svg, /stroke-dasharray/i, "invalid inline dasharray must be removed");
});

test("keeps a valid positive stroke-dasharray", () => {
  const svg =
    '<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
    '<path class="flowchart-link" stroke-dasharray="4 2" d="M10,10 L50,50" fill="none"/></svg>';
  const n = normalizeMermaidSvgForPdf(svg)!;
  assert.match(n.svg, /stroke-dasharray="4 2"/i, "valid dasharray must be preserved");
});
