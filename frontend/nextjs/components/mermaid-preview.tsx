// components/mermaid-preview.tsx — safe client-side Mermaid renderer
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ViewportControls } from "@/components/ui/viewport-controls";

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
  // Sequence / state / class diagrams. The visible-blue actorBorder makes
  // the actor boxes legible without making them look like primary nodes.
  actorBkg: "#1a1d24",
  actorBorder: "#5f8fb8",
  actorTextColor: "#e6e8ec",
  actorLineColor: "#9aa3ad",
  signalColor: "#e6e8ec",
  signalTextColor: "#e6e8ec",
  labelBoxBkgColor: "#1a1d24",
  labelBoxBorderColor: "#2a2e36",
  labelTextColor: "#e6e8ec",
  loopTextColor: "#e6e8ec",
  activationBkgColor: "#2a2e36",
  activationBorderColor: "#5f8fb8",
  sequenceNumberColor: "#e6e8ec",
  noteBkgColor: "#111318",
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

  // Sequence diagram actor boxes: some Mermaid versions emit
  // `<rect class="actor">` with a hardcoded light fill (e.g. #ECECFF) that
  // overrides themeVariables and makes white-on-light-grey labels unreadable.
  // Replace those fills explicitly.
  const ACTOR_BG = "#1a1d24";
  const ACTOR_BORDER = "#5f8fb8";
  const NOTE_BG = "#111318";
  svg.querySelectorAll<SVGElement>("rect.actor, line.actor-line").forEach((node) => {
    const tag = node.tagName.toLowerCase();
    if (tag === "rect") {
      node.setAttribute("fill", ACTOR_BG);
      node.setAttribute("stroke", ACTOR_BORDER);
    } else if (tag === "line") {
      node.setAttribute("stroke", "#9aa3ad");
    }
  });
  // The "actor-top" / "actor-bottom" rects in newer Mermaid versions.
  svg.querySelectorAll<SVGElement>("rect.actor-top, rect.actor-bottom, rect.actor-box").forEach((rect) => {
    rect.setAttribute("fill", ACTOR_BG);
    rect.setAttribute("stroke", ACTOR_BORDER);
  });
  // Note boxes.
  svg.querySelectorAll<SVGElement>("rect.note, polygon.labelBox, rect.labelBox").forEach((rect) => {
    rect.setAttribute("fill", NOTE_BG);
    rect.setAttribute("stroke", "#3a3f48");
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
  /** Center the SVG horizontally in its container (static mode only) */
  center?: boolean;
  /**
   * When true, wrap the rendered SVG in a pan/zoom viewport with the shared
   * ViewportControls toolbar (matches the Knowledge Graph's React Flow chrome).
   * The caller is responsible for giving the root a fixed height — e.g.
   * `className="w-full h-[520px]"` — since the viewport fills its container.
   */
  interactive?: boolean;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.2;
const FIT_PADDING = 0.92;

export function MermaidPreview({
  source,
  className,
  rev,
  debounceMs = 250,
  onStatusChange,
  center = true,
  interactive = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [labelsMissing, setLabelsMissing] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [grabbing, setGrabbing] = useState(false);

  // Fit-to-viewport: measure the SVG's natural size against the viewport and
  // compute a centered scale + translate. Briefly resets the host's transform
  // so getBoundingClientRect reads the SVG's intrinsic dimensions, then
  // restores it before committing the new transform to React state.
  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const host = hostRef.current;
    if (!viewport || !host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;
    const prev = host.style.transform;
    host.style.transform = "translate(0,0) scale(1)";
    const svgRect = svg.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    host.style.transform = prev;
    if (svgRect.width === 0 || svgRect.height === 0) return;
    const scale =
      Math.min(vpRect.width / svgRect.width, vpRect.height / svgRect.height) *
      FIT_PADDING;
    const tx = (vpRect.width - svgRect.width * scale) / 2;
    const ty = (vpRect.height - svgRect.height * scale) / 2;
    setTransform({ scale, tx, ty });
  }, []);

  // Zoom around the viewport center: keep the content point currently under
  // the center pinned to the center as scale changes. Without this, our
  // `transform-origin: 0 0` makes the diagram drift toward the top-left on
  // every zoom step.
  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
      if (nextScale === t.scale) return t;
      const viewport = viewportRef.current;
      if (!viewport) return { ...t, scale: nextScale };
      const rect = viewport.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = nextScale / t.scale;
      return {
        scale: nextScale,
        tx: cx - (cx - t.tx) * ratio,
        ty: cy - (cy - t.ty) * ratio,
      };
    });
  }, []);
  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  // Drag-to-pan. We attach the move/up listeners to window (not the viewport)
  // so a drag that leaves the viewport doesn't strand the pan in mid-motion.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!interactive || e.button !== 0) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: transform.tx,
        startTy: transform.ty,
      };
      setGrabbing(true);
    },
    [interactive, transform.tx, transform.ty],
  );

  useEffect(() => {
    if (!interactive) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setTransform((t) => ({
        ...t,
        tx: d.startTx + (e.clientX - d.startX),
        ty: d.startTy + (e.clientY - d.startY),
      }));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setGrabbing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [interactive]);

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
          // Auto-fit in interactive mode so a tiny 3-node flowchart and a
          // sprawling ER diagram both occupy the same visual footprint by
          // default. Defer to the next frame so the SVG has layout.
          if (interactive) {
            requestAnimationFrame(() => fit());
          }
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
  }, [source, rev, debounceMs, onStatusChange, interactive, fit]);

  // Re-fit when the viewport resizes (window resize, sidebar toggle, etc.).
  useEffect(() => {
    if (!interactive) return;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [interactive, fit]);

  return (
    <div className={className}>
      {error ? (
        <div className="bg-panel-2 border border-border rounded-md p-3 text-[12.5px] font-mono">
          <div className="text-danger font-semibold mb-1.5">Mermaid syntax error</div>
          <div className="text-fg-muted whitespace-pre-wrap break-words">{error}</div>
        </div>
      ) : (
        <>
          {interactive ? (
            <div
              ref={viewportRef}
              className={"mermaid-viewport" + (grabbing ? " is-grabbing" : "")}
              onMouseDown={onMouseDown}
            >
              <div
                ref={hostRef}
                className="mermaid-host mermaid-host--interactive"
                style={{
                  transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
                }}
              />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                <ViewportControls
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onFit={fit}
                  canZoomIn={transform.scale < MAX_SCALE}
                  canZoomOut={transform.scale > MIN_SCALE}
                />
              </div>
            </div>
          ) : (
            <div
              ref={hostRef}
              className={"mermaid-host" + (center ? " mermaid-host--centered" : "")}
              style={{ overflow: "auto" }}
            />
          )}
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
