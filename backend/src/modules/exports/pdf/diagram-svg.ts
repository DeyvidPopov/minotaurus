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

  return { svg: rebuilt + body, width, height };
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
