// Export Engine V2 — diagram SVG preparation for pdfmake embedding.
//
// Mermaid renders only in a browser DOM, so diagram SVG is captured client-side
// at export-create time and frozen into the snapshot (deterministic: the PDF is
// a pure function of stored bytes). This module prepares that stored SVG for
// pdfmake's `svg` node and decides whether it is safe to embed.
//
// Hard limitation (verified): pdfmake silently drops <foreignObject> text, so
// only native <text>-based SVG renders correctly. We reject foreignObject SVG
// and fall back to the Mermaid source block — never a textless diagram.

export interface PreparedSvg {
  svg: string;
  /** Intrinsic width/height in px, when derivable — used to fit-to-width. */
  width?: number;
  height?: number;
}

const MAX_SVG_BYTES = 1_500_000; // guard against pathological payloads

/**
 * Validate and normalize captured SVG for embedding. Returns null when the SVG
 * is missing, malformed, oversized, or uses <foreignObject> (whose text pdfmake
 * cannot render) — the caller then falls back to the source block.
 */
export function prepareDiagramSvg(raw: string | null | undefined): PreparedSvg | null {
  if (!raw || typeof raw !== "string") return null;
  const svg = raw.trim();
  if (!svg) return null;
  if (svg.length > MAX_SVG_BYTES) return null;

  // Must look like a single SVG document.
  const open = svg.indexOf("<svg");
  if (open === -1 || !/<\/svg>\s*$/.test(svg)) return null;

  // pdfmake cannot render <foreignObject> HTML labels — text would be dropped.
  if (/<foreignObject[\s>]/i.test(svg)) return null;

  // Strip anything that could carry non-deterministic or unsafe content. These
  // never appear in Mermaid's static label output and only add risk/noise.
  if (/<script[\s>]/i.test(svg)) return null;

  const { width, height } = extractSize(svg.slice(open));
  return { svg, width, height };
}

/**
 * Derive intrinsic px dimensions from width/height attributes or the viewBox.
 * Returns undefined dimensions when not derivable (pdfmake then uses its own
 * fit), so this is best-effort, not required.
 */
function extractSize(svgTag: string): { width?: number; height?: number } {
  const head = svgTag.slice(0, 600); // attributes live in the opening tag
  const wAttr = /\swidth\s*=\s*"([\d.]+)(px)?"/i.exec(head);
  const hAttr = /\sheight\s*=\s*"([\d.]+)(px)?"/i.exec(head);
  if (wAttr && hAttr) {
    const w = Number(wAttr[1]);
    const h = Number(hAttr[1]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  const vb = /viewBox\s*=\s*"\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*"/i.exec(head);
  if (vb) {
    const w = Number(vb[1]);
    const h = Number(vb[2]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  return {};
}

/**
 * Compute the display width (pt) for an embedded diagram: never upscale beyond
 * intrinsic size, never exceed the available content width. Deterministic.
 */
export function fitWidth(prepared: PreparedSvg, contentWidth: number): number {
  if (!prepared.width) return contentWidth;
  return Math.min(prepared.width, contentWidth);
}
