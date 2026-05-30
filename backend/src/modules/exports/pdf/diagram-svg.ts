// Export Engine V2 — diagram SVG normalization for pdfmake embedding.
//
// Mermaid renders only in a browser DOM, so diagram SVG is captured client-side
// at export-create time and frozen into the snapshot (deterministic: the PDF is
// a pure function of stored bytes). This module normalizes that stored SVG so
// pdfmake embeds it at the correct size, and decides whether it is safe to
// embed at all.
//
// Two verified pitfalls this guards against:
//
//  1. SIZE MIS-MEASUREMENT. pdfmake's SVGMeasure reads the first non-percentage
//     `width="…"` it finds anywhere in the document. Mermaid v10 emits the root
//     as `width="100%"` (skipped) so the regex instead matches a child
//     `<rect width="100">` — the whole diagram is then measured as a single
//     node (~100×32) and renders compressed. Fix: rewrite the root <svg> with
//     explicit numeric width/height (from the viewBox) and strip width="100%" /
//     style="max-width". Then SVGMeasure reads the real size first.
//
//  2. <foreignObject> TEXT IS DROPPED by pdfmake. Mermaid must be captured with
//     htmlLabels:false (native <text>); foreignObject SVG is rejected here so
//     the caller falls back to the Mermaid source block — never a textless box.

export interface NormalizedSvg {
  svg: string;
  width: number;
  height: number;
}

const MAX_SVG_BYTES = 1_500_000; // guard against pathological payloads

/**
 * Validate and normalize captured Mermaid SVG for embedding. Returns null when
 * the SVG is missing, malformed, oversized, unsafe, uses <foreignObject>, or
 * has no derivable dimensions — the caller then falls back to the source block.
 */
export function normalizeMermaidSvgForPdf(raw: string | null | undefined): NormalizedSvg | null {
  if (!raw || typeof raw !== "string") return null;
  const input = raw.trim();
  if (!input || input.length > MAX_SVG_BYTES) return null;

  const open = input.indexOf("<svg");
  if (open === -1 || !/<\/svg>\s*$/.test(input)) return null;

  // pdfmake cannot render <foreignObject> HTML labels, and <script> is unsafe
  // and never part of Mermaid's static label output.
  if (/<foreignObject[\s>]/i.test(input)) return null;
  if (/<script[\s>]/i.test(input)) return null;

  // Isolate the opening <svg …> tag.
  const tagEnd = input.indexOf(">", open);
  if (tagEnd === -1) return null;
  const openTag = input.slice(open, tagEnd + 1);
  const body = input.slice(tagEnd + 1); // includes the trailing </svg>

  const dims = deriveDimensions(openTag);
  if (!dims) return null;
  const { width, height, viewBox } = dims;

  // Rebuild the root tag: keep semantic attributes (xmlns*, etc.), drop the ones
  // that break measurement (width/height/style/preserveAspectRatio), then set
  // explicit, deterministic values.
  const kept = stripAttributes(openTag, ["width", "height", "style", "preserveaspectratio", "viewbox"]);
  const rebuilt =
    `<svg ${kept} viewBox="${viewBox}" width="${width}" height="${height}" ` +
    `preserveAspectRatio="xMidYMid meet">`;

  const printBody = recolorForPrint(body);

  return { svg: rebuilt + printBody, width, height };
}

// ────────────────────────────── contrast normalization ──────────────────────────────
//
// The frontend captures Mermaid with a DARK UI theme (dark node fills, light
// text), which is washed out on a white PDF page. svg-to-pdfkit resolves color
// from `<style>` before the presentation attribute but has NO `!important` and
// uses specificity — Mermaid's own id-scoped rules (e.g. `#id .node rect`) beat
// any injected plain-class rule, and shapes with no fill attribute fall through
// to black. So CSS injection is unreliable here (verified empirically).
//
// Instead we rewrite the SVG at the string level:
//   1. delete Mermaid's <style> block (its dark theme + high-specificity rules),
//   2. remap dark theme fills/strokes/text colors to the report palette,
//   3. give shape elements that have NO fill/stroke an explicit readable one so
//      they don't inherit black.
// This produces exact, deterministic PDF colors (proven via content-stream ops).

const PRINT = {
  text: "#0f172a",
  nodeFill: "#f8fafc",
  nodeBorder: "#334155",
  edge: "#475569",
  white: "#ffffff",
} as const;

// Dark-theme colors the frontend bakes in (mermaid-preview themeVariables +
// forceLabelVisibility), mapped to print-readable equivalents. Case-insensitive.
const COLOR_REMAP: Array<[RegExp, string]> = [
  // Light text on dark UI -> dark text on white.
  [/#e6e8ec/gi, PRINT.text],
  // Node/cluster dark fills -> light fill.
  [/#1a1d24/gi, PRINT.nodeFill],
  [/#15171c/gi, PRINT.nodeFill],
  [/#0e1014/gi, PRINT.white],
  [/#111318/gi, PRINT.nodeFill],
  // Borders -> readable border.
  [/#2a2e36/gi, PRINT.nodeBorder],
  [/#3a3f48/gi, PRINT.nodeBorder],
  // Edges / lines -> readable edge.
  [/#9aa3ad/gi, PRINT.edge],
  [/#5f8fb8/gi, PRINT.nodeBorder],
];

function recolorForPrint(body: string): string {
  let out = body;

  // 1. Remove Mermaid's <style> blocks entirely (dark theme + id-specificity).
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // 1b. Strip invalid stroke-dasharray values. Mermaid emits dasharrays like
  //     "1, 0" on solid edges/markers; pdfkit's dash() throws on a zero/negative
  //     length ("lengths must be numeric and greater than zero"), aborting the
  //     whole render. Drop any dasharray that isn't all-positive — those edges
  //     simply render solid, which is what we want on print anyway.
  out = stripInvalidDashArrays(out);

  // 2. Remap known dark-theme colors wherever they appear (attributes or
  //    leftover inline styles) to the print palette.
  for (const [re, to] of COLOR_REMAP) out = out.replace(re, to);

  // 3. Center single-line labels on their node. Mermaid wraps each node label in
  //    <g class="label" transform="translate(x, y)"> containing a single
  //    <tspan dy="1em" x="0">, and relies on the browser to (a) offset the group
  //    by the measured text size and (b) apply text-anchor:middle via its
  //    <style> block. We strip that style for contrast and svg-to-pdfkit does no
  //    text measurement, so labels anchor at the node origin and overflow right,
  //    sitting too low. A node group's origin IS the geometric center of its
  //    shape, so for a single-line label we pin the label group to that origin
  //    (translate(0,0)), drop the tspan dy, force tspan x="0", and set
  //    text-anchor="middle" + dominant-baseline="central" — exact centering,
  //    independent of font metrics. Multi-line labels (ER rows, class members)
  //    are left untouched so their per-line dy/x spacing survives.
  out = out.replace(/<g class="label"([^>]*)>([\s\S]*?)<\/g>/gi, (m, gAttrs: string, inner: string) => {
    if ((inner.match(/<tspan\b/gi) || []).length !== 1) return m; // only single-line
    const g = gAttrs.replace(/translate\(\s*[\d.-]+\s*,\s*[\d.-]+\s*\)/i, "translate(0, 0)");
    let body = inner.replace(/(<tspan\b[^>]*?)\s+dy="[^"]*"/i, "$1");
    // Anchor the tspan at x=0 (node center).
    body = body.replace(/<tspan\b([^>]*?)>/i, (_t, ta: string) =>
      `<tspan${setAttr(removeAttr(ta, "x"), "x", "0")}>`,
    );
    // Center the text horizontally + vertically on the origin.
    body = body.replace(/<text\b([^>]*?)>/i, (_t, ta: string) => {
      let a = ta;
      if (!/text-anchor/i.test(a)) a = setAttr(a, "text-anchor", "middle");
      if (!/dominant-baseline/i.test(a)) a = setAttr(a, "dominant-baseline", "central");
      return `<text${a}>`;
    });
    return `<g class="label"${g}>${body}</g>`;
  });

  // 4. Force readable dark fill on all label text (after centering).
  out = out.replace(/(<text\b)([^>]*?)>/gi, (_m, head: string, attrs: string) => {
    return `${head}${setAttr(removeAttr(attrs, "fill"), "fill", PRINT.text)}>`;
  });
  out = out.replace(/(<tspan\b)([^>]*?)>/gi, (_m, head: string, attrs: string) => {
    return `${head}${setAttr(removeAttr(attrs, "fill"), "fill", PRINT.text)}>`;
  });

  // 5. Shape elements (rect/polygon/circle/ellipse/path) with NO fill attribute
  //    would render black in pdfmake. Give nodes a light fill + border; give
  //    edge paths a stroke. Heuristic by class, defaulting safely.
  out = out.replace(/<(rect|polygon|circle|ellipse|path)\b([^>]*?)(\/?)>/gi, (_m, tag: string, attrs: string, selfClose: string) => {
    const cls = (/(?:^|\s)class\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || "").toLowerCase();
    const isEdge = /(edgepath|flowchart-link|link|relation|messageline|transition)/.test(cls);
    const isArrow = /(arrowhead|marker)/.test(cls) || /marker-end|marker-start/.test(attrs);
    let a = attrs;
    if (isEdge) {
      a = setAttr(removeAttr(a, "stroke"), "stroke", PRINT.edge);
      if (!hasAttr(a, "fill")) a = setAttr(a, "fill", "none");
    } else if (isArrow) {
      a = setAttr(removeAttr(a, "fill"), "fill", PRINT.edge);
      a = setAttr(removeAttr(a, "stroke"), "stroke", PRINT.edge);
    } else if (tag === "rect" && !hasAttr(a, "width")) {
      // A <rect> with no width is a LABEL-BACKGROUND placeholder, not a node.
      // Mermaid wraps edge/node labels in <g class="label"> with an unsized
      // <rect> that the browser grows to the measured text; svg-to-pdfkit does
      // no such measurement, so giving it a fill/border drew a small empty box
      // beside every label ("yes []", "places []", etc). Leave it invisible.
      a = setAttr(removeAttr(a, "fill"), "fill", "none");
      a = removeAttr(a, "stroke");
    } else {
      // Node-ish shape (rect, polygon, ellipse, circle, or a container path such
      // as a database cylinder): light fill + dark border, same as rectangles.
      // (Edge/arrow paths were already handled above, so a path here is a node
      // container — it must NOT be filled with the dark border color.)
      if (!hasAttr(a, "fill") || isDarkOrBlack(getAttr(a, "fill"))) {
        a = setAttr(removeAttr(a, "fill"), "fill", PRINT.nodeFill);
      }
      if (!hasAttr(a, "stroke") || isDarkOrBlack(getAttr(a, "stroke"))) {
        a = setAttr(removeAttr(a, "stroke"), "stroke", PRINT.nodeBorder);
      }
    }
    return `<${tag}${a}${selfClose}>`;
  });

  return out;
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*=`, "i").test(attrs);
}
function getAttr(attrs: string, name: string): string {
  return new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs)?.[1] ?? "";
}
function removeAttr(attrs: string, name: string): string {
  return attrs.replace(new RegExp(`\\s*\\b${name}\\s*=\\s*"[^"]*"`, "gi"), "");
}
function setAttr(attrs: string, name: string, value: string): string {
  const sep = attrs.length && !attrs.startsWith(" ") ? " " : "";
  return `${attrs}${sep} ${name}="${value}"`;
}
function isDarkOrBlack(color: string): boolean {
  const c = color.trim().toLowerCase();
  if (!c || c === "none") return false;
  if (c === "black" || c === "#000" || c === "#000000" || c === "rgb(0,0,0)") return true;
  const hex = /^#([0-9a-f]{6})$/.exec(c);
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16);
    const g = parseInt(hex[1].slice(2, 4), 16);
    const b = parseInt(hex[1].slice(4, 6), 16);
    // Treat as "dark" if luminance is low (would be unreadable on white).
    return 0.299 * r + 0.587 * g + 0.114 * b < 90;
  }
  return false;
}

/** True when every entry of a dasharray value is a finite number > 0. */
function dashArrayIsValid(value: string): boolean {
  const parts = value.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isFinite(n) && n > 0;
  });
}

/**
 * Remove stroke-dasharray declarations whose values aren't strictly positive.
 * pdfkit's dash() throws on a zero/negative length, which aborts the whole PDF
 * render. Covers both the `stroke-dasharray="…"` attribute and the
 * `style="…stroke-dasharray:…"` inline form. Affected edges render solid.
 */
function stripInvalidDashArrays(svg: string): string {
  let out = svg;
  // Attribute form: stroke-dasharray="1, 0"
  out = out.replace(/\sstroke-dasharray\s*=\s*"([^"]*)"/gi, (m, v: string) =>
    dashArrayIsValid(v) ? m : "",
  );
  out = out.replace(/\sstroke-dasharray\s*=\s*'([^']*)'/gi, (m, v: string) =>
    dashArrayIsValid(v) ? m : "",
  );
  // Inline-style form: style="…; stroke-dasharray: 1, 0; …"
  out = out.replace(/stroke-dasharray\s*:\s*([^;"']*)\s*;?/gi, (m, v: string) =>
    dashArrayIsValid(v) ? m : "",
  );
  return out;
}

/**
 * Derive intrinsic width/height + a viewBox string from the root tag.
 * Priority: viewBox (most reliable for Mermaid) → numeric width/height.
 * Percentage widths/heights are ignored. Returns null when nothing usable.
 */
function deriveDimensions(openTag: string): { width: number; height: number; viewBox: string } | null {
  const vb = /viewBox\s*=\s*"\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.]+)\s+([\d.]+)\s*"/i.exec(openTag);
  if (vb) {
    const w = Number(vb[3]);
    const h = Number(vb[4]);
    if (w > 0 && h > 0) {
      return { width: round(w), height: round(h), viewBox: `${vb[1]} ${vb[2]} ${vb[3]} ${vb[4]}` };
    }
  }
  // Fall back to explicit numeric width/height (px or unitless; never %).
  const w = numericAttr(openTag, "width");
  const h = numericAttr(openTag, "height");
  if (w && h) {
    return { width: round(w), height: round(h), viewBox: `0 0 ${w} ${h}` };
  }
  return null;
}

function numericAttr(tag: string, name: string): number | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([\\d.]+)(px)?"`, "i").exec(tag);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/** Remove the named attributes (case-insensitive) from a tag's attribute list. */
function stripAttributes(openTag: string, names: string[]): string {
  // Inner attribute string, without "<svg" and trailing ">".
  let attrs = openTag.replace(/^<svg/i, "").replace(/>$/, "");
  for (const name of names) {
    attrs = attrs.replace(new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`, "gi"), "");
    attrs = attrs.replace(new RegExp(`\\s${name}\\s*=\\s*'[^']*'`, "gi"), "");
  }
  return attrs.trim();
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface FitResult {
  width: number;
  height: number;
}

/**
 * Fit a normalized diagram into the page: scale to the full content width, but
 * never let the height exceed `maxHeight` (scale by height instead). Upscales
 * small diagrams to content width and downscales large ones — always preserving
 * aspect ratio. Deterministic.
 */
export function fitDiagram(
  intrinsicWidth: number,
  intrinsicHeight: number,
  contentWidth: number,
  maxHeight: number,
): FitResult {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
    return { width: contentWidth, height: Math.min(maxHeight, contentWidth) };
  }
  let width = contentWidth;
  let height = (intrinsicHeight / intrinsicWidth) * width;
  if (height > maxHeight) {
    height = maxHeight;
    width = (intrinsicWidth / intrinsicHeight) * height;
  }
  return { width: round(width), height: round(height) };
}
