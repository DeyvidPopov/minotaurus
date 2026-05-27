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
        securityLevel: "strict",
        theme: "base",
        themeVariables: MERMAID_THEME_VARIABLES,
        fontFamily: MERMAID_FONT,
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

/**
 * Walk the rendered SVG and decide if Mermaid produced visible labels.
 * We check both <text> nodes (used by flowchart / sequence / class / etc.)
 * and <foreignObject> nodes (used by some label modes that embed HTML).
 * Returns false only when the SVG exists but every text-bearing element is
 * empty — the symptom this fallback is meant to catch.
 */
function detectLabelsMissing(host: HTMLDivElement): boolean {
  const svg = host.querySelector("svg");
  if (!svg) return false;
  const candidates = svg.querySelectorAll("text, foreignObject");
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
