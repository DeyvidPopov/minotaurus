// components/mermaid-preview.tsx — safe client-side Mermaid renderer
"use client";

import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "dark",
        fontFamily: "var(--font-mono)",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

interface Props {
  source: string;
  className?: string;
  /** Increment to force a re-render */
  rev?: number;
  /** Debounce ms; default 250 */
  debounceMs?: number;
}

export function MermaidPreview({ source, className, rev, debounceMs = 250 }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setError(null);

    const handle = window.setTimeout(async () => {
      if (cancelled) return;
      const trimmed = source.trim();
      if (!trimmed) {
        if (hostRef.current) hostRef.current.innerHTML = "";
        setPending(false);
        return;
      }
      try {
        const mermaid = await getMermaid();
        // Always feed a clean copy to avoid stale internal state on syntax errors.
        const id = "mmd-" + Math.random().toString(36).slice(2, 10);
        const { svg } = await mermaid.render(id, trimmed);
        if (cancelled) return;
        if (hostRef.current) hostRef.current.innerHTML = svg;
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Mermaid throws on syntax errors; surface the message rather than crashing.
        if (hostRef.current) hostRef.current.innerHTML = "";
        const message = err instanceof Error ? err.message : "Unknown Mermaid error";
        setError(message);
      } finally {
        if (!cancelled) setPending(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [source, rev, debounceMs]);

  return (
    <div className={className}>
      {error ? (
        <div className="bg-panel-2 border border-border rounded-md p-3 text-[12.5px] font-mono">
          <div className="text-danger font-semibold mb-1.5">Mermaid syntax error</div>
          <div className="text-fg-muted whitespace-pre-wrap break-words">{error}</div>
        </div>
      ) : (
        <div ref={hostRef} className="mermaid-host" style={{ overflow: "auto" }} />
      )}
      {pending && !error && (
        <div className="text-[11px] text-fg-subtle mt-1">rendering…</div>
      )}
    </div>
  );
}
