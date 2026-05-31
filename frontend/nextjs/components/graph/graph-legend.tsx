// components/graph/graph-legend.tsx
"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { TYPE_INFO, ARTIFACT_TYPES, RELATION_TYPES, EDGE_COLOR } from "@/lib/mock-data";
import type { ArtifactType } from "@/lib/types";

interface Props {
  typeFilter: Set<string> | null;
  onToggle: (t: ArtifactType) => void;
  counts: Record<string, number>;
  /** Whether the panel is expanded. When false, only a small reopen pill shows. */
  open: boolean;
  /** Toggles the panel open/closed. */
  onToggleOpen: () => void;
}

export function GraphLegend({ typeFilter, onToggle, counts, open, onToggleOpen }: Props) {
  // Collapsed: a small pill anchored exactly where the legend starts, so the
  // control to reopen is always visible and local to the legend.
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        title="Show legend & filters"
        aria-label="Show legend & filters"
        aria-expanded={false}
        className="absolute left-4 top-4 z-[5] flex items-center gap-1.5 bg-panel border border-border rounded-md px-2 py-1.5 shadow-sm text-[12px] text-fg-muted hover:bg-panel-hover hover:text-fg"
      >
        <PanelLeftOpen size={14} />
        <span>Legend</span>
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-[5] bg-panel border border-border rounded-md p-2.5 w-[220px] max-h-[calc(100%-2rem)] overflow-auto shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="m-0 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Filter by type</h4>
        <button
          type="button"
          onClick={onToggleOpen}
          title="Collapse legend"
          aria-label="Collapse legend"
          aria-expanded={true}
          className="ml-auto -mr-0.5 grid place-items-center w-5 h-5 rounded text-fg-subtle hover:bg-panel-hover hover:text-fg"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-px">
        {ARTIFACT_TYPES.map((t) => {
          const info = TYPE_INFO[t];
          const on = !typeFilter || typeFilter.has(t);
          return (
            <div
              key={t}
              onClick={() => onToggle(t)}
              className="flex items-center gap-2 text-[12.5px] cursor-pointer px-1.5 py-1 rounded hover:bg-panel-hover"
              style={{ opacity: on ? 1 : 0.45 }}
            >
              <span className="w-2.5 h-2.5 rounded-[2px] flex-none" style={{ background: info.color, border: `1px solid color-mix(in srgb, ${info.color} 50%, transparent)` }} />
              <span className="text-fg">{info.label}</span>
              <span className="ml-auto text-fg-subtle text-[11.5px] tabular-nums">{counts[t] || 0}</span>
            </div>
          );
        })}
      </div>
      <hr className="my-2.5 border-border" />
      <h4 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Relations</h4>
      <div className="flex flex-col gap-px">
        {RELATION_TYPES.map((r) => (
          <div key={r} className="flex items-center gap-2 py-1 px-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] flex-none" style={{ background: EDGE_COLOR[r] }} />
            <span className="text-[11.5px] text-fg-muted font-mono">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
