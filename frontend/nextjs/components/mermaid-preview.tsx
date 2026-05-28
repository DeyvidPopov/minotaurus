// components/mermaid-preview.tsx — safe client-side Mermaid renderer
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Concrete font stack — Mermaid bakes this string straight into SVG
// `font-family` attributes / inline styles, where `var(...)` does not resolve
// reliably. Use real font names so the browser can pick a real glyph and
// labels are not rendered invisibly.
const MERMAID_FONT =
  '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

// Explicit high-contrast palette so node text, edge labels, and ERD attributes
// stay readable on the platform's dark card background regardless of Mermaid's
// "dark" preset shifting between versions.
const MERMAID_THEME_VARIABLES = {
  // Backgrounds
  background: "#0e1014",
  mainBkg: "#1a1d24",
  secondBkg: "#1a1d24",
  tertiaryColor: "#1a1d24",
  // Node fills + borders
  primaryColor: "#1a1d24",
  primaryBorderColor: "#2a2e36",
  secondaryColor: "#1a1d24",
  secondaryBorderColor: "#2a2e36",
  tertiaryBorderColor: "#2a2e36",
  clusterBkg: "#15171c",
  clusterBorder: "#2a2e36",
  // Text — all of these matter; Mermaid uses different ones in different diagram modes
  textColor: "#e6e8ec",
  primaryTextColor: "#e6e8ec",
  secondaryTextColor: "#e6e8ec",
  tertiaryTextColor: "#e6e8ec",
  nodeTextColor: "#e6e8ec",
  titleColor: "#e6e8ec",
  // Edges
  lineColor: "#9aa3ad",
  edgeLabelBackground: "#1a1d24",
  // ERD-specific
  attributeBackgroundColorOdd: "#1a1d24",
  attributeBackgroundColorEven: "#15171c",
  // Sequence / state / class diagrams
  actorBkg: "#1a1d24",
  actorBorder: "#2a2e36",
  actorTextColor: "#e6e8ec",
  actorLineColor: "#9aa3ad",
  signalColor: "#e6e8ec",
  signalTextColor: "#e6e8ec",
  labelTextColor: "#e6e8ec",
  loopTextColor: "#e6e8ec",
  noteBkgColor: "#2a2e36",
  noteTextColor: "#e6e8ec",
  noteBorderColor: "#3a3f48",
};

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        // "loose" lets our post-render style overrides actually take effect
        // (strict scrubs inline styles in some Mermaid versions). We never
        // execute user-supplied HTML / scripts because the source comes from
        // our own controlled inputs.
        securityLevel: "loose",
        theme: "base",
        themeVariables: MERMAID_THEME_VARIABLES,
        fontFamily: MERMAID_FONT,
        // Force native SVG <text> rendering everywhere — HTML labels
        // ("foreignObject") often get baked-in inline color styles that
        // ignore themeVariables, which is the root cause of invisible text
        // on dark themes. Native text honors `fill="…"` from themeVariables
        // and survives our post-render style sweep.
        flowchart: { htmlLabels: false },
        sequence: { useMaxWidth: true },
        class: { htmlLabels: false },
        state: { htmlLabels: false },
      } as Parameters<typeof mermaid.initialize>[0]);
      return mermaid;
    });
  }
  return mermaidPromise;
}

/**
 * Post-render sweep: force readable styles on every label-bearing element in
 * the SVG. Mermaid emits a few overlapping conventions (raw `<text>`,
 * `.nodeLabel` / `.edgeLabel` wrapper classes, optional `<foreignObject>`
 * HTML labels), and which one is used depends on diagram type and Mermaid
 * version. We hit them all.
 */
const SVG_LABEL_SELECTORS = [
  "text",
  "tspan",
  ".label",
  ".nodeLabel",
  ".edgeLabel",
  ".edgeLabel span",
  ".edgeLabel div",
  "foreignObject",
  "foreignObject div",
  "foreignObject span",
  // ERD attribute rows
  "g.attribute-row text",
  "g.entity-label text",
  // Sequence diagram labels
  ".messageText",
  ".actor",
  ".labelText",
  ".loopText",
  ".noteText",
] as const;

const FG = "#e6e8ec";
const EDGE_LABEL_BG = "#1a1d24";

function forceLabelVisibility(host: HTMLDivElement): void {
  const svg = host.querySelector("svg");
  if (!svg) return;
  // Ensure the SVG itself doesn't carry a stray opacity/visibility override.
  (svg as SVGElement).style.color = FG;
  (svg as SVGElement).style.opacity = "1";
  (svg as SVGElement).style.visibility = "visible";

  for (const sel of SVG_LABEL_SELECTORS) {
    const nodes = svg.querySelectorAll<SVGElement | HTMLElement>(sel);
    nodes.forEach((node) => {
      // Inline style wins over attributes and over any global stylesheet that
      // might be coercing SVG text to a different color.
      node.style.color = FG;
      node.style.opacity = "1";
      node.style.visibility = "visible";
      // <text> / <tspan> use the SVG `fill` attribute, not `color`. Only set
      // it when the existing fill is empty / transparent / pure black or
      // matches the dark background — never overwrite an explicit colorful
      // fill (e.g. status badges that authors set on purpose).
      const tag = node.tagName.toLowerCase();
      if (tag === "text" || tag === "tspan") {
        const currentFill = (node.getAttribute("fill") || "").trim().toLowerCase();
        if (
          !currentFill ||
          currentFill === "none" ||
          currentFill === "transparent" ||
          currentFill === "#000" ||
          currentFill === "#000000" ||
          currentFill === "black" ||
          currentFill === "rgb(0, 0, 0)" ||
          currentFill === "rgb(0,0,0)"
        ) {
          node.setAttribute("fill", FG);
        }
      }
    });
  }

  // Edge label backgrounds get a readable filler so the line behind them
  // doesn't bleed through the text.
  const edgeBgs = svg.querySelectorAll<SVGElement>(".edgeLabel .label-container, .edgeLabel rect, .labelBkg, foreignObject div");
  edgeBgs.forEach((bg) => {
    if (bg.classList.contains("edgeLabel") || bg.classList.contains("label-container") || bg.classList.contains("labelBkg")) {
      bg.style.background = EDGE_LABEL_BG;
      bg.style.backgroundColor = EDGE_LABEL_BG;
    }
  });
}

/**
 * Decide if Mermaid produced visible labels. Run AFTER `forceLabelVisibility`
 * so we don't false-alarm on text that's there but was previously invisible
 * due to a fill/opacity issue.
 */
function detectLabelsMissing(host: HTMLDivElement): boolean {
  const svg = host.querySelector("svg");
  if (!svg) return false;
  const candidates = svg.querySelectorAll("text, foreignObject, .nodeLabel, .edgeLabel");
  if (candidates.length === 0) {
    // No label-bearing nodes at all — common for tiny diagrams (single node).
    // Don't false-alarm.
    return false;
  }
  for (const node of Array.from(candidates)) {
    const txt = (node.textContent || "").trim();
    if (txt.length > 0) return false;
  }
  return true;
}

export type MermaidStatus = "idle" | "pending" | "ok" | "error";

interface Props {
  source: string;
  className?: string;
  /** Increment to force a re-render */
  rev?: number;
  /** Debounce ms; default 250 */
  debounceMs?: number;
  /** Called after each render attempt — useful for live "Valid Mermaid" indicators */
  onStatusChange?: (status: MermaidStatus, error: string | null) => void;
  /** Center the SVG horizontally in its container */
  center?: boolean;
}

export function MermaidPreview({
  source,
  className,
  rev,
  debounceMs = 250,
  onStatusChange,
  center = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [labelsMissing, setLabelsMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setError(null);
    setLabelsMissing(false);
    onStatusChange?.("pending", null);

    const handle = window.setTimeout(async () => {
      if (cancelled) return;
      const trimmed = source.trim();
      if (!trimmed) {
        if (hostRef.current) hostRef.current.innerHTML = "";
        setPending(false);
        onStatusChange?.("idle", null);
        return;
      }
      try {
        const mermaid = await getMermaid();
        // Always feed a clean copy to avoid stale internal state on syntax errors.
        const id = "mmd-" + Math.random().toString(36).slice(2, 10);
        const { svg } = await mermaid.render(id, trimmed);
        if (cancelled) return;
        if (hostRef.current) {
          hostRef.current.innerHTML = svg;
          // Force readable styles on the freshly-injected SVG BEFORE the
          // missing-label sweep — otherwise label text that was hidden by
          // an inline fill/opacity would falsely register as "missing".
          forceLabelVisibility(hostRef.current);
          setLabelsMissing(detectLabelsMissing(hostRef.current));
        }
        setError(null);
        onStatusChange?.("ok", null);
      } catch (err) {
        if (cancelled) return;
        // Mermaid throws on syntax errors; surface the message rather than crashing.
        if (hostRef.current) hostRef.current.innerHTML = "";
        const message = err instanceof Error ? err.message : "Unknown Mermaid error";
        setError(message);
        onStatusChange?.("error", message);
      } finally {
        if (!cancelled) setPending(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [source, rev, debounceMs, onStatusChange]);

  return (
    <div className={className}>
      {error ? (
        <div className="bg-panel-2 border border-border rounded-md p-3 text-[12.5px] font-mono">
          <div className="text-danger font-semibold mb-1.5">Mermaid syntax error</div>
          <div className="text-fg-muted whitespace-pre-wrap break-words">{error}</div>
        </div>
      ) : (
        <>
          <div
            ref={hostRef}
            className={"mermaid-host" + (center ? " mermaid-host--centered" : "")}
            style={{ overflow: "auto" }}
          />
          {labelsMissing && (
            <div
              className="mt-3 rounded-md border p-3 text-[12.5px]"
              style={{
                borderColor: "color-mix(in srgb, var(--c-warning) 35%, transparent)",
                background: "color-mix(in srgb, var(--c-warning) 10%, transparent)",
                color: "var(--fg)",
              }}
            >
              <div className="font-semibold mb-1" style={{ color: "var(--c-warning)" }}>
                Diagram rendered, but labels may be missing.
              </div>
              <div className="text-fg-muted">
                Check that node IDs have explicit labels (e.g. <code className="font-mono bg-panel-2 border border-border rounded px-1 py-0.5">A[&quot;My label&quot;]</code>)
                and entity/field names are populated.
              </div>
              <details className="mt-2 group">
                <summary className="cursor-pointer select-none text-[12px] text-accent hover:underline list-none inline-flex items-center gap-1">
                  <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                  View Mermaid source
                </summary>
                <pre className="mt-2 bg-panel-2 border border-border rounded-md p-2.5 text-[12px] overflow-auto font-mono" style={{ maxHeight: 220 }}>
                  {source}
                </pre>
              </details>
            </div>
          )}
        </>
      )}
      {pending && !error && (
        <div className="text-[11px] text-fg-subtle mt-1">rendering…</div>
      )}
    </div>
  );
}
